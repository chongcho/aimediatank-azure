export function formatViewCount(value: number | null | undefined): string {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return '0'
  return Math.max(0, Math.round(numeric)).toLocaleString()
}
