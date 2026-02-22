'use client'

import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto p-0 m-0 pb-[500px]">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/policy" className="text-tank-accent hover:underline">
          ← Policy Book
        </Link>
        <span className="text-gray-500">|</span>
        <Link href="/terms" className="text-tank-accent hover:underline">
          Terms of Service
        </Link>
      </div>

      <div className="card prose prose-invert max-w-none">
        <h1 className="text-2xl font-bold text-tank-accent mb-2">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-8">Last Updated: February 10, 2026</p>

        <h2 className="text-lg font-semibold mt-6 mb-3">2.1 Information We Collect</h2>
        <p className="text-gray-300 mb-2"><strong>Personal Information:</strong></p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Name and username</li>
          <li>Email address</li>
          <li>Profile information (avatar, bio)</li>
          <li>Payment information (processed securely through Stripe)</li>
        </ul>
        <p className="text-gray-300 mb-2"><strong>Usage Information:</strong></p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Content views and interactions</li>
          <li>Upload history</li>
          <li>Purchase history</li>
          <li>Device and browser information</li>
          <li>IP address</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6 mb-3">2.2 How We Use Your Information</h2>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>To provide and maintain our services</li>
          <li>To process transactions and payments</li>
          <li>To communicate with you about your account</li>
          <li>To send service-related notifications</li>
          <li>To improve our Platform and user experience</li>
          <li>To detect and prevent fraud or abuse</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6 mb-3">2.3 Information Sharing</h2>
        <p className="text-gray-300 mb-4">
          We do not sell your personal information. We may share information with payment processors (Stripe), cloud service providers (Microsoft Azure), and law enforcement when required by law.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-3">2.4 Your Rights</h2>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Delete your account and associated data</li>
          <li>Export your data</li>
          <li>Opt-out of marketing communications</li>
        </ul>

        <p className="mt-8 pt-6 border-t border-tank-light text-gray-400 text-sm">
          See also our <Link href="/terms" className="text-tank-accent hover:underline">Terms of Service</Link> and the full <Link href="/policy" className="text-tank-accent hover:underline">Policy Book</Link>.
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
