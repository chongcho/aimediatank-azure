/**
 * Shown while the media page segment is loading (e.g. navigating from home to media detail).
 * Uses the same layout as MediaPageClient loading state to avoid a black screen flash.
 */
export default function MediaLoading() {
  return (
    <div className="pb-[500px] lg:pb-0 min-h-screen lg:min-h-0 bg-tank-black media-detail-page" data-initial-content>
      <div className="w-full px-4 lg:px-6 pt-5 media-detail-page-inner">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-6">
          <div className="w-full lg:w-2/3 min-w-0 media-detail-media-col lg:self-start">
            <div className="relative w-full aspect-video max-h-[70vh] lg:max-h-[var(--media-detail-max-media-h)] lg:h-full lg:min-h-0 lg:aspect-auto bg-tank-gray rounded-xl overflow-hidden border border-tank-light/40">
              <div className="absolute inset-0 skeleton" />
            </div>
          </div>
          <div className="w-full lg:w-1/3 min-w-0 lg:flex lg:flex-col lg:justify-center">
            <div className="card space-y-4">
              <div className="h-6 skeleton w-3/4 rounded" />
              <div className="flex flex-wrap gap-3">
                <div className="h-4 skeleton w-16 rounded" />
                <div className="h-4 skeleton w-24 rounded" />
                <div className="h-4 skeleton w-20 rounded" />
              </div>
              <div className="h-10 skeleton w-full rounded-xl" />
              <div className="h-10 skeleton w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
