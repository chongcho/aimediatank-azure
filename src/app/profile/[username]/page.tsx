'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import MediaCard from '@/components/MediaCard'
import AdSense from '@/components/AdSense'

interface UserProfile {
  id: string
  username: string
  name: string | null
  avatar: string | null
  bio: string | null
  role: string
  createdAt: string
  media: Array<{
    id: string
    title: string
    type: 'VIDEO' | 'IMAGE' | 'MUSIC'
    url: string
    thumbnailUrl: string | null
    views: number
    avgRating: number
    createdAt: string
    aiTool?: string
    price?: number
    user: {
      username: string
      name: string | null
      avatar: string | null
    }
    _count: {
      comments: number
      ratings: number
    }
  }>
  _count: {
    media: number
  }
}

interface Purchase {
  id: string
  amount: number
  createdAt: string
  completedAt: string | null
  media: {
    id: string
    title: string
    type: 'VIDEO' | 'IMAGE' | 'MUSIC'
    url: string
    thumbnailUrl: string | null
    price: number | null
    isSold: boolean
    soldAt: string | null
    deleteAfter: string | null
    user: {
      username: string
      name: string | null
      avatar: string | null
    }
  }
}

export default function ProfilePage() {
  const params = useParams()
  const { data: session } = useSession()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'VIDEO' | 'IMAGE' | 'MUSIC'>('all')
  const [mainSection, setMainSection] = useState<'uploads' | 'purchased' | 'saved'>('uploads')
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [purchasesLoading, setPurchasesLoading] = useState(false)
  const [savedMedia, setSavedMedia] = useState<any[]>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [selectedSaved, setSelectedSaved] = useState<Set<string>>(new Set())
  const [unsaving, setUnsaving] = useState(false)

  // Get username from params - handle both string and array
  const username = Array.isArray(params.username) ? params.username[0] : params.username
  const decodedUsername = username ? decodeURIComponent(username) : ''

  // Check if viewing own profile - match by username OR email
  const isOwnProfile = !!(
    session?.user && 
    (session.user.username === decodedUsername || 
     session.user.email === decodedUsername ||
     session.user.id === profile?.id)
  )

  // Debug logging - remove after testing
  console.log('Profile Debug:', {
    urlUsername: decodedUsername,
    sessionUsername: session?.user?.username,
    sessionEmail: session?.user?.email,
    sessionId: session?.user?.id,
    profileId: profile?.id,
    isOwnProfile
  })

  useEffect(() => {
    if (decodedUsername) {
      fetchProfile()
    }
  }, [decodedUsername])

  // Fetch counts for own profile on initial load
  useEffect(() => {
    if (isOwnProfile) {
      fetchPurchases()
      fetchSaved()
    }
  }, [isOwnProfile])

  // Refetch data when switching tabs (in case new items were added)
  useEffect(() => {
    if (isOwnProfile && mainSection === 'purchased') {
      fetchPurchases()
    }
    if (isOwnProfile && mainSection === 'saved') {
      fetchSaved()
    }
  }, [mainSection])

  const fetchProfile = async () => {
    try {
      // First try to get user info
      const userRes = await fetch(`/api/user/${encodeURIComponent(decodedUsername)}`)
      const userData = await userRes.json()

      // Then fetch user's media
      const res = await fetch(`/api/media?user=${encodeURIComponent(decodedUsername)}&limit=100`)
      const data = await res.json()
      
      if (userData.user) {
        setProfile({
          id: userData.user.id || '',
          username: userData.user.username,
          name: userData.user.name,
          avatar: userData.user.avatar,
          bio: userData.user.bio,
          role: userData.user.role || 'SUBSCRIBER',
          createdAt: userData.user.createdAt || '',
          media: data.media || [],
          _count: {
            media: data.media?.length || userData.user._count?.media || 0,
          },
        })
      } else if (data.media && data.media.length > 0) {
        const user = data.media[0].user
        setProfile({
          id: user.id || '',
          username: user.username,
          name: user.name,
          avatar: user.avatar,
          bio: null,
          role: 'SUBSCRIBER',
          createdAt: '',
          media: data.media,
          _count: {
            media: data.media.length,
          },
        })
      } else {
        setProfile(null)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPurchases = async () => {
    setPurchasesLoading(true)
    try {
      const res = await fetch('/api/user/purchases')
      const data = await res.json()
      if (data.purchases) {
        setPurchases(data.purchases)
      }
    } catch (error) {
      console.error('Error fetching purchases:', error)
    } finally {
      setPurchasesLoading(false)
    }
  }

  const fetchSaved = async () => {
    setSavedLoading(true)
    try {
      const res = await fetch('/api/user/saved')
      const data = await res.json()
      if (data.saved) {
        setSavedMedia(data.saved)
      }
    } catch (error) {
      console.error('Error fetching saved media:', error)
    } finally {
      setSavedLoading(false)
    }
  }

  // Toggle selection for a saved item
  const toggleSavedSelection = (mediaId: string) => {
    setSelectedSaved(prev => {
      const newSet = new Set(prev)
      if (newSet.has(mediaId)) {
        newSet.delete(mediaId)
      } else {
        newSet.add(mediaId)
      }
      return newSet
    })
  }

  // Select/Deselect all saved items
  const toggleSelectAllSaved = () => {
    if (selectedSaved.size === savedMedia.length) {
      setSelectedSaved(new Set())
    } else {
      setSelectedSaved(new Set(savedMedia.map(item => item.media.id)))
    }
  }

  // Unsave selected items
  const handleUnsaveSelected = async () => {
    if (selectedSaved.size === 0) return
    
    setUnsaving(true)
    try {
      // Unsave each selected item
      await Promise.all(
        Array.from(selectedSaved).map(mediaId =>
          fetch(`/api/media/${mediaId}/save`, { method: 'DELETE' })
        )
      )
      
      // Refresh the saved list
      await fetchSaved()
      setSelectedSaved(new Set())
    } catch (error) {
      console.error('Error unsaving items:', error)
      alert('Failed to unsave some items')
    } finally {
      setUnsaving(false)
    }
  }

  // Checkout selected items (connect to Stripe payment)
  const [checkingOut, setCheckingOut] = useState(false)
  
  const handleCheckoutSelected = async () => {
    if (selectedSaved.size === 0) return
    
    // Get selected items that have a price
    const itemsToCheckout = savedMedia.filter(
      item => selectedSaved.has(item.media.id) && item.media.price && item.media.price > 0
    )
    
    if (itemsToCheckout.length === 0) {
      alert('No paid items selected. Select items with a price to checkout.')
      return
    }

    setCheckingOut(true)
    
    try {
      const mediaIds = itemsToCheckout.map(item => item.media.id)
      
      const response = await fetch('/api/stripe/checkout-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIds }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout')
      }
      
      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error: any) {
      console.error('Checkout error:', error)
      alert(error.message || 'Failed to start checkout. Please try again.')
    } finally {
      setCheckingOut(false)
    }
  }

  const filteredMedia = profile?.media.filter((m) =>
    activeTab === 'all' ? true : m.type === activeTab
  )

  const stats = profile
    ? {
        videos: profile.media.filter((m) => m.type === 'VIDEO').length,
        images: profile.media.filter((m) => m.type === 'IMAGE').length,
        music: profile.media.filter((m) => m.type === 'MUSIC').length,
        totalViews: profile.media.reduce((acc, m) => acc + m.views, 0),
      }
    : { videos: 0, images: 0, music: 0, totalViews: 0 }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">User Not Found</h1>
          <p className="text-gray-400 mb-4">This user doesn&apos;t exist or hasn&apos;t uploaded any content.</p>
          <Link href="/" className="btn-primary">
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  // Calculate days remaining for purchased items
  const getDaysRemaining = (deleteAfter: string | null) => {
    if (!deleteAfter) return null
    const deleteDate = new Date(deleteAfter)
    const now = new Date()
    const diffTime = deleteDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Profile Header */}
      <div className="card mb-8">
        <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
          {/* Avatar */}
          <div className="w-32 h-32 rounded-full overflow-hidden bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center text-4xl font-bold shrink-0">
            {profile.avatar ? (
              <img 
                src={`${profile.avatar}${profile.avatar.includes('?') ? '&' : '?'}t=${Date.now()}`}
                alt={profile.name || profile.username} 
                className="w-full h-full object-cover"
              />
            ) : (
              profile.name?.[0]?.toUpperCase() || profile.username[0].toUpperCase()
            )}
          </div>

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl font-bold mb-4">
              {profile.name || profile.username}
            </h1>
            
            {profile.bio && (
              <p className="text-gray-300 mb-4 max-w-2xl">{profile.bio}</p>
            )}

            {/* Stats */}
            <div className="flex flex-wrap justify-center md:justify-start gap-6 text-center">
              <div>
                <div className="text-2xl font-bold text-tank-accent">
                  {profile._count.media}
                </div>
                <div className="text-sm text-gray-500">Uploads</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {stats.totalViews.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">Total Views</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-400">{stats.videos}</div>
                <div className="text-sm text-gray-500">Videos</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{stats.images}</div>
                <div className="text-sm text-gray-500">Images</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{stats.music}</div>
                <div className="text-sm text-gray-500">Music</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          {isOwnProfile && (
            <div className="flex flex-col gap-3">
              <Link href="/profile/edit" className="px-4 py-2 bg-tank-gray border border-tank-light rounded-xl hover:bg-tank-light transition-colors text-center flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Profile
              </Link>
              <Link href="/upload" className="btn-primary text-center">
                Upload New
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Main Section Toggle - Only show for own profile */}
      {isOwnProfile && (
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setMainSection('uploads')}
            className={`px-6 py-3 rounded-xl font-semibold text-lg transition-all ${
              mainSection === 'uploads'
                ? 'bg-tank-accent text-tank-black'
                : 'bg-tank-gray text-gray-400 hover:text-white hover:bg-tank-light'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Uploads ({profile._count.media})
            </span>
          </button>
          <button
            onClick={() => setMainSection('purchased')}
            className={`px-6 py-3 rounded-xl font-semibold text-lg transition-all ${
              mainSection === 'purchased'
                ? 'bg-gradient-to-r from-tank-accent to-purple-500 text-tank-black'
                : 'bg-tank-gray text-gray-400 hover:text-white hover:bg-tank-light'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Purchased ({purchases.length})
            </span>
          </button>
          <button
            onClick={() => setMainSection('saved')}
            className={`px-6 py-3 rounded-xl font-semibold text-lg transition-all ${
              mainSection === 'saved'
                ? 'bg-blue-500 text-white'
                : 'bg-tank-gray text-gray-400 hover:text-white hover:bg-tank-light'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Saved ({savedMedia.length})
            </span>
          </button>
        </div>
      )}

      {/* Uploads Section */}
      {mainSection === 'uploads' && (
        <>
          {/* Content Tabs */}
          <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-tank-accent text-tank-black'
                  : 'bg-tank-gray text-gray-400 hover:text-white'
              }`}
            >
              All ({profile._count.media})
            </button>
            <button
              onClick={() => setActiveTab('VIDEO')}
              className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap ${
                activeTab === 'VIDEO'
                  ? 'bg-red-500 text-white'
                  : 'bg-tank-gray text-gray-400 hover:text-white'
              }`}
            >
              Videos ({stats.videos})
            </button>
            <button
              onClick={() => setActiveTab('IMAGE')}
              className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap ${
                activeTab === 'IMAGE'
                  ? 'bg-blue-500 text-white'
                  : 'bg-tank-gray text-gray-400 hover:text-white'
              }`}
            >
              Images ({stats.images})
            </button>
            <button
              onClick={() => setActiveTab('MUSIC')}
              className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap ${
                activeTab === 'MUSIC'
                  ? 'bg-purple-500 text-white'
                  : 'bg-tank-gray text-gray-400 hover:text-white'
              }`}
            >
              Music ({stats.music})
            </button>
          </div>

          {/* Ad Banner */}
          <div className="mb-6">
            <AdSense
              adSlot="auto"
              adFormat="horizontal"
              className="w-full"
              style={{ minHeight: '90px' }}
            />
          </div>

          {/* Media Grid */}
          {filteredMedia && filteredMedia.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredMedia.map((media) => (
                <MediaCard key={media.id} media={media} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">📭</div>
              <h2 className="text-2xl font-semibold mb-2">No content yet</h2>
              <p className="text-gray-400">
                {isOwnProfile
                  ? "You haven't uploaded any content yet."
                  : "This user hasn't uploaded any content yet."}
              </p>
              {isOwnProfile && (
                <Link href="/upload" className="btn-primary mt-4 inline-block">
                  Upload Your First Media
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {/* Purchased Section - Only for own profile */}
      {isOwnProfile && mainSection === 'purchased' && (
        <>
          {purchasesLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="spinner" />
            </div>
          ) : purchases.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="card group relative overflow-hidden">
                  {/* Purchased Badge */}
                  <div className="absolute top-3 left-3 z-10 px-2 py-1 bg-gradient-to-r from-tank-accent to-purple-500 rounded-lg text-xs font-bold text-tank-black">
                    PURCHASED
                  </div>
                  
                  {/* Days Remaining Badge */}
                  {purchase.media.deleteAfter && (
                    <div className="absolute top-3 right-3 z-10 px-2 py-1 bg-red-500/80 rounded-lg text-xs font-bold text-white">
                      {getDaysRemaining(purchase.media.deleteAfter)} days left
                    </div>
                  )}

                  {/* Thumbnail */}
                  <Link href={`/media/${purchase.media.id}`}>
                    <div className="relative aspect-video bg-tank-gray rounded-lg overflow-hidden mb-3">
                      {purchase.media.thumbnailUrl ? (
                        <img
                          src={purchase.media.thumbnailUrl}
                          alt={purchase.media.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-tank-gray to-tank-dark">
                          {purchase.media.type === 'VIDEO' && (
                            <svg className="w-12 h-12 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          )}
                          {purchase.media.type === 'IMAGE' && (
                            <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )}
                          {purchase.media.type === 'MUSIC' && (
                            <svg className="w-12 h-12 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Info */}
                  <h3 className="font-semibold text-white mb-1 truncate">{purchase.media.title}</h3>
                  <p className="text-sm text-gray-400 mb-2">
                    By {purchase.media.user?.name || purchase.media.user?.username || 'Unknown'}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Paid ${purchase.amount.toFixed(2)}</span>
                    <span>{new Date(purchase.createdAt).toLocaleDateString()}</span>
                  </div>

                  {/* Download Button */}
                  <a
                    href={`/api/download/${purchase.media.id}`}
                    className="mt-3 w-full px-4 py-2 bg-tank-accent text-tank-black font-semibold rounded-lg text-center block hover:bg-tank-accent/90 transition-colors"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </span>
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🛒</div>
              <h2 className="text-2xl font-semibold mb-2">No purchases yet</h2>
              <p className="text-gray-400 mb-4">
                You haven&apos;t purchased any content yet.
              </p>
              <Link href="/" className="btn-primary inline-block">
                Browse Content
              </Link>
            </div>
          )}
        </>
      )}

      {/* Saved Section - Only for own profile */}
      {isOwnProfile && mainSection === 'saved' && (
        <>
          {savedLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="spinner" />
            </div>
          ) : savedMedia.length > 0 ? (
            <>
              {/* Action Bar */}
              <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-tank-gray rounded-xl">
                {/* Select All Checkbox */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSaved.size === savedMedia.length && savedMedia.length > 0}
                    onChange={toggleSelectAllSaved}
                    className="w-5 h-5 rounded border-tank-light bg-tank-dark text-tank-accent focus:ring-tank-accent cursor-pointer"
                  />
                  <span className="text-sm text-gray-300">
                    {selectedSaved.size === savedMedia.length ? 'Deselect All' : 'Select All'}
                  </span>
                </label>

                <div className="h-6 w-px bg-tank-light mx-2" />

                {/* Selected Count */}
                <span className="text-sm text-gray-400">
                  {selectedSaved.size} selected
                </span>

                <div className="flex-1" />

                {/* Action Buttons */}
                <button
                  onClick={handleUnsaveSelected}
                  disabled={selectedSaved.size === 0 || unsaving}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {unsaving ? (
                    <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                  Unsave
                </button>

                <button
                  onClick={handleCheckoutSelected}
                  disabled={selectedSaved.size === 0 || checkingOut}
                  className="flex items-center gap-2 px-4 py-2 bg-tank-accent text-tank-black font-semibold rounded-lg hover:bg-tank-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {checkingOut ? (
                    <div className="w-4 h-4 border-2 border-tank-black/30 border-t-tank-black rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  )}
                  {checkingOut ? 'Processing...' : 'Checkout'}
                </button>
              </div>

              {/* Saved Media Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {savedMedia.map((item) => (
                  <div 
                    key={item.id} 
                    className={`card group relative overflow-hidden transition-all ${
                      selectedSaved.has(item.media.id) ? 'ring-2 ring-tank-accent' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="absolute top-3 right-3 z-20">
                      <input
                        type="checkbox"
                        checked={selectedSaved.has(item.media.id)}
                        onChange={() => toggleSavedSelection(item.media.id)}
                        className="w-5 h-5 rounded border-2 border-white/50 bg-tank-dark/80 text-tank-accent focus:ring-tank-accent cursor-pointer"
                      />
                    </div>

                    {/* Saved Badge */}
                    <div className="absolute top-3 left-3 z-10 px-2 py-1 bg-blue-500 rounded-lg text-xs font-bold text-white">
                      SAVED
                    </div>

                    {/* Price Badge */}
                    {item.media.price && item.media.price > 0 && (
                      <div className="absolute top-12 left-3 z-10 px-2 py-1 bg-tank-accent rounded-lg text-xs font-bold text-tank-black">
                        ${item.media.price.toFixed(2)}
                      </div>
                    )}

                    {/* Thumbnail */}
                    <Link href={`/media/${item.media.id}`}>
                      <div className="relative aspect-video bg-tank-gray rounded-lg overflow-hidden mb-3">
                        {item.media.thumbnailUrl ? (
                          <img
                            src={item.media.thumbnailUrl}
                            alt={item.media.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-tank-gray to-tank-dark">
                            {item.media.type === 'VIDEO' && (
                              <svg className="w-12 h-12 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            )}
                            {item.media.type === 'IMAGE' && (
                              <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            )}
                            {item.media.type === 'MUSIC' && (
                              <svg className="w-12 h-12 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                              </svg>
                            )}
                          </div>
                        )}
                        
                        {/* Type Badge */}
                        <span className={`absolute bottom-2 right-2 px-2 py-1 rounded text-xs font-bold ${
                          item.media.type === 'VIDEO' ? 'bg-red-500 text-white' :
                          item.media.type === 'IMAGE' ? 'bg-blue-500 text-white' :
                          'bg-purple-500 text-white'
                        }`}>
                          {item.media.type}
                        </span>
                      </div>
                    </Link>

                    {/* Info */}
                    <h3 className="font-semibold text-white mb-1 truncate">{item.media.title}</h3>
                    <p className="text-sm text-gray-400 mb-2">
                      By {item.media.user?.name || item.media.user?.username || 'Unknown'}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{item.media.views?.toLocaleString() || 0} views</span>
                      <span>Saved {new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🔖</div>
              <h2 className="text-2xl font-semibold mb-2">No saved content</h2>
              <p className="text-gray-400 mb-4">
                You haven&apos;t saved any content yet. Click the Save button on any media to bookmark it.
              </p>
              <Link href="/" className="btn-primary inline-block">
                Browse Content
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
