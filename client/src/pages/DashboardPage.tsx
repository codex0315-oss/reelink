import { assetUrl } from '../lib/config'
import { useState, useEffect } from 'react'
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useNotifications, type Notification as NotificationItem } from '../context/NotificationContext'
// The navy ink disappears on a dark sidebar, so the white variant takes over there —
// same crop and size in both, only the ink colour differs.
import logoDark from '../assets/logo-cropped.png'
import logoLight from '../assets/logo-light.png'
import AmicusMark from '../components/AmicusMark'
import {
  fetchMyListings,
  fetchAllListings,
  deleteListing,
  fetchMyReels,
  fetchReelsFeed,
  openConversation,
  downloadReel,
  generateReel,
  regenerateReel,
  deleteReel,
} from '../lib/api'
import CreateListingModal from '../components/CreateListingModal'
import CreateReelModal from '../components/CreateReelModal'
import ReelsFeed from '../components/ReelsFeed'
import ReelsPlayer from '../components/ReelsPlayer'
import DashboardOverview from '../components/DashboardOverview'
import AmicusPanel from '../components/AmicusPanel'
import SettingsView from '../components/SettingsView'
import ListingCard from '../components/ListingCard'
import BrowseView from '../components/BrowseView'
import PropertyDetails from '../components/PropertyDetails'
import MessagesView from '../components/MessagesView'
import MessageToasts from '../components/MessageToasts'
import { useMessages } from '../context/MessagesContext'
import ReelProgressDialog from '../components/ReelProgressDialog'
import { useReelProgress } from '../context/ReelProgressContext'
import ConfirmDialog from '../components/ConfirmDialog'
import BubbleClearance from '../components/BubbleClearance'
import {
  LayoutDashboard,
  ListChecks,
  Search,
  PlayCircle,
  Mail,
  Users,
  Bell,
  Plus,
  ChevronDown,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  Clock,
  ShieldCheck,
} from 'lucide-react'

type Tab = 'dashboard' | 'listings' | 'browse' | 'reels' | 'messages' | 'leads' | 'settings'

/** Profile photo when one is set, otherwise the first letter of the name. */
function Avatar({ user }: { user?: { name?: string; avatarUrl?: string | null } | null }) {
  if (user?.avatarUrl) {
    return (
      <img
        src={assetUrl(user.avatarUrl)}
        alt=""
        className="w-8 h-8 rounded-full object-cover"
      />
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-ink text-app flex items-center justify-center text-xs font-bold">
      {user?.name?.[0]?.toUpperCase() || 'R'}
    </div>
  )
}

type Listing = {
  id: string
  title: string
  description?: string
  price: number
  photoUrls: string[]
  status: string
  listingType: string
  floorArea?: number
  lotArea?: number
  amenities: string[]
  latitude?: number
  longitude?: number
  publishToFacebook: boolean
  panoramaUrls?: string[]
  user?: { id: string; name: string; avatarUrl?: string | null }
}

type Reel = {
  id: string
  listingId: string | null
  videoUrl?: string
  status: string
  createdAt: string
  // The AI headline burned into the video, offered as a copyable caption.
  hook?: string | null
  // Set on reels created through the AI flow, which have no listing behind them.
  title?: string
  price?: number
  propertyStatus?: string | null
  listingType?: string | null
  listing?: { id: string; title: string; price: number; listingType: string }
  /** Only present on the public feed, where reels come from other users too. */
  user?: { id: string; name: string; avatarUrl?: string | null; phone?: string | null }
}

const navItems: { key: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'listings', label: 'My Listings', icon: ListChecks },
  { key: 'browse', label: 'Browse Properties', icon: Search },
  { key: 'reels', label: 'Reels', icon: PlayCircle },
  { key: 'messages', label: 'Messages', icon: Mail },
  { key: 'leads', label: 'Leads', icon: Users },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
]

