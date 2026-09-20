import { useNavigate, useParams } from 'react-router-dom'
import PropertyDetails from '../components/PropertyDetails'
import PublicChrome from '../components/PublicChrome'
import { useAuth } from '../context/AuthContext'
import { openConversation } from '../lib/api'

/**
 * A property, readable without an account.
 *
 * The listing endpoints were already public; only the interface was behind a login, so
 * anything shared out of Reelink led a buyer to a sign-in form rather than the property
 * they were sent. This is the page that link should have opened all along.
 *
 * PropertyDetails needs no changes to work here. It gates the owner's edit and delete
 * controls on isOwner, and a signed-out visitor is never the owner, so the same
 * component serves both audiences.
 */
export default function PropertyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { token } = useAuth()

  if (!id) return null

  /**
   * Messaging is the one thing that genuinely needs an account — a thread has to
   * belong to somebody. A signed-out visitor is sent to sign in and returned here
   * afterwards, rather than being asked to register before seeing anything.
   */
  async function handleMessage(listingId: string) {
    if (!token) {
      navigate('/login', { state: { from: `/property/${listingId}` } })
      return
    }
    try {
      const conversation = await openConversation(token, listingId)
      navigate(`/dashboard?conversation=${conversation.id}`)
    } catch {
      // Their own listing, or the connection. Either way the dashboard's inbox is the
      // right place to land, and it explains itself better than a toast here would.
      navigate('/dashboard')
    }
  }

  return (
    <PublicChrome>
      <div className="max-w-reading mx-auto px-5 sm:px-8 py-8">
        <PropertyDetails
          listingId={id}
          onBack={() => navigate(-1)}
          // Never reachable for a visitor, and an owner arriving here can edit from
          // their own dashboard where the form already lives.
          onEdit={() => navigate('/dashboard')}
          onDelete={() => navigate('/dashboard')}
          onMessageSeller={handleMessage}
        />
      </div>
    </PublicChrome>
  )
}
