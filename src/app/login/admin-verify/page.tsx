import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) {
    return v
  }
  return '/admin'
}

/**
 * Legacy Admin Account Step 2 URL. Admins now sign in like other users;
 * elevated access uses Admin Panel passphrase at /admin/reauth.
 */
export default function AdminLoginVerifyPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const nextPath = safeNext(searchParams.next)
  redirect(`/admin/reauth?next=${encodeURIComponent(nextPath)}`)
}
