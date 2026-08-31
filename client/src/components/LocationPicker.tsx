import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Search } from 'lucide-react'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

type Props = {
  latitude: number | null
  longitude: number | null
  onChange: (lat: number, lng: number) => void
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function FlyTo({ position }: { position: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (position) map.flyTo(position, 15)
  }, [position, map])
  return null
}

export default function LocationPicker({ latitude, longitude, onChange }: Props) {
  const defaultCenter: [number, number] = [10.3157, 123.8854]
  const center: [number, number] =
    latitude !== null && longitude !== null ? [latitude, longitude] : defaultCenter

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ display_name: string; lat: string; lon: string }[]>([])
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  const [searching, setSearching] = useState(false)

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
      )
      setResults(await res.json())
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  function selectResult(r: { lat: string; lon: string }) {
    const lat = parseFloat(r.lat)
    const lon = parseFloat(r.lon)
    onChange(lat, lon)
    setFlyTarget([lat, lon])
    setResults([])
    setQuery('')
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSearch()
              }
            }}
            placeholder="Search a location..."
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-ink/15 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="px-3 py-2 rounded-lg bg-ink text-app text-xs font-semibold hover:bg-ink/85 transition-all disabled:opacity-50"
        >
          {searching ? '...' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="mb-2 rounded-lg border border-ink/15 overflow-hidden">
          {results.map((r, i) => (
            <button
              type="button"
              key={i}
              onClick={() => selectResult(r)}
              className="w-full text-left px-3 py-2 text-xs text-ink hover:bg-ink/5 border-b border-ink/5 last:border-0"
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg overflow-hidden border border-ink/15 h-56">
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onChange={onChange} />
          <FlyTo position={flyTarget} />
          {latitude !== null && longitude !== null && <Marker position={[latitude, longitude]} />}
        </MapContainer>
      </div>
    </div>
  )
}