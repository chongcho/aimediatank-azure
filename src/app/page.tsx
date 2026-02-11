'use client'

import { useEffect, useState, Suspense, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import MediaCard from '@/components/MediaCard'
import LiveChat from '@/components/LiveChat'

interface Media {
  id: string
  title: string
  type: string
  url: string
  thumbnailUrl: string | null
  aiTool: string | null
  realDevice?: string | null
  price?: number | null
  isSold?: boolean
  soldAt?: string | null
  soldCount?: number
  views: number
  avgRating: number
  createdAt: string
  reactions?: {
    happy: number
    sad: number
  }
  user: {
    id?: string
    username: string
    name: string | null
    avatar: string | null
  }
  _count: {
    comments: number
    ratings: number
  }
}

interface SearchSuggestion {
  id: string
  title: string
  type: string
  thumbnailUrl: string | null
}

interface UserSuggestion {
  id: string
  username: string
  name: string | null
  role: string
}

interface HomeScrollState {
  targetId: string
  page: number
  sort: string
  type: string | null
  search: string
}

function HomeContent() {
  const searchParams = useSearchParams()
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sort, setSort] = useState('popular')
  const [sortInitialized, setSortInitialized] = useState(false)
  const [type, setType] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const scrollRestoredRef = useRef(false)
  const restoreStateRef = useRef<HomeScrollState | null>(null)
  const isRestoringRef = useRef(false)
  const restoreRunIdRef = useRef(0)
  const activeRestoreRunIdRef = useRef<number | null>(null)

  // Check for pending scroll restoration on mount, or scroll to top
  useEffect(() => {
    const rawState = sessionStorage.getItem('homeScrollState')
    if (rawState) {
      try {
        const parsed = JSON.parse(rawState) as HomeScrollState
        restoreStateRef.current = parsed
      } catch {
        restoreStateRef.current = null
      }
      sessionStorage.removeItem('homeScrollState')
    } else {
      // No scroll restoration - scroll to top
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [])

  // Load sort preference from localStorage on mount (client-side only)
  useEffect(() => {
    const savedSort = localStorage.getItem('mediaSortPreference')
    if (savedSort && ['popular', 'recent', 'rated'].includes(savedSort)) {
      setSort(savedSort)
    }
    setSortInitialized(true)
  }, [])

  // Handler for when user changes sort - saves to localStorage
  const handleSortChange = (newSort: string) => {
    setSort(newSort)
    localStorage.setItem('mediaSortPreference', newSort)
  }

  useEffect(() => {
    const typeParam = searchParams.get('type')
    const searchParam = searchParams.get('search')
    
    if (typeParam) {
      setType(typeParam)
    } else {
      setType(null)
    }
    
    // Handle search param from URL (for hashtag links)
    if (searchParam) {
      setSearch(searchParam)
    }
  }, [searchParams])

  // Reset and fetch when filters change (only after sort is initialized)
  useEffect(() => {
    if (!sortInitialized) return
    restoreRunIdRef.current += 1
    const runId = restoreRunIdRef.current

    const restoreState = restoreStateRef.current
    const canRestore =
      restoreState &&
      restoreState.sort === sort &&
      restoreState.type === type &&
      restoreState.search === search

    if (canRestore) {
      isRestoringRef.current = true
      activeRestoreRunIdRef.current = runId
      scrollRestoredRef.current = false
      setMedia([])
      setHasMore(true)
      setPage(restoreState.page)

      const restorePages = async () => {
        for (let p = 1; p <= restoreState.page; p += 1) {
          if (restoreRunIdRef.current !== runId) {
            if (activeRestoreRunIdRef.current === runId) {
              isRestoringRef.current = false
              activeRestoreRunIdRef.current = null
            }
            return
          }
          await fetchMedia(p, p === 1)
          if (restoreRunIdRef.current !== runId) {
            if (activeRestoreRunIdRef.current === runId) {
              isRestoringRef.current = false
              activeRestoreRunIdRef.current = null
            }
            return
          }
        }
        if (activeRestoreRunIdRef.current === runId) {
          isRestoringRef.current = false
          activeRestoreRunIdRef.current = null
        }

        const attemptScrollToTarget = (attempts: number) => {
          if (attempts <= 0) return
          if (restoreRunIdRef.current !== runId) return
          const target = document.querySelector(`[data-media-id="${restoreState.targetId}"]`)
          if (target) {
            const rect = (target as HTMLElement).getBoundingClientRect()
            const headerOffset = 80
            const top = window.scrollY + rect.top - headerOffset
            window.scrollTo({ top, behavior: 'auto' })
            scrollRestoredRef.current = true
            return
          }
          setTimeout(() => attemptScrollToTarget(attempts - 1), 100)
        }

        setTimeout(() => attemptScrollToTarget(20), 50)
        restoreStateRef.current = null
      }

      restorePages()
      return
    }

    isRestoringRef.current = false
    activeRestoreRunIdRef.current = null
    setMedia([])
    setPage(1)
    setHasMore(true)
    fetchMedia(1, true)
  }, [sort, type, search, sortInitialized])

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isRestoringRef.current) return
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage((prev) => prev + 1)
        }
      },
      { threshold: 0.1 }
    )

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore])

  // Load more when page increases
  useEffect(() => {
    if (page > 1 && !isRestoringRef.current) {
      fetchMedia(page, false)
    }
  }, [page])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Refetch media when user returns to the tab after being away for a while.
  // Only use visibilitychange (NOT window focus — focus fires when clicking the
  // address bar and back, wiping all infinite-scroll pages).  Only refetch if the
  // tab was hidden for at least 5 minutes so brief tab switches don't reset the list.
  useEffect(() => {
    let hiddenAt: number | null = null

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (document.visibilityState === 'visible' && hiddenAt) {
        const awayMs = Date.now() - hiddenAt
        hiddenAt = null
        // Only refetch if away for 5+ minutes
        if (awayMs >= 5 * 60 * 1000 && media.length > 0 && !loading && !loadingMore && !isRestoringRef.current) {
          fetchMedia(1, true)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [media.length, loading, loadingMore, sort, type, search])

  // Fetch suggestions as user types
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([])
      setUserSuggestions([])
      return
    }
    
    setLoadingSuggestions(true)
    try {
      // Check if searching for @username
      if (query.startsWith('@')) {
        const username = query.slice(1) // Remove @ symbol
        if (username.length > 0) {
          const res = await fetch(`/api/users/search?q=${encodeURIComponent(username)}&limit=6`)
          const data = await res.json()
          setUserSuggestions(data.users || [])
          setSuggestions([])
        } else {
          setUserSuggestions([])
          setSuggestions([])
        }
      } else {
        // Regular media search
        const res = await fetch(`/api/media?search=${encodeURIComponent(query)}&limit=6`)
        const data = await res.json()
        setSuggestions(data.media?.map((m: Media) => ({
          id: m.id,
          title: m.title,
          type: m.type,
          thumbnailUrl: m.thumbnailUrl
        })) || [])
        setUserSuggestions([])
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error)
    } finally {
      setLoadingSuggestions(false)
    }
  }, [])

  // Handle search input change with debounce
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setShowSuggestions(true)
    
    // Debounce the suggestion fetch
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value)
    }, 300)
  }

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setSearch(suggestion.title)
    setShowSuggestions(false)
    setPage(1)
    // Navigate to the media page
    window.location.href = `/media/${suggestion.id}`
  }

  const fetchMedia = async (pageNum: number = 1, isReset: boolean = false, isRetry: boolean = false) => {
    if (isReset) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }

    try {
      const params = new URLSearchParams({
        sort,
        page: pageNum.toString(),
        limit: '20',
      })
      if (type) params.set('type', type)

      // Handle @username search - filter by user
      if (search && search.startsWith('@')) {
        const username = search.slice(1)
        if (username) params.set('user', username)
      } else if (search) {
        params.set('search', search)
      }

      const res = await fetch(`/api/media?${params}`, { cache: 'no-store' })
      const data = await res.json()
      // Only update state on success so we don't wipe the list on 4xx/5xx or network errors after idle
      if (!res.ok) {
        if (isReset && !isRetry) {
          // Retry initial load once (avoids partial/missing list when API or prefetch glitches)
          setTimeout(() => fetchMedia(1, true, true), 800)
        } else if (isReset) {
          setHasMore(false)
        }
        return
      }
      const newMedia = data.media || []
      const totalPages = data.pagination?.totalPages || 1

      if (isReset) {
        setMedia(newMedia)
      } else {
        setMedia((prev) => [...prev, ...newMedia])
      }
      setHasMore(pageNum < totalPages)
    } catch (error) {
      console.error('Error fetching media:', error)
      if (isReset && !isRetry) {
        setTimeout(() => fetchMedia(1, true, true), 800)
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setMedia([])
    setPage(1)
    setHasMore(true)
    fetchMedia(1, true)
  }

  return (
    <div className="w-full p-0 m-0 pb-[500px]">
      {/* Hero Section with Search - Single Row */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 mb-8 py-2 px-[10px]">
        {/* Left: Title */}
        <div className="flex-shrink-0 overflow-visible">
          <div className="flex items-end gap-0">
            <h1 className="text-2xl md:text-3xl font-bold" style={{ paddingRight: '20px' }}>
              <span className="text-gradient">AiMediaTank</span>
          </h1>
            <span className="font-bold italic text-gray-400 text-[15px] md:text-[16px]">AI-Generated and Real</span>
          </div>
          <p className="text-gray-400 text-[13px] md:text-sm italic">
            Community for AI Contents Creators and Digital Enthusiasts
          </p>
        </div>

        {/* Middle: Search Bar */}
        <div ref={searchRef} className="relative flex-1 ml-0">
          <form onSubmit={handleSearch}>
            <input
              type="text"
              id="search-media"
              name="search"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => search.length >= 2 && setShowSuggestions(true)}
              placeholder="Search media or @username..."
              className="w-full pl-4 pr-24 py-2.5 bg-tank-gray border border-tank-light rounded-lg focus:border-tank-accent"
              autoComplete="off"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-tank-accent text-tank-black font-semibold rounded-md text-sm"
            >
              Search
            </button>
          </form>
          
          {/* Search Suggestions Dropdown */}
          {showSuggestions && (search.length >= 2) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-tank-dark border border-tank-light rounded-lg shadow-xl overflow-hidden z-50">
              {loadingSuggestions ? (
                <div className="px-4 py-3 text-gray-400 text-sm flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-500 border-t-tank-accent rounded-full animate-spin" />
                  Searching...
                </div>
              ) : userSuggestions.length > 0 ? (
                /* User Suggestions for @username search */
                <div className="max-h-80 overflow-y-auto">
                  <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-tank-light">Users</div>
                  {userSuggestions.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSearch(`@${user.username}`)
                        setShowSuggestions(false)
                        window.location.href = `/profile/${user.username}`
                      }}
                      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-tank-light transition-colors text-left"
                    >
                      {/* User Avatar */}
                      <div className="w-8 h-8 bg-tank-accent rounded-full flex items-center justify-center text-tank-black font-bold text-sm flex-shrink-0">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      {/* Username & Name */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${
                          user.role === 'ADMIN' ? 'text-red-400' :
                          user.role === 'SUBSCRIBER' ? 'text-tank-accent' :
                          'text-white'
                        }`}>@{user.username}</p>
                        {user.name && (
                          <span className="text-xs text-gray-500">{user.name}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">View profile →</span>
                    </button>
                  ))}
                </div>
              ) : suggestions.length > 0 ? (
                <div className="max-h-80 overflow-y-auto">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-tank-light transition-colors text-left"
                    >
                      {/* Thumbnail */}
                      <div className="w-12 h-8 bg-tank-gray rounded overflow-hidden flex-shrink-0">
                        {suggestion.thumbnailUrl ? (
                          <img 
                            src={suggestion.thumbnailUrl} 
                            alt="" 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      {/* Title & Type */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{suggestion.title.replace(/#\w+/g, '').trim()}</p>
                        <span className={`text-xs ${
                          suggestion.type === 'VIDEO' ? 'text-red-400' :
                          suggestion.type === 'IMAGE' ? 'text-blue-400' :
                          'text-purple-400'
                        }`}>
                          {suggestion.type}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-gray-500 text-sm">
                  No results found for &quot;{search}&quot;
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Sort Options */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <label htmlFor="sort-select" className="text-sm text-gray-500 whitespace-nowrap">Sort by:</label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => handleSortChange(e.target.value)}
            className="bg-tank-gray border border-tank-light rounded-lg px-3 py-2 text-sm min-w-[130px]"
            aria-label="Sort media by"
          >
            <option value="popular">Most Popular</option>
            <option value="recent">Most Recent</option>
            <option value="rated">Highest Rated</option>
          </select>
        </div>
      </div>

      {/* Search Badge for Hashtag or @username */}
      {search && (search.startsWith('#') || search.startsWith('@')) && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-gray-400">
            {search.startsWith('@') ? 'Showing content from:' : 'Showing results for:'}
          </span>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2 ${
            search.startsWith('@') ? 'bg-yellow-500/20 text-yellow-400' : 'bg-cyan-500/20 text-cyan-400'
          }`}>
            {search}
            <button
              onClick={() => {
                setSearch('')
                window.history.pushState({}, '', '/')
              }}
              className="hover:text-white"
              title="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {/* Media Grid — min-h-screen during loading keeps the about section below the fold */}
      {loading ? (
        <div className="grid gap-5 media-grid min-h-screen">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="bg-tank-gray rounded-2xl overflow-hidden">
              <div className="aspect-video skeleton" />
              <div className="p-4">
                <div className="h-5 skeleton mb-2 w-3/4" />
                <div className="h-4 skeleton w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : media.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🎨</div>
          <h2 className="text-2xl font-semibold mb-2">No media found</h2>
          <p className="text-gray-400">
            Be the first to upload AI-generated content!
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-5 media-grid">
            {media.map((item) => (
              <MediaCard
                key={item.id}
                media={item}
                homeScrollContext={{ page, sort, type, search }}
              />
            ))}
          </div>

          {/* Infinite Scroll Trigger */}
          <div ref={loadMoreRef} className="h-20 flex items-center justify-center mt-8">
            {loadingMore && (
              <div className="flex items-center gap-3 text-gray-400">
                <div className="w-6 h-6 border-2 border-gray-600 border-t-tank-accent rounded-full animate-spin" />
                <span>Loading more...</span>
              </div>
            )}
            {!hasMore && media.length > 0 && (
              <p className="text-gray-500 text-sm">You've reached the end 🎉</p>
            )}
          </div>
        </>
      )}

      <section className="mt-12 border-t border-tank-light pt-10 px-[10px]">
        <div className="w-full max-w-none">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            The Home of AI Generated and Real Media
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            AiMediaTank is a professional community platform for AI media creators and real world content producers. It brings AI generated and real media together under one unified marketplace and social experience, enabling creators to publish, showcase, and monetize their work while offering audiences a trusted way to discover and support content they love.
          </p>
          <p className="text-gray-300 leading-relaxed mb-6">
            Whether you are building with the latest AI tools or capturing real world moments with your favorite device, AiMediaTank gives you a polished, production ready workflow and a community designed for creators and enthusiasts alike.
          </p>

          <hr className="border-tank-light my-6" />

          <h3 className="text-xl font-semibold text-white mb-3">Why AiMediaTank</h3>
          <ol className="list-decimal list-inside text-gray-300 space-y-4 mb-6">
            <li>
              <span className="font-semibold text-white">A Unified Creator Platform</span>
              <div className="mt-1">
                Most platforms treat AI and real media as separate worlds. AiMediaTank embraces both. You can tag AI generated content, document real world devices, and showcase media in a single, clean ecosystem that celebrates innovation and authenticity together.
              </div>
            </li>
            <li>
              <span className="font-semibold text-white">Built In Monetization</span>
              <div className="mt-1">
                AiMediaTank enables creators to publish media with a price or offer content for free. Paid uploads and purchase flows are built in, making it easy to monetize without external tools. Buyers can access and download their purchases from their profile while the media remains hosted, and the platform handles display logic such as sold status and badges.
              </div>
            </li>
            <li>
              <span className="font-semibold text-white">Trust and Transparency</span>
              <div className="mt-1">
                Media tiles clearly show AI and Real badges based on creator provided fields. Community metrics like views and reactions keep discovery honest and engaging. Admin controls allow platform owners to tune the visibility of key badges and UI elements without redeploying code.
              </div>
            </li>
          </ol>

          <hr className="border-tank-light my-6" />

          <h3 className="text-xl font-semibold text-white mb-3">Core Experience</h3>
          <div className="text-gray-300 space-y-4 mb-6">
            <div>
              <span className="font-semibold text-white">Upload and Publish</span>
              <p className="mt-1">
                Creators can upload media with a streamlined, modern form designed for clarity and speed. Titles, descriptions, AI tools used, and real device information are captured in a structured way, helping audiences understand the origins of each creation.
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Edit and Manage</span>
              <p className="mt-1">
                Editing media is simple and professional. Update titles, descriptions, AI tool data, real device information, and pricing from a clean editing interface. The experience is optimized for creators who need to adjust metadata without friction.
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Media Showcase</span>
              <p className="mt-1">
                Media tiles highlight key details with elegant badges, including AI and Real markers, price or sold status, view counts, post date, and community reactions. These badges are configurable via the Admin Panel for maximum flexibility.
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Messaging and Community</span>
              <p className="mt-1">
                Built in chat and media messaging make community engagement direct and immediate. Creators and fans can communicate within the platform, growing relationships around shared content interests.
              </p>
            </div>
          </div>

          <hr className="border-tank-light my-6" />

          <h3 className="text-xl font-semibold text-white mb-3">Built for Azure</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-2 mb-6">
            <li>Azure App Service for scalable web hosting</li>
            <li>Azure Blob Storage for media assets</li>
            <li>PostgreSQL Flexible Server for structured media metadata</li>
            <li>Azure Functions for scheduled jobs and policy based cleanup</li>
            <li>GitHub Actions for staging first deployments</li>
          </ul>
          <p className="text-gray-300 leading-relaxed mb-6">
            This architecture ensures production reliability, secure storage, and high performance across the full media pipeline.
          </p>

          <hr className="border-tank-light my-6" />

          <h3 className="text-xl font-semibold text-white mb-3">Who It&apos;s For</h3>
          <div className="text-gray-300 space-y-4 mb-6">
            <div>
              <span className="font-semibold text-white">AI Creators</span>
              <p className="mt-1">
                Publish AI videos and images, document the tools used, and build a credible portfolio inside a creator first community.
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Real World Creators</span>
              <p className="mt-1">
                Showcase camera based or real world content and stand alongside AI generated work in a unified discovery experience.
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Communities and Brands</span>
              <p className="mt-1">
                Use AiMediaTank as a trusted hub for AI and real media, with configurable controls, badge management, and professional presentation.
              </p>
            </div>
          </div>

          <hr className="border-tank-light my-6" />

          <h3 className="text-xl font-semibold text-white mb-3">Experience the Platform</h3>
          <p className="text-gray-300 leading-relaxed mb-2">
            AiMediaTank is the bridge between AI creativity and real world storytelling. It is designed to scale with creators, support monetization, and build a trustworthy media ecosystem that is clear, professional, and future ready.
          </p>
          <p className="text-gray-300 leading-relaxed">
            If you want a modern platform that respects both AI innovation and real creation, AiMediaTank is built for you.
          </p>
        </div>
      </section>

      <section className="mt-10 border-t border-tank-light pt-6 px-[10px]">
        <div className="max-w-6xl">
          <ul className="space-y-1 text-sm text-gray-300">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li><Link href="/" className="hover:text-white">All</Link></li>
            <li><Link href="/?type=VIDEO" className="hover:text-white">Videos</Link></li>
            <li><Link href="/?type=IMAGE" className="hover:text-white">Images</Link></li>
            <li><Link href="/notifications" className="hover:text-white">Notification</Link></li>
            <li><Link href="/?openChat=1" className="hover:text-white">Chat</Link></li>
            <li><Link href="/login" className="hover:text-white">Sign-In</Link></li>
            <li><Link href="/register" className="hover:text-white">Sign-Up</Link></li>
            <li><Link href="/pricing" className="hover:text-white">Membership</Link></li>
            <li><Link href="/about" className="hover:text-white">About</Link></li>
            <li><Link href="/policy" className="hover:text-white">Policy</Link></li>
            <li><Link href="/support" className="hover:text-white">Support</Link></li>
          </ul>
        </div>
      </section>

      {/* Live Feed - Disabled */}
      {/* <LiveChat /> */}
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="w-full p-0 m-0">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 mb-8 py-2">
          <div className="flex-shrink-0 overflow-visible">
            <div className="flex items-end gap-0">
              <h1 className="text-2xl md:text-3xl font-bold" style={{ paddingRight: '20px' }}>
                <span className="text-gradient">AiMediaTank</span>
            </h1>
              <span className="font-bold italic text-gray-400 text-[15px] md:text-[16px]">AI-Generated and Real</span>
            </div>
            <p className="text-gray-400 text-[13px] md:text-sm italic">
              Community for AI Contents Creators and Digital Enthusiasts
            </p>
          </div>
        </div>
        <div className="grid gap-5 media-grid min-h-screen">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="bg-tank-gray rounded-2xl overflow-hidden">
              <div className="aspect-video skeleton" />
              <div className="p-4">
                <div className="h-5 skeleton mb-2 w-3/4" />
                <div className="h-4 skeleton w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
