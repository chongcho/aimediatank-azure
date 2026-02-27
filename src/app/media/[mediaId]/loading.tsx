/**
 * Shown while the media page segment is loading (e.g. navigating from home to media detail).
 * Uses the same layout as MediaPageClient loading state to avoid a black screen flash.
 */
export default function MediaLoading() {
  return (
    <div className="pb-[500px] min-h-screen bg-tank-black" data-initial-content>
      <div className="w-full bg-black pt-5">
        <div className="w-full max-w-4xl mx-auto px-4">
          <div className="relative w-full aspect-video max-h-[70vh] bg-tank-gray rounded-xl overflow-hidden">
            <div className="absolute inset-0 skeleton" />
          </div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 pt-5 space-y-6">
        <div className="card">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
            <div className="min-w-0 lg:flex-1 space-y-4">
              <div className="h-6 skeleton w-3/4 rounded" />
              <div className="flex flex-wrap gap-3">
                <div className="h-4 skeleton w-16 rounded" />
                <div className="h-4 skeleton w-24 rounded" />
                <div className="h-4 skeleton w-20 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
