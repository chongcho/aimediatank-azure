'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const AUTH_PATHS = ['/login', '/register', '/terms', '/privacy']

export default function PolicyPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [policyStatus, setPolicyStatus] = useState<{ agreed: boolean; agreedAt: string | null }>({ agreed: false, agreedAt: null })

  const handleClose = useCallback(() => {
    try {
      const referrer = document.referrer
      if (referrer) {
        const url = new URL(referrer)
        const isSameOrigin = url.origin === window.location.origin
        const isFromAuthPage = AUTH_PATHS.some(p => url.pathname.startsWith(p))
        if (isSameOrigin && isFromAuthPage) {
          router.back()
          return
        }
      }
    } catch {}
    router.push('/')
  }, [router])

  useEffect(() => {
    if (session) {
      fetchPolicyStatus()
    }
  }, [session])

  const fetchPolicyStatus = async () => {
    try {
      const res = await fetch('/api/user/policy-status')
      const data = await res.json()
      setPolicyStatus(data)
    } catch (error) {
      console.error('Error fetching policy status:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="max-w-4xl mx-auto p-0 m-0 pb-[500px]">
      {session && policyStatus.agreed && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3">
          <svg className="w-6 h-6 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-green-400 font-medium">Policy Agreement Confirmed</p>
            <p className="text-sm text-gray-400">
              You agreed to the <Link href="/terms" className="text-tank-accent hover:underline">Terms of Service</Link> and <Link href="/privacy" className="text-tank-accent hover:underline">Privacy Policy</Link> on {formatDate(policyStatus.agreedAt!)}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Policy Documents</h1>
          <p className="text-gray-400">Effective: December 20, 2024 &middot; Last Updated: March 4, 2026</p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors self-start md:self-auto"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="text-gray-300 mb-8">
        AiMediaTank maintains two standalone policy documents that govern your use of the Platform and how we handle your data. Please review both documents carefully.
      </p>

      <div className="grid gap-6 md:grid-cols-2 mb-12">
        {/* Terms of Service Card */}
        <Link href="/terms" className="group block">
          <div className="card h-full border border-tank-light hover:border-tank-accent/50 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-tank-accent/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-tank-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white group-hover:text-tank-accent transition-colors">Terms of Service</h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Governs your use of the AiMediaTank Platform, including:
            </p>
            <ul className="text-gray-400 text-sm space-y-1.5 mb-4">
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Eligibility and age requirements (13+ minimum)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>User accounts, conduct, and responsibilities</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Content guidelines and AI-generated content policies</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Copyright, DMCA, and intellectual property</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Payment, refund, and creator payout policies</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Third-party platforms (YouTube, TikTok, X)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Dispute resolution and governing law</span>
              </li>
            </ul>
            <span className="text-tank-accent text-sm font-medium group-hover:underline">Read Terms of Service &rarr;</span>
          </div>
        </Link>

        {/* Privacy Policy Card */}
        <Link href="/privacy" className="group block">
          <div className="card h-full border border-tank-light hover:border-tank-accent/50 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-tank-accent/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-tank-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white group-hover:text-tank-accent transition-colors">Privacy Policy</h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Describes how we collect, use, and protect your data, including:
            </p>
            <ul className="text-gray-400 text-sm space-y-1.5 mb-4">
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Information we collect and how we use it</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Legal bases (GDPR compliance)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Cookies and tracking technologies</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Your rights (GDPR, CCPA, LGPD, PIPEDA)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Children&apos;s privacy (COPPA compliance)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>Data retention schedules</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>International data transfers and safeguards</span>
              </li>
            </ul>
            <span className="text-tank-accent text-sm font-medium group-hover:underline">Read Privacy Policy &rarr;</span>
          </div>
        </Link>
      </div>

      {/* Compliance */}
      <div className="card mb-8">
        <h2 className="text-lg font-bold mb-4">Global Compliance</h2>
        <p className="text-gray-400 text-sm mb-4">
          Our policy documents are designed to comply with applicable regulations worldwide:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-gray-300 text-sm">
            <thead>
              <tr className="border-b border-tank-light">
                <th className="text-left py-2 px-3">Regulation</th>
                <th className="text-left py-2 px-3">Jurisdiction</th>
                <th className="text-left py-2 px-3">Key Areas</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">GDPR</td>
                <td className="py-2 px-3">EU / EEA</td>
                <td className="py-2 px-3">Data protection, user rights, legal bases</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">UK DPA 2018</td>
                <td className="py-2 px-3">United Kingdom</td>
                <td className="py-2 px-3">Data protection aligned with GDPR</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">CCPA / CPRA</td>
                <td className="py-2 px-3">California, USA</td>
                <td className="py-2 px-3">Consumer privacy, opt-out, non-discrimination</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">COPPA</td>
                <td className="py-2 px-3">United States</td>
                <td className="py-2 px-3">Children&apos;s privacy, 13+ minimum age</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">LGPD</td>
                <td className="py-2 px-3">Brazil</td>
                <td className="py-2 px-3">Data protection, ANPD authority</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">PIPEDA</td>
                <td className="py-2 px-3">Canada</td>
                <td className="py-2 px-3">Personal information protection</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">DMCA</td>
                <td className="py-2 px-3">United States</td>
                <td className="py-2 px-3">Copyright takedown procedures</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">EU AI Act</td>
                <td className="py-2 px-3">European Union</td>
                <td className="py-2 px-3">AI transparency obligations</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">PCI DSS</td>
                <td className="py-2 px-3">Global</td>
                <td className="py-2 px-3">Payment security (via Stripe)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Contact */}
      <div className="card mb-8">
        <h2 className="text-lg font-bold mb-4">Contact</h2>
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="text-gray-300">
            <span className="text-gray-400">General Support:</span><br />
            support@aimediatank.com
          </div>
          <div className="text-gray-300">
            <span className="text-gray-400">Privacy Requests:</span><br />
            support@aimediatank.com<br />
            <span className="text-gray-500">Subject: &ldquo;Privacy Request&rdquo;</span>
          </div>
          <div className="text-gray-300">
            <span className="text-gray-400">Legal Inquiries:</span><br />
            support@aimediatank.com<br />
            <span className="text-gray-500">Subject: &ldquo;Legal Inquiry&rdquo;</span>
          </div>
          <div className="text-gray-300">
            <span className="text-gray-400">DMCA / Copyright:</span><br />
            support@aimediatank.com<br />
            <span className="text-gray-500">Subject: &ldquo;DMCA Notice&rdquo;</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-gray-500 text-sm">
        <p>&copy; 2025–2026 AiMediaTank. All Rights Reserved.</p>
        <p className="mt-1 text-xs text-gray-600">These documents should be reviewed by qualified legal counsel. They do not constitute legal advice.</p>
      </div>

      <div className="flex justify-start mt-8">
        <button
          type="button"
          onClick={handleClose}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors"
        >
          &larr; Back
        </button>
      </div>
    </div>
  )
}
