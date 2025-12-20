'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

export default function PolicyPage() {
  const { data: session } = useSession()
  const [activeSection, setActiveSection] = useState('terms')
  const [policyStatus, setPolicyStatus] = useState<{ agreed: boolean; agreedAt: string | null }>({ agreed: false, agreedAt: null })

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

  const sections = [
    { id: 'terms', title: '1. Terms of Service' },
    { id: 'privacy', title: '2. Privacy Policy' },
    { id: 'content', title: '3. Content Guidelines' },
    { id: 'ai-content', title: '4. AI-Generated Content Policy' },
    { id: 'copyright', title: '5. Copyright & IP' },
    { id: 'conduct', title: '6. User Conduct' },
    { id: 'payment', title: '7. Payment & Refund Policy' },
    { id: 'account', title: '8. Account Terms' },
    { id: 'data', title: '9. Data Retention Policy' },
    { id: 'contact', title: '10. Contact Information' },
  ]

  const handleDownload = () => {
    const policyContent = document.getElementById('policy-content')?.innerText || ''
    const blob = new Blob([policyContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'AiMediaTank_Policy_Book.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Policy Agreement Status */}
      {session && policyStatus.agreed && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3">
          <svg className="w-6 h-6 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-green-400 font-medium">Policy Agreement Confirmed</p>
            <p className="text-sm text-gray-400">
              You agreed to the Terms of Service and Privacy Policy on {formatDate(policyStatus.agreedAt!)}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Policy Book</h1>
          <p className="text-gray-400">Last Updated: December 20, 2024</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-tank-gray border border-tank-light rounded-xl hover:bg-tank-light transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
          <Link href="/" className="flex items-center gap-2 px-4 py-2 bg-tank-accent text-tank-black font-semibold rounded-xl hover:bg-tank-accent/90 transition-colors">
            Back to Home
          </Link>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <nav className="lg:w-64 shrink-0">
          <div className="card sticky top-4">
            <h3 className="font-semibold mb-3 text-sm text-gray-400 uppercase">Contents</h3>
            <ul className="space-y-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={() => setActiveSection(section.id)}
                    className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeSection === section.id
                        ? 'bg-tank-accent/20 text-tank-accent'
                        : 'text-gray-400 hover:text-white hover:bg-tank-light'
                    }`}
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Policy Content */}
        <div className="flex-1">
          <div id="policy-content" className="card prose prose-invert max-w-none">
            {/* Terms of Service */}
            <section id="terms" className="mb-12">
              <h2 className="text-2xl font-bold text-tank-accent mb-4">1. Terms of Service</h2>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">1.1 Acceptance of Terms</h3>
              <p className="text-gray-300 mb-4">
                By accessing or using AiMediaTank ("the Platform," "we," "us," or "our"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">1.2 Eligibility</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4">
                <li>This Platform is available to users of all ages.</li>
                <li>Users under 18 years old have filtered access to age-appropriate content only.</li>
                <li>Users under 18 must have parental or guardian consent to use this Platform.</li>
                <li>You must have the legal capacity to enter into a binding agreement (or have parental consent if under 18).</li>
                <li>You must not be prohibited from using the Platform under applicable laws.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">1.3 Age-Based Access</h3>
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

              <h3 className="text-lg font-semibold mt-6 mb-3">1.4 Description of Service</h3>
              <p className="text-gray-300 mb-4">
                AiMediaTank is a community platform for sharing, discovering, and purchasing AI-generated media content including Videos, Images, and Music.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">1.5 Modifications to Terms</h3>
              <p className="text-gray-300 mb-4">
                We reserve the right to modify these terms at any time. Users will be notified of significant changes via email or platform notification. Continued use of the Platform after changes constitutes acceptance of the new terms.
              </p>
            </section>

            {/* Privacy Policy */}
            <section id="privacy" className="mb-12">
              <h2 className="text-2xl font-bold text-tank-accent mb-4">2. Privacy Policy</h2>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">2.1 Information We Collect</h3>
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

              <h3 className="text-lg font-semibold mt-6 mb-3">2.2 How We Use Your Information</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
                <li>To provide and maintain our services</li>
                <li>To process transactions and payments</li>
                <li>To communicate with you about your account</li>
                <li>To send service-related notifications</li>
                <li>To improve our Platform and user experience</li>
                <li>To detect and prevent fraud or abuse</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">2.3 Information Sharing</h3>
              <p className="text-gray-300 mb-4">
                We do not sell your personal information. We may share information with payment processors (Stripe), cloud service providers (Microsoft Azure), and law enforcement when required by law.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">2.4 Your Rights</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Delete your account and associated data</li>
                <li>Export your data</li>
                <li>Opt-out of marketing communications</li>
              </ul>
            </section>

            {/* Content Guidelines */}
            <section id="content" className="mb-12">
              <h2 className="text-2xl font-bold text-tank-accent mb-4">3. Content Guidelines</h2>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">3.1 Acceptable Content</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
                <li>AI-generated or AI-assisted content</li>
                <li>Original or properly licensed content</li>
                <li>Appropriate for a general audience</li>
                <li>Compliant with all applicable laws</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">3.2 Prohibited Content</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
                <li>Child sexual abuse material (CSAM)</li>
                <li>Non-consensual intimate imagery</li>
                <li>Content promoting violence or terrorism</li>
                <li>Hate speech targeting protected groups</li>
                <li>Content infringing on intellectual property rights</li>
                <li>Malware or malicious code</li>
                <li>Spam or misleading content</li>
                <li>Content depicting illegal activities</li>
                <li>Deepfakes of real individuals without consent</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">3.3 Content Moderation</h3>
              <p className="text-gray-300 mb-4">
                We reserve the right to remove any content that violates these guidelines. Repeated violations may result in account suspension or termination.
              </p>
            </section>

            {/* AI-Generated Content Policy */}
            <section id="ai-content" className="mb-12">
              <h2 className="text-2xl font-bold text-tank-accent mb-4">4. AI-Generated Content Policy</h2>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">4.1 Definition</h3>
              <p className="text-gray-300 mb-4">
                AI-generated content refers to media created using artificial intelligence tools including image generators (Midjourney, DALL-E, Stable Diffusion), video generators (Runway, Pika, Sora), and music generators (Suno, Udio).
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">4.2 Disclosure Requirements</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
                <li>All content must be identified as AI-generated</li>
                <li>Users should specify the AI tool used when uploading</li>
                <li>Misrepresenting AI content as human-created is prohibited</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">4.3 AI Tool Compliance</h3>
              <p className="text-gray-300 mb-4">
                Users are responsible for complying with the terms of service of the AI tools they use, ensuring they have rights to commercialize AI-generated content, and understanding licensing restrictions.
              </p>
            </section>

            {/* Copyright and IP */}
            <section id="copyright" className="mb-12">
              <h2 className="text-2xl font-bold text-tank-accent mb-4">5. Copyright and Intellectual Property</h2>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">5.1 Ownership</h3>
              <p className="text-gray-300 mb-4">
                You retain ownership of content you create and upload. By uploading, you grant AiMediaTank a non-exclusive license to display, distribute, and promote your content on the Platform.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">5.2 DMCA Compliance</h3>
              <p className="text-gray-300 mb-4">
                We respect intellectual property rights and comply with the Digital Millennium Copyright Act (DMCA). To file a takedown notice, contact support@aimediatank.com with the required information.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">5.3 Repeat Infringers</h3>
              <p className="text-gray-300 mb-4">
                Accounts with repeated copyright violations will be terminated.
              </p>
            </section>

            {/* User Conduct */}
            <section id="conduct" className="mb-12">
              <h2 className="text-2xl font-bold text-tank-accent mb-4">6. User Conduct</h2>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">6.1 Expected Behavior</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
                <li>Treat other users with respect</li>
                <li>Provide accurate information</li>
                <li>Protect your account credentials</li>
                <li>Report violations and suspicious activity</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">6.2 Prohibited Activities</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
                <li>Harass, bully, or threaten other users</li>
                <li>Create multiple accounts to evade bans</li>
                <li>Attempt to hack or exploit the Platform</li>
                <li>Scrape or collect user data without permission</li>
                <li>Manipulate ratings or reviews</li>
                <li>Engage in fraudulent transactions</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">6.3 Consequences</h3>
              <p className="text-gray-300 mb-4">
                Violations may result in warning, temporary suspension, permanent account termination, or legal action where appropriate.
              </p>
            </section>

            {/* Payment and Refund Policy */}
            <section id="payment" className="mb-12">
              <h2 className="text-2xl font-bold text-tank-accent mb-4">7. Payment and Refund Policy</h2>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">7.1 Pricing</h3>
              <p className="text-gray-300 mb-4">
                Content creators set their own prices. Membership plans are priced as displayed on the Platform. All prices are in US Dollars (USD).
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">7.2 Membership Plans</h3>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-gray-300 text-sm">
                  <thead>
                    <tr className="border-b border-tank-light">
                      <th className="text-left py-2 px-3">Plan</th>
                      <th className="text-left py-2 px-3">Price</th>
                      <th className="text-left py-2 px-3">Features</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-tank-light/50">
                      <td className="py-2 px-3">Free</td>
                      <td className="py-2 px-3">$0/month</td>
                      <td className="py-2 px-3">View content, limited uploads</td>
                    </tr>
                    <tr className="border-b border-tank-light/50">
                      <td className="py-2 px-3">Creator</td>
                      <td className="py-2 px-3">$1.99/month</td>
                      <td className="py-2 px-3">Upload content, sell creations</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">Premium</td>
                      <td className="py-2 px-3">$9.99/month</td>
                      <td className="py-2 px-3">Unlimited uploads, priority support</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold mt-6 mb-3">7.3 Refund Policy</h3>
              <p className="text-gray-300 mb-4">
                Due to the nature of digital content, all sales are final. Refunds may be issued for technical issues preventing access. Refund requests must be submitted within 7 days of purchase.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-3">7.4 Creator Payouts</h3>
              <p className="text-gray-300 mb-4">
                Creators receive 70% of content sales. Minimum payout threshold: $10. Payouts processed monthly via Stripe Connect.
              </p>
            </section>

            {/* Account Terms */}
            <section id="account" className="mb-12">
              <h2 className="text-2xl font-bold text-tank-accent mb-4">8. Account Terms</h2>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">8.1 Account Creation</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
                <li>One account per person</li>
                <li>Accurate information required</li>
                <li>You are responsible for maintaining account security</li>
                <li>Notify us immediately of unauthorized access</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">8.2 Account Termination</h3>
              <p className="text-gray-300 mb-4">
                You may delete your account at any time. We may suspend or terminate accounts for Terms of Service violations, illegal activity, extended inactivity, or fraudulent activity.
              </p>
            </section>

            {/* Data Retention Policy */}
            <section id="data" className="mb-12">
              <h2 className="text-2xl font-bold text-tank-accent mb-4">9. Data Retention Policy</h2>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">9.1 Content Retention</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
                <li>Uploaded content: Retained while account is active</li>
                <li>Purchased content: Available for download for 10 days after purchase</li>
                <li>Deleted content: Permanently removed within 30 days</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">9.2 User Data Retention</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
                <li>Account information: Retained while account is active</li>
                <li>Transaction records: 7 years (legal requirement)</li>
                <li>Usage logs: 90 days</li>
                <li>Support communications: 2 years</li>
              </ul>
            </section>

            {/* Contact Information */}
            <section id="contact" className="mb-12">
              <h2 className="text-2xl font-bold text-tank-accent mb-4">10. Contact Information</h2>
              
              <div className="bg-tank-dark rounded-xl p-4 space-y-3">
                <p className="text-gray-300">
                  <strong>General Support:</strong> support@aimediatank.com
                </p>
                <p className="text-gray-300">
                  <strong>Website:</strong> https://www.aimediatank.com
                </p>
                <p className="text-gray-300">
                  <strong>Legal Inquiries:</strong> support@aimediatank.com (Subject: "Legal Inquiry")
                </p>
                <p className="text-gray-300">
                  <strong>DMCA/Copyright:</strong> support@aimediatank.com (Subject: "DMCA Notice")
                </p>
                <p className="text-gray-300">
                  <strong>Privacy Concerns:</strong> support@aimediatank.com (Subject: "Privacy Request")
                </p>
              </div>
            </section>

            {/* Disclaimer */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-400 mb-4">Disclaimer</h2>
              <p className="text-gray-400 text-sm">
                THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE UNINTERRUPTED ACCESS OR THAT THE PLATFORM WILL BE ERROR-FREE. TO THE MAXIMUM EXTENT PERMITTED BY LAW, AIMEDIATANK SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES.
              </p>
            </section>

            <div className="text-center text-gray-500 text-sm pt-8 border-t border-tank-light">
              © 2024 AiMediaTank. All Rights Reserved.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

