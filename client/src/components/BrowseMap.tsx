import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { assetUrl } from '../lib/config'

export type MapListing = {
  id: string
  title: string
  price: number
  listingType: string
  photoUrls: string[]
  latitude?: number | null
  longitude?: number | null
}

type Props = {
  listings: MapListing[]
  hoveredId: string | null
  selectedId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

/** Cebu City, so an empty map still opens somewhere meaningful. */
const FALLBACK_CENTER: [number, number] = [10.3157, 123.8854]

const short = (price: number) =>
  price >= 1_000_000
    ? `₱${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 1)}M`
    : price >= 1000
      ? `₱${Math.round(price / 1000)}K`
      : `₱${price}`

/**
 * The pin carries a thumbnail as well as the price, so the map is scannable on its
 * own — a column of identical price bubbles tells a buyer very little.
 */
function pricePill(label: string, active: boolean, photoUrl?: string) {
  const bg = active ? '#F0A93B' : 'var(--card)'
  const fg = active ? '#070D1B' : 'var(--ink)'
  const thumb = photoUrl
    ? `<img src="${photoUrl}" alt="" style="
        width:26px; height:26px; border-radius:7px; object-fit:cover;
        margin:-2px 2px -2px -4px; flex:0 0 auto;
        background:rgba(127,127,127,0.2);" />`
    : ''

  return L.divIcon({
    className: '',
    html: `<div style="
      transform: translate(-50%, -100%)${active ? ' scale(1.1)' : ''};
      display:inline-flex; align-items:center; gap:4px; white-space:nowrap;
      background:${bg}; color:${fg};
      font-weight:800; font-size:12px; font-family:'DM Sans',sans-serif;
      padding:4px 10px 4px 6px; border-radius:999px;
      border:1.5px solid ${active ? '#D6901F' : 'color-mix(in srgb, var(--ink) 15%, transparent)'};
      box-shadow:0 4px 14px rgba(7,13,27,${active ? '0.35' : '0.18'});
    ">${thumb}<span>${label}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

function clusterBubble(count: number) {
  return L.divIcon({
    className: '',
    html: `<div style="
      transform: translate(-50%, -50%);
      display:flex; align-items:center; justify-content:center;
      width:44px; height:44px; border-radius:999px;
      background:#0B2952; color:#fff;
      font-weight:800; font-size:14px; font-family:'DM Sans',sans-serif;
      border:3px solid rgba(240,169,59,0.9);
      box-shadow:0 6px 18px rgba(7,13,27,0.35);
    ">${count}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

/** A listing that is safe to hand to Leaflet: real, in-range coordinates. */
type PlacedListing = MapListing & { latitude: number; longitude: number }

/**
 * `typeof NaN === 'number'` is true, so the obvious check let NaN through and Leaflet
 * threw "Invalid LatLng object: (NaN, NaN)", taking the whole map component down with
 * it. Number.isFinite rejects NaN, Infinity, null and undefined in one go.
 *
 * The range check is the second half: a latitude of 500 is finite but not a place, and
 * a single bad row would otherwise drag fitBounds off the edge of the world.
 */
function isPlaced(l: MapListing): l is PlacedListing {
  return (
    Number.isFinite(l.latitude) &&
    Number.isFinite(l.longitude) &&
    Math.abs(l.latitude as number) <= 90 &&
    Math.abs(l.longitude as number) <= 180
  )
}

export default function BrowseMap(props: Props) {
  const mapped = props.listings.filter(isPlaced)

  const center: [number, number] = mapped.length
    ? [mapped[0].latitude, mapped[0].longitude]
    : FALLBACK_CENTER

  return (
    <MapContainer
      center={center}
      zoom={12}
      scrollWheelZoom
      className="w-full h-full rounded-2xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapContents {...props} mapped={mapped} />
    </MapContainer>
  )
}

function MapContents({
  mapped,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: Props & { mapped: PlacedListing[] }) {
  const map = useMap()
  // Recomputed on every move so clustering stays pixel-accurate at any zoom.
  const [version, setVersion] = useState(0)

  useMapEvents({
    moveend: () => setVersion((v) => v + 1),
    zoomend: () => setVersion((v) => v + 1),
  })

  // Fit to all pins once, so the first view frames the whole set.
  useEffect(() => {
    if (mapped.length === 0) return
    if (mapped.length === 1) {
      map.setView([mapped[0].latitude, mapped[0].longitude], 14)
      return
    }
    map.fitBounds(
      L.latLngBounds(mapped.map((l) => [l.latitude, l.longitude])),
      { padding: [60, 60], maxZoom: 15 },
    )
    // Only when the set of pins actually changes, not on every pan.
  }, [map, mapped.map((l) => l.id).join(',')])

  // Selecting a card flies the map to that property.
  //
  // The list is read through a ref rather than the dependency array: `mapped` is a
  // fresh array on every render, and flying the map fires moveend, which bumps
  // `version` and renders again — so depending on it made the effect re-fly on its
  // own output, which is what made the map judder after a card was clicked.
  const mappedRef = useRef(mapped)
  mappedRef.current = mapped

  useEffect(() => {
    if (!selectedId) return
    const target = mappedRef.current.find((l) => l.id === selectedId)
    if (!target) return
    map.flyTo(
      [target.latitude, target.longitude],
      Math.max(map.getZoom(), 15),
      { duration: 0.6 },
    )
  }, [selectedId, map])

  /**
   * Grid-free, pixel-distance clustering. react-leaflet 5 has no maintained cluster
   * plugin, and this is a few lines rather than a dependency risk.
   */
  const groups = useMemo(() => {
    const pts = mapped.map((l) => ({
      listing: l,
      p: map.latLngToContainerPoint([l.latitude, l.longitude]),
    }))
    const used = new Set<number>()
    const out: PlacedListing[][] = []

    for (let i = 0; i < pts.length; i++) {
      if (used.has(i)) continue
      used.add(i)
      const group = [pts[i].listing]
      for (let j = i + 1; j < pts.length; j++) {
        if (used.has(j)) continue
        const dx = pts[i].p.x - pts[j].p.x
        const dy = pts[i].p.y - pts[j].p.y
        // Wider than the old 64: the pins now carry a thumbnail, so they overlap
        // sooner and need to collapse into a cluster earlier.
        if (Math.hypot(dx, dy) < 96) {
          used.add(j)
          group.push(pts[j].listing)
        }
      }
      out.push(group)
    }
    return out
  }, [mapped, version, map])

  return (
    <>
      {groups.map((group) => {
        const head = group[0]
        const position: [number, number] = [head.latitude, head.longitude]

        if (group.length > 1) {
          return (
            <Marker
              key={`cluster-${head.id}`}
              position={position}
              icon={clusterBubble(group.length)}
              eventHandlers={{
                click: () => map.flyTo(position, map.getZoom() + 2, { duration: 0.5 }),
              }}
            />
          )
        }

        const active = hoveredId === head.id || selectedId === head.id
        return (
          <Marker
            key={head.id}
            position={position}
            icon={pricePill(
              short(head.price),
              active,
              head.photoUrls[0] ? assetUrl(head.photoUrls[0]) : undefined,
            )}
            zIndexOffset={active ? 1000 : 0}
            eventHandlers={{
              mouseover: () => onHover(head.id),
              mouseout: () => onHover(null),
              click: () => onSelect(head.id),
            }}
          >
            <Popup>
              <div style={{ width: 190 }}>
                {head.photoUrls[0] && (
                  <img
                    src={assetUrl(head.photoUrls[0])}
                    alt=""
                    style={{
                      width: '100%',
                      height: 96,
                      objectFit: 'cover',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  />
                )}
                <div style={{ fontWeight: 800, color: 'var(--ink)', fontSize: 14 }}>
                  ₱{Number(head.price).toLocaleString()}
                  {head.listingType === 'rent' && (
                    <span style={{ fontWeight: 500, fontSize: 11 }}> /mo</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink)', opacity: 0.7 }}>{head.title}</div>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}
