'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import MediaCard from '@/components/MediaCard'
import LiveChat from '@/components/LiveChat'
import AdSense from '@/components/AdSense'

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

function HomeContent() {
  const searchParams = useSearchParams()
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('popular')
  const [type, setType] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    const typeParam = searchParams.get('type')
    if (typeParam) {
      setType(typeParam)
    } else {
      setType(null)
    }
  }, [searchParams])

  useEffect(() => {
    fetchMedia()
  }, [sort, type, page])

  const fetchMedia = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        sort,
        page: page.toString(),
        limit: '20',
      })
      if (type) params.set('type', type)
      if (search) params.set('search', search)

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
            Join and explore our community of AI creators and enthusiasts
          </p>
        </div>

        {/* Middle: Search Bar */}
        <form onSubmit={handleSearch} className="relative flex-1 ml-24">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search AI media..."
            className="w-full pl-4 pr-24 py-2.5 bg-tank-gray border border-tank-light rounded-lg focus:border-tank-accent"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-tank-accent text-tank-black font-semibold rounded-md text-sm"
          >
            Search
          </button>
        </form>

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

      {/* Ad Banner */}
      <div className="mb-6">
        <AdSense
          adSlot="3654516348"
          adFormat="horizontal"
          className="w-full"
          style={{ minHeight: '90px' }}
        />
      </div>

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
            {media.map((item, index) => (
              <>
                <MediaCard key={item.id} media={item} />
                {/* In-feed ad after every 8 items */}
                {(index + 1) % 8 === 0 && index < media.length - 1 && (
                  <div key={`ad-${index}`} className="col-span-full">
                    <AdSense
                      adSlot="3654516348"
                      adFormat="fluid"
                      className="w-full my-4"
                      style={{ minHeight: '120px' }}
                    />
                  </div>
                )}
              </>
            ))}
          </div>

          {/* Bottom Ad before Pagination */}
          <div className="mt-8">
            <AdSense
              adSlot="3654516348"
              adFormat="horizontal"
              className="w-full"
              style={{ minHeight: '90px' }}
            />
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
              Join and explore our community of AI creators and enthusiasts
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