export default function DashboardPage() {
  const { logout, user, token } = useAuth()
  const { isLight } = useTheme()
  const navigate = useNavigate()

  // Emails link to /dashboard?conversation=<id>, so the thread opens on arrival.
  const [searchParams, setSearchParams] = useSearchParams()

  // /dashboard/property/:id renders inside this shell instead of the active tab.
  const propertyId = useMatch('/dashboard/property/:id')?.params.id ?? null

  const [browseListings, setBrowseListings] = useState<Listing[]>([])
  const [browseLoading, setBrowseLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingListing, setEditingListing] = useState<Listing | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [listingsLoading, setListingsLoading] = useState(true)
  const [reels, setReels] = useState<Reel[]>([])
  const [showCreateReelModal, setShowCreateReelModal] = useState(false)
  const [showAmicus, setShowAmicus] = useState(false)
  // Collapsed to just its title bar, the way a Messenger window parks itself.
  const [amicusMinimized, setAmicusMinimized] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [reelsView, setReelsView] = useState<'player' | 'feed'>('player')
  // Everyone's reels, as opposed to `reels`, which is only the user's own.
  const [feedReels, setFeedReels] = useState<Reel[]>([])
  // Starts true so the first paint is a spinner, not "no reels" — the feed is now
  // reachable with an empty library, and flashing an empty state at someone who is
  // about to be shown a dozen reels reads as a broken screen.
  const [feedLoading, setFeedLoading] = useState(true)
  // Set when a property's Message button opens a thread, so Messages can select it.
  const [openConversationId, setOpenConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [downloadingReel, setDownloadingReel] = useState<string | null>(null)

  const [deletingListing, setDeletingListing] = useState<Listing | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deletingReel, setDeletingReel] = useState<Reel | null>(null)
  const [deleteReelLoading, setDeleteReelLoading] = useState(false)

  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const { unreadCount: unreadMessages, openThread } = useMessages()
  const { onFinish } = useReelProgress()

  async function loadBrowseListings() {
    setBrowseLoading(true)
    try {
      const data = await fetchAllListings()
      setBrowseListings(data)
    } catch {
      // fail silently for now
    } finally {
      setBrowseLoading(false)
    }
  }

  useEffect(() => {
    loadBrowseListings()
  }, [])

  // Landing from an offline-message email. The param is cleared once used so a
  // refresh doesn't keep yanking the user back into the same thread.
  useEffect(() => {
    const wanted = searchParams.get('conversation')
    if (!wanted) return
    setActiveTab('messages')
    setOpenConversationId(wanted)
    searchParams.delete('conversation')
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, setSearchParams])

  async function loadListings() {
    if (!token) return
    setListingsLoading(true)
    try {
      const data = await fetchMyListings(token)
      setListings(data)
    } catch {
      // fail silently for now
    } finally {
      setListingsLoading(false)
    }
  }

  useEffect(() => {
    loadListings()
  }, [token])

  async function loadReels() {
    if (!token) return
    try {
      const data = await fetchMyReels(token)
      setReels(data)
    } catch {
      // fail silently for now
    }
  }

  useEffect(() => {
    loadReels()
  }, [token])

  // Loaded only when the feed is actually on screen — no reason to pull everyone
  // else's reels while the user is looking at their own library.
  useEffect(() => {
    if (!token || activeTab !== 'reels' || reelsView !== 'feed') return
    setFeedLoading(true)
    fetchReelsFeed(token)
      .then(setFeedReels)
      .catch(() => undefined)
      .finally(() => setFeedLoading(false))
  }, [token, activeTab, reelsView])

  // The socket says when a render finishes, so the list refetches once at the right
  // moment instead of every five seconds. The poll stays as a safety net in case the
  // socket drops mid-render, but at a much calmer interval.
  useEffect(() => onFinish(() => void loadReels()), [onFinish, token])

  useEffect(() => {
    const hasProcessing = reels.some((r) => r.status === 'processing')
    if (!hasProcessing) return
    const interval = setInterval(loadReels, 20000)
    return () => clearInterval(interval)
  }, [reels, token])

  // Inline action from the dashboard, so the main job is one click from the home screen.
  async function handleGenerateReelFor(listingId: string) {
    if (!token) return
    try {
      await generateReel(token, listingId)
      await loadReels()
      setActiveTab('reels')
    } catch {
      // fail silently for now
    }
  }

  async function handleRegenerateReel(reelId: string) {
    if (!token) return
    try {
      await regenerateReel(token, reelId)
      await loadReels()
    } catch {
      // fail silently for now
    }
  }

  /** Deleting a reel is permanent, so it goes through the same confirm as a listing. */
  function requestDeleteReel(reelId: string) {
    const reel = reels.find((r) => r.id === reelId)
    if (reel) setDeletingReel(reel)
  }

  async function confirmDeleteReel() {
    if (!token || !deletingReel) return
    setDeleteReelLoading(true)
    try {
      await deleteReel(token, deletingReel.id)
      await loadReels()
      setDeletingReel(null)
    } catch {
      // fail silently for now
    } finally {
      setDeleteReelLoading(false)
    }
  }

  async function handleDownloadReel(reelId: string) {
    if (!token) return
    setDownloadingReel(reelId)
    try {
      await downloadReel(token, reelId)
    } catch {
      // fail silently for now
    } finally {
      setDownloadingReel(null)
    }
  }

  /**
   * The Message button on a property. Opens (or reuses) the thread with its owner,
   * then lands the user in Messages with that conversation already selected.
   */
  /**
   * Tapping a notification opens the thing it is about, not just the tab it belongs to.
   *
   * `entityId` carries the conversation, listing or reel id from the server. When it is
   * missing — an older row, or a target that has since been deleted — this still lands
   * on the right section rather than doing nothing, which is the failure the user is
   * least able to explain.
   */
  function openNotification(n: NotificationItem) {
    markRead(n.id)
    setShowNotifications(false)

    switch (n.type) {
      case 'message':
        setActiveTab('messages')
        if (n.entityId) setOpenConversationId(n.entityId)
        if (propertyId) navigate('/dashboard')
        break

      case 'listing':
        // Straight to the property page when we know which one.
        if (n.entityId) navigate(`/dashboard/property/${n.entityId}`)
        else {
          setActiveTab('browse')
          if (propertyId) navigate('/dashboard')
        }
        break

      case 'reel':
        setActiveTab('reels')
        setReelsView('player')
        if (propertyId) navigate('/dashboard')
        break

      default:
        break
    }
  }

  async function handleMessageSeller(listingId: string) {
    if (!token) return
    try {
      const conversation = await openConversation(token, listingId)
      setOpenConversationId(conversation.id)
      setActiveTab('messages')
      navigate('/dashboard')
    } catch {
      // fail silently for now
    }
  }

  async function handleListingCreated() {
    await Promise.all([loadListings(), loadBrowseListings()])
  }

  async function confirmDeleteListing() {
    if (!token || !deletingListing) return
    setDeleteLoading(true)
    try {
      await deleteListing(token, deletingListing.id)
      await Promise.all([loadListings(), loadBrowseListings()])
      setDeletingListing(null)
      // Deleting from the property page would otherwise leave a 404 on screen.
      if (propertyId === deletingListing.id) {
        setActiveTab('browse')
        navigate('/dashboard')
      }
    } catch {
      // fail silently for now
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    // h-screen (not min-h-screen) so only <main> scrolls; otherwise the whole page
    // scrolls and the sidebar - including Amicus AI - slides away with it.
    <div className="h-[100dvh] bg-app flex overflow-hidden">
      {/* Dims the content while the drawer is open on small screens */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-navy-dark/40 z-30 lg:hidden"
        />
      )}

      {/* Sidebar: a slide-in drawer below lg, a fixed column from lg up */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 shrink-0 bg-card border-r border-ink/10 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center justify-between lg:justify-center px-5 lg:px-6 border-b border-ink/10">
          {/* Both files are the tight crop, so one height works for either theme —
              the old padded logo.png needed h-35 just to render ~30px of ink. */}
          <img src={isLight ? logoDark : logoLight} alt="Reelink" className="h-8 w-auto object-contain" />
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-ink/40 hover:bg-ink/5"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                onClick={() => {
                  setActiveTab(item.key)
                  // Leave the property page too, or the tab would change behind it.
                  if (propertyId) navigate('/dashboard')
                  setSidebarOpen(false) // a tap on mobile should close the drawer
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  // A property page is reached from Browse, so Browse stays lit.
                  (propertyId ? 'browse' : activeTab) === item.key
                    ? 'bg-ink text-app'
                    : 'text-ink/60 hover:bg-ink/5 hover:text-ink'
                }`}
              >
                <Icon size={18} strokeWidth={2} />
                {item.label}
                {/* Unread count, so a waiting buyer is visible from any tab. */}
                {item.key === 'messages' && unreadMessages > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-navy-dark text-[10px] font-extrabold flex items-center justify-center">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="px-3 pb-3">
          <button
            onClick={() => {
              // Un-park as well as open, or this does nothing when the window is
              // already open but collapsed to its title bar.
              setShowAmicus(true)
              setAmicusMinimized(false)
            }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-gold/10 border border-gold/20 hover:bg-gold/15 transition-all"
          >
            <AmicusMark alt="Amicus AI" className="w-8 h-8 rounded-full object-cover" />
            <div className="text-left">
              <div className="text-sm font-bold text-ink">Amicus AI</div>
              <div className="text-xs text-ink/50">Ask about real estate</div>
            </div>
          </button>
        </div>

        {/* Only staff see this. It is a convenience, not the security boundary — the
            page and every endpoint behind it check the role themselves. */}
        {user?.role === 'admin' && (
          <div className="px-3 pb-1">
            <button
              onClick={() => navigate('/admin')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-ink/60 hover:bg-ink/5 transition-all"
            >
              <ShieldCheck size={18} />
              Admin
            </button>
          </div>
        )}

        <div className="px-3 py-4 border-t border-ink/10">
          <button
            onClick={logout}
            className="w-full flex justify-center px-3 py-2.5 rounded-lg text-sm font-semibold text-ink/50 hover:bg-red-500/10 hover:text-danger transition-all"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 bg-card border-b border-ink/10 flex items-center justify-between px-4 sm:px-6 lg:px-8 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="lg:hidden w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-ink/60 hover:bg-ink/5 transition-all"
            >
              <Menu size={20} />
            </button>
            {/* Full field on desktop, icon-only once space is tight */}
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-ink/5 text-sm text-ink/40 w-48 md:w-72 max-w-full">
              <Search size={16} />
              <span className="truncate">Search anything...</span>
            </div>
            <button
              aria-label="Search"
              className="sm:hidden w-9 h-9 rounded-lg flex items-center justify-center text-ink/50 hover:bg-ink/5"
            >
              <Search size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative">
              <button
                onClick={() => setShowNotifications((s) => !s)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-ink/50 hover:bg-ink/5 hover:text-ink transition-all relative"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-gold text-navy-dark text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  {/* Tap-away to close, the same as the user menu beside it. Matters more
                      now the panel is a full-width sheet on a phone: without it the only
                      way out was to find the bell again underneath. */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowNotifications(false)}
                  />
                {/* A 320px panel anchored to the bell put its left edge off the side of a
                    360px phone, which is why the titles were sliced in half. Below sm: it
                    is a viewport-width sheet under the 4rem header instead; from sm: up it
                    goes back to being a dropdown hanging off the bell. */}
                <div className="fixed left-3 right-3 top-[4.25rem] sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-80 bg-card rounded-xl border border-ink/10 shadow-lg z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
                    <span className="font-bold text-sm text-ink">Notifications</span>
                    <button onClick={markAllRead} className="text-xs font-semibold text-gold-dark hover:text-gold-dark/70">
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-ink/40">No notifications yet</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => openNotification(n)}
                          className={`w-full text-left px-4 py-3 border-b border-ink/5 hover:bg-ink/5 transition-all ${
                            n.read ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="text-sm font-semibold text-ink">{n.title}</div>
                          {n.body && <div className="text-xs text-ink/50 mt-0.5">{n.body}</div>}
                        </button>
                      ))
                    )}
                  </div>
                </div>
                </>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowUserMenu((s) => !s)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-ink/5 transition-all"
              >
                <Avatar user={user} />
                <ChevronDown
                  size={14}
                  className={`text-ink/40 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                />
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-card rounded-xl border border-ink/10 shadow-xl z-20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-ink/5">
                      <div className="text-sm font-bold text-ink truncate">
                        {user?.name}
                      </div>
                      <div className="text-xs text-ink/45 truncate">{user?.email}</div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab('settings')
                        setShowUserMenu(false)
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:bg-ink/5 hover:text-ink transition-all"
                    >
                      <SettingsIcon size={15} />
                      Settings
                    </button>
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:bg-red-500/10 hover:text-danger transition-all border-t border-ink/5"
                    >
                      <LogOut size={15} />
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* min-w-0 matters as much as min-h-0 here. A flex item defaults to
            min-width:auto, so without it <main> refuses to shrink below the widest thing
            inside it and grows past the viewport — which is why the left edge of every
            card was cut off on a phone. overflow-x-hidden is the backstop: one long
            unbroken string should never be able to shove the whole layout sideways. */}
        <main className="flex-1 min-w-0 min-h-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 overflow-y-auto overflow-x-hidden">
          {/* A property page replaces the tab content but keeps the shell around it. */}
          {propertyId && (
            <PropertyDetails
              listingId={propertyId}
              onBack={() => {
                setActiveTab('browse')
                navigate('/dashboard')
              }}
              // The API returns the full listing; the cast only bridges the two
              // local shapes, which differ in optionality rather than in content.
              onEdit={(l) => setEditingListing(l as Listing)}
              onDelete={(l) => setDeletingListing(l as Listing)}
              onMessageSeller={handleMessageSeller}
            />
          )}
          {propertyId && <BubbleClearance />}

          {!propertyId && activeTab === 'dashboard' && (
            <DashboardOverview
              userName={user?.name}
              listings={listings}
              reels={reels}
              downloadingReel={downloadingReel}
              onNewListing={() => setShowCreateModal(true)}
              onNewReel={() => setShowCreateReelModal(true)}
              onGenerateReelFor={handleGenerateReelFor}
              onEditListing={(id) => {
                const listing = listings.find((l) => l.id === id)
                if (listing) setEditingListing(listing)
              }}
              onDownloadReel={handleDownloadReel}
              onGoToListings={() => setActiveTab('listings')}
              onGoToReels={() => setActiveTab('reels')}
              onGoToMessages={() => setActiveTab('messages')}
            />
          )}

          {!propertyId && activeTab === 'listings' && (
            <div>
              {/* Stacks on a phone rather than squeezing side by side — at 360px the
                  button was being compressed until "Create Listing" wrapped onto two
                  lines. Same pattern as the dashboard header above. */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-ink">My Listings</h1>
                  <p className="text-sm text-ink/50">Manage the properties you've listed on Reelink.</p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg bg-gold text-navy-dark text-sm font-semibold hover:bg-gold-dark sm:hover:-translate-y-0.5 transition-all active:scale-95"
                >
                  <Plus size={16} strokeWidth={2.5} />
                  Create Listing
                </button>
              </div>

              {listingsLoading ? (
                <div className="text-center py-20 text-ink/40 text-sm">Loading...</div>
              ) : listings.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="No listings yet"
                  description="Create your first property listing to get started. You'll be able to generate an AI description and reel from it."
                />
              ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {listings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      isOwner
                      onClick={() => {}}
                      onEdit={() => setEditingListing(listing)}
                      onDelete={() => setDeletingListing(listing)}
                    />
                  ))}
                </div>
              )}
              <BubbleClearance />
            </div>
          )}

          {!propertyId && activeTab === 'browse' && (
            <BrowseView listings={browseListings} loading={browseLoading} />
          )}

          {!propertyId && activeTab === 'reels' && (
            <div>
              {/* Same stacking as My Listings — a view toggle and a button alongside the
                  text do not fit a 360px screen in one row. */}
              <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-ink">Reels</h1>
                  <p className="text-sm text-ink/50">
                    Your AI-generated marketing videos, ready to post to Facebook.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  {/* Shown even with an empty library. Gating this on the user's own
                      reels meant a new agent — the person most helped by seeing what
                      good reels look like — had no way to reach the community feed at
                      all, because the toggle only appeared once they no longer needed
                      it. */}
                  <div className="flex p-1 rounded-xl bg-ink/5 border border-ink/10">
                    {([
                      ['player', 'Player'],
                      ['feed', 'Feed'],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => setReelsView(mode)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          reelsView === mode
                            ? 'bg-card text-ink shadow-sm'
                            : 'text-ink/45 hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowCreateReelModal(true)}
                    className="flex items-center justify-center gap-2 flex-1 sm:flex-none whitespace-nowrap px-4 py-2.5 rounded-xl bg-gold text-navy-dark text-sm font-semibold hover:bg-gold-dark transition-all active:scale-95"
                  >
                    <Plus size={16} />
                    Create Reel
                  </button>
                </div>
              </div>

              {/* The feed is checked before the empty library, so "no reels of your
                  own" no longer hides everyone else's. */}
              {reelsView === 'feed' ? (
                <ReelsFeed
                  reels={feedReels}
                  loading={feedLoading}
                  downloadingReel={downloadingReel}
                  onDownload={handleDownloadReel}
                  currentUserId={user?.id}
                  onOpenListing={(id) => navigate(`/dashboard/property/${id}`)}
                />
              ) : reels.length === 0 ? (
                <EmptyState
                  icon={PlayCircle}
                  title="No reels yet"
                  description="Create a reel from one of your listings, or let Amicus AI build one from photos and details you provide. Switch to Feed to see what other agents are posting."
                />
              ) : (
                <ReelsPlayer
                  reels={reels}
                  downloadingReel={downloadingReel}
                  onDownload={handleDownloadReel}
                  onRegenerate={handleRegenerateReel}
                  onDelete={requestDeleteReel}
                />
              )}
            </div>
          )}

          {!propertyId && activeTab === 'messages' && (
            <div>
              <div className="mb-5">
                <h1 className="text-lg font-bold text-ink">Messages</h1>
                <p className="text-sm text-ink/50">
                  Conversations with buyers interested in your properties.
                </p>
              </div>
              <MessagesView
                openConversationId={openConversationId}
                onOpenedConversation={() => setOpenConversationId(null)}
                onOpenListing={(id) => navigate(`/dashboard/property/${id}`)}
              />
            </div>
          )}

          {!propertyId && activeTab === 'leads' && (
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg font-bold text-ink">Leads</h1>
                  <ComingSoonBadge />
                </div>
                <p className="text-sm text-ink/50">
                  Comments from Facebook, synced here as buyers reply to your reels.
                </p>
              </div>
              <EmptyState
                icon={Users}
                comingSoon
                title="Lead syncing is in development"
                description="Once the Facebook integration is connected, comments on your published listings and reels will turn into leads you can track here."
              />
            </div>
          )}

          {!propertyId && activeTab === 'settings' && (
            <>
              <SettingsView />
              <BubbleClearance />
            </>
          )}
        </main>
      </div>

      {(showCreateModal || editingListing) && (
        <CreateListingModal
          onClose={() => {
            setShowCreateModal(false)
            setEditingListing(null)
          }}
          onCreated={handleListingCreated}
          editListing={editingListing ?? undefined}
        />
      )}

      {showCreateReelModal && token && (
        <CreateReelModal
          token={token}
          listings={listings}
          onClose={() => setShowCreateReelModal(false)}
          onCreated={loadReels}
        />
      )}

      {/* Reel render progress, and the success card when it finishes. */}
      <ReelProgressDialog
        onViewReel={() => {
          setActiveTab('reels')
          setReelsView('player')
          if (propertyId) navigate('/dashboard')
        }}
      />

      {/* Incoming-message popups. Clicking one lands you in that thread. */}
      <MessageToasts
        onOpenConversation={(conversationId) => {
          setActiveTab('messages')
          if (propertyId) navigate('/dashboard')
          openThread(conversationId)
        }}
      />

      {token && (
        <AmicusPanel
          token={token}
          open={showAmicus}
          onOpen={() => setShowAmicus(true)}
          onClose={() => setShowAmicus(false)}
          minimized={amicusMinimized}
          onMinimizedChange={setAmicusMinimized}
        />
      )}

      <ConfirmDialog
        open={!!deletingListing}
        title="Delete this listing?"
        description={`"${deletingListing?.title ?? ''}" will be permanently removed, along with any reels and leads tied to it. This cannot be undone.`}
        confirmLabel="Delete Listing"
        danger
        loading={deleteLoading}
        onConfirm={confirmDeleteListing}
        onCancel={() => setDeletingListing(null)}
      />

      {/* Same dialog as listings — deleting a reel throws away a rendered video. */}
      <ConfirmDialog
        open={!!deletingReel}
        title="Delete this reel?"
        description={`The video for "${
          deletingReel?.listing?.title ?? deletingReel?.title ?? 'this reel'
        }" will be permanently removed. You can generate a new one from the same photos afterwards.`}
        confirmLabel="Delete Reel"
        danger
        loading={deleteReelLoading}
        onConfirm={confirmDeleteReel}
        onCancel={() => setDeletingReel(null)}
      />
    </div>
  )
}

/** Same badge the Settings "Connections" rows use, so unbuilt features read alike. */
function ComingSoonBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wide bg-gold/15 text-gold-dark border border-gold/25 ${className}`}
    >
      <Clock size={11} />
      Coming soon
    </span>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  comingSoon,
}: {
  icon: typeof ListChecks
  title: string
  description: string
  actionLabel?: string
  /** Marks a screen that is waiting on a feature rather than on the user's data. */
  comingSoon?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 max-w-md mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 mb-5 flex items-center justify-center">
        <Icon size={22} className="text-gold-dark" />
      </div>
      {comingSoon && <ComingSoonBadge className="mb-3" />}
      <h2 className="font-bold text-ink text-lg mb-2">{title}</h2>
      <p className="text-sm text-ink/50 leading-relaxed mb-6">{description}</p>
      {actionLabel && (
        <button className="px-5 py-2.5 rounded-lg bg-ink text-app text-sm font-semibold hover:bg-ink/85 hover:-translate-y-0.5 transition-all active:scale-95">
          {actionLabel}
        </button>
      )}
    </div>
  )
}