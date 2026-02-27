/**
 * Shown immediately while a page segment is loading (initial load or navigation).
 * Reduces the "black screen" by painting a visible skeleton instead of an empty main area.
 */
export default function Loading() {
  const ratios = [
    'aspect-video',
    'aspect-square',
    'aspect-[3/4]',
    'aspect-[4/5]',
    'aspect-video',
    'aspect-[3/4]',
    'aspect-square',
    'aspect-video',
    'aspect-[4/5]',
    'aspect-video',
    'aspect-square',
    'aspect-[3/4]',
  ]
  return (
    <div className="w-full min-h-screen bg-tank-black p-0 m-0" data-initial-content>
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 mb-8 py-2">
        <div className="flex-shrink-0 overflow-visible">
          <div className="flex items-end gap-0">
            <div className="h-9 w-48 skeleton rounded" style={{ paddingRight: '20px' }} />
            <div className="h-5 w-56 skeleton rounded ml-1" />
          </div>
          <div className="h-4 w-72 skeleton rounded mt-1" />
        </div>
      </div>
      <div className="media-grid min-h-screen">
        {ratios.map((ratio, i) => (
          <div key={i} className="bg-tank-gray rounded-2xl overflow-hidden">
            <div className={`${ratio} skeleton`} />
            <div className="p-4">
              <div className="h-5 skeleton mb-2 w-3/4" />
              <div className="h-4 skeleton w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
