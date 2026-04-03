/**
 * Abnormal access notifications (server-only). Path detection: accessLogAbnormalDetect; bad-bot UAs: badBotDetect (Edge-safe).
 */

import { ABNORMAL_FLAG_LABELS as PATH_FLAG_LABELS, detectAbnormalAccess } from './accessLogAbnormalDetect'
import { BAD_BOT_FLAG_LABELS, detectBadBotUserAgent } from './badBotDetect'

export const ABNORMAL_FLAG_LABELS = { ...PATH_FLAG_LABELS, ...BAD_BOT_FLAG_LABELS }
export { detectAbnormalAccess, detectBadBotUserAgent }

function flagSummaryHtml(flags: string[]): string {
  return flags
    .map((f) => {
      const label = ABNORMAL_FLAG_LABELS[f] || f
      return `<li><code>${escapeHtml(f)}</code> — ${escapeHtml(label)}</li>`
    })
    .join('')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Sends at most one email per UTC hour (all abnormal types combined) to avoid inbox floods from scanners.
 * Set ADMIN_ACCESS_SECURITY_EMAIL to enable. Requires Azure Communication Services email (sendEmail).
 */
export async function maybeNotifyAbnormalAccess(params: {
  flags: string[]
  path: string
  method: string
  ipAddress: string | null
  country: string | null
  city: string | null
}): Promise<void> {
  const to = process.env.ADMIN_ACCESS_SECURITY_EMAIL?.trim()
  if (!to || params.flags.length === 0) return

  const { prisma } = await import('@/lib/prisma')
  const { sendEmail } = await import('@/lib/email')

  const hourBucket = new Date().toISOString().slice(0, 13)
  const bucket = `access_security:${hourBucket}`

  try {
    await prisma.securityAccessAlertDedup.create({ data: { bucket } })
  } catch {
    return
  }

  const sent = await sendEmail({
    to,
    subject: `[AI Media Tank] Abnormal access detected`,
    html: `
        <p>An access request matched <strong>abnormal / security-related</strong> patterns (example below).</p>
        <p><strong>Flags:</strong></p>
        <ul>${flagSummaryHtml(params.flags)}</ul>
        <p><strong>Path:</strong> <code>${escapeHtml(params.path)}</code><br/>
        <strong>Method:</strong> ${escapeHtml(params.method)}<br/>
        <strong>IP:</strong> ${escapeHtml(params.ipAddress || '—')}<br/>
        <strong>Location:</strong> ${escapeHtml([params.city, params.country].filter(Boolean).join(', ') || '—')}</p>
        <p style="color:#666;font-size:12px">At most <strong>one</strong> alert email per UTC hour for all abnormal traffic. Open Admin → Access Logs and enable <strong>Abnormal only</strong> for the full list.</p>
      `,
  })
  if (!sent) {
    await prisma.securityAccessAlertDedup.delete({ where: { bucket } }).catch(() => {})
  }
}
