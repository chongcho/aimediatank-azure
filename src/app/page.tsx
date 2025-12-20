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
  price?: number | null
  views: number
  avgRating: number
  createdAt: string
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

function HomeContent() {
  const searchParams = useSearchParams()
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('popular')
  const [type, setType] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

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

  useEffect(() => {
    fetchMedia()
  }, [sort, type, page, search])

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

  const fetchMedia = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        sort,
        page: page.toString(),
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

      const res = await fetch(`/api/media?${params}`)
      const data = await res.json()
      setMedia(data.media || [])
      setTotalPages(data.pagination?.totalPages || 1)
    } catch (error) {
      console.error('Error fetching media:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchMedia()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Hero Section with Search - Single Row */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 mb-8 py-2">
        {/* Left: Title */}
        <div className="flex-shrink-0 overflow-visible">
          <h1 className="text-2xl md:text-3xl font-bold italic">
            <span className="text-gradient pr-2">AI-Generated</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Community for AI creators and enthusiasts
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
            onChange={(e) => setSort(e.target.value)}
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

      {/* Media Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {media.map((item) => (
              <MediaCard key={item.id} media={item} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-12 mb-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-tank-gray rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-tank-gray rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Live Chat */}
      <LiveChat />
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 mb-8 py-2">
          <div className="flex-shrink-0 overflow-visible">
            <h1 className="text-2xl md:text-3xl font-bold italic">
              <span className="text-gradient pr-2">AI-Generated</span>
            </h1>
            <p className="text-gray-400 text-sm">
              Community for AI creators and enthusiasts
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
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
