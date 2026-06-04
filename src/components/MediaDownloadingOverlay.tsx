/** Shown over media thumbnail/player while a guest or feed download is in progress. */
export default function MediaDownloadingOverlay({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 z-[45] flex flex-col items-center justify-center bg-black/65 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
      <p className="text-white font-medium text-sm drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">{label}</p>
    </div>
  )
}
