'use client'

import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto p-0 m-0 pb-[500px]">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/policy" className="text-tank-accent hover:underline">
          ← Policy Book
        </Link>
        <span className="text-gray-500">|</span>
        <Link href="/privacy" className="text-tank-accent hover:underline">
          Privacy Policy
        </Link>
      </div>

      <div className="card prose prose-invert max-w-none">
        <h1 className="text-2xl font-bold text-tank-accent mb-2">Terms of Service</h1>
        <p className="text-gray-400 text-sm mb-8">Last Updated: February 10, 2026</p>

        <h2 className="text-lg font-semibold mt-6 mb-3">1.1 Acceptance of Terms</h2>
        <p className="text-gray-300 mb-4">
          By accessing or using AiMediaTank (&quot;the Platform,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-3">1.2 Eligibility</h2>
        <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4">
          <li>This Platform is available to users of all ages.</li>
          <li>Users under 18 years old have filtered access to age-appropriate content only.</li>
          <li>Users under 18 must have parental or guardian consent to use this Platform.</li>
          <li>You must have the legal capacity to enter into a binding agreement (or have parental consent if under 18).</li>
          <li>You must not be prohibited from using the Platform under applicable laws.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6 mb-3">1.3 Age-Based Access</h2>
        <p className="text-gray-300 mb-2"><strong>Users 18 and older:</strong></p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Full access to all content on the Platform</li>
          <li>Ability to upload, purchase, and sell content</li>
          <li>Access to all Platform features</li>
        </ul>
        <p className="text-gray-300 mb-2"><strong>Users under 18:</strong></p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Filtered access to age-appropriate content only</li>
          <li>Content marked as mature or adult-only is restricted</li>
          <li>Parental controls may be applied</li>
          <li>Some features may be limited based on age verification</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6 mb-3">1.4 Description of Service</h2>
        <p className="text-gray-300 mb-4">
          AiMediaTank is a community platform for sharing, discovering, and purchasing AI-generated and real media content including videos, images, and music, with built-in tools to publish, showcase, and monetize work.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-3">1.5 Modifications to Terms</h2>
        <p className="text-gray-300 mb-4">
          We reserve the right to modify these terms at any time. Users will be notified of significant changes via email or platform notification. Continued use of the Platform after changes constitutes acceptance of the new terms.
        </p>

        <p className="mt-8 pt-6 border-t border-tank-light text-gray-400 text-sm">
          See also our <Link href="/privacy" className="text-tank-accent hover:underline">Privacy Policy</Link> and the full <Link href="/policy" className="text-tank-accent hover:underline">Policy Book</Link>.
        </p>

        <div className="mt-8 pt-6 border-t border-tank-light flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent font-medium"
          >
            Back to Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent font-medium"
          >
            Back to Sign up
          </Link>
        </div>
      </div>
    </div>
  )
}
