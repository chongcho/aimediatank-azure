'use client'

import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto p-0 m-0 pb-[500px]">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/policy" className="text-tank-accent hover:underline">
          ← Policy Documents
        </Link>
        <span className="text-gray-500">|</span>
        <Link href="/terms" className="text-tank-accent hover:underline">
          Terms of Service
        </Link>
        <div className="ml-auto flex gap-2">
          <Link href="/login" className="inline-flex items-center px-3 py-1.5 rounded-lg border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent text-sm font-medium">
            Back to Sign in
          </Link>
          <Link href="/register" className="inline-flex items-center px-3 py-1.5 rounded-lg border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent text-sm font-medium">
            Back to Sign up
          </Link>
        </div>
      </div>

      <div className="card prose prose-invert max-w-none">
        <h1 className="text-2xl font-bold text-tank-accent mb-2">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-8">Effective: December 20, 2024 &middot; Last Updated: March 6, 2026</p>

        <p className="text-gray-300 mb-6">
          AiMediaTank LLC (&quot;AiMediaTank,&quot; &quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the website and platform available at <strong>https://www.aimediatank.com</strong> (the &quot;Platform&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard information when you access or use the Platform and related services.
        </p>
        <p className="text-gray-300 mb-8">
          By accessing or using the Platform, you acknowledge that you have read and understood this Privacy Policy and agree to the collection and use of information as described herein.
        </p>

        {/* 1. Information We Collect */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">1. Information We Collect</h2>
        <p className="text-gray-300 mb-4">We may collect several categories of information depending on how you interact with the Platform.</p>

        <h3 className="text-lg font-semibold mt-6 mb-3">1.1 Account Information</h3>
        <p className="text-gray-300 mb-2">When you register for an account, we may collect:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>name or username</li>
          <li>email address</li>
          <li>encrypted password</li>
          <li>profile information such as biography, avatar, or social media links</li>
          <li>account preferences</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">1.2 Transaction Information</h3>
        <p className="text-gray-300 mb-2">When marketplace transactions occur, we may collect information related to purchases or sales, including:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>purchase history</li>
          <li>transaction amounts</li>
          <li>payout records</li>
          <li>billing information</li>
          <li>licensing details associated with purchased content</li>
        </ul>
        <p className="text-gray-300 mb-4">Payment card or financial details are processed by third-party payment processors and are generally not stored directly by AiMediaTank.</p>

        <h3 className="text-lg font-semibold mt-6 mb-3">1.3 Creator Content and Metadata</h3>
        <p className="text-gray-300 mb-2">When creators upload media to the Platform, we may collect:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>digital media files (videos, images, music, or other content)</li>
          <li>associated metadata</li>
          <li>titles, descriptions, and tags</li>
          <li>pricing and licensing information</li>
          <li>usage or download statistics</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">1.4 Device and Technical Information</h3>
        <p className="text-gray-300 mb-2">We automatically collect certain technical information when you access the Platform, including:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>IP address</li>
          <li>browser type and version</li>
          <li>device type</li>
          <li>operating system</li>
          <li>referring website or URLs</li>
          <li>access timestamps</li>
          <li>session identifiers</li>
        </ul>
        <p className="text-gray-300 mb-4">This information helps maintain platform performance, security, and reliability.</p>

        <h3 className="text-lg font-semibold mt-6 mb-3">1.5 Usage and Analytics Data</h3>
        <p className="text-gray-300 mb-2">We may collect information regarding how users interact with the Platform, including:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>pages visited</li>
          <li>media viewed, downloaded, or purchased</li>
          <li>search queries</li>
          <li>clicks, interactions, or engagement with listings</li>
        </ul>
        <p className="text-gray-300 mb-4">This information helps us improve functionality, usability, and recommendations.</p>

        {/* 2. How We Use Information */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">2. How We Use Information</h2>
        <p className="text-gray-300 mb-2">We may use collected information for purposes including:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>creating and managing user accounts</li>
          <li>operating and maintaining the Platform</li>
          <li>processing marketplace transactions</li>
          <li>enabling creators to publish and sell digital media</li>
          <li>delivering purchased content to buyers</li>
          <li>communicating with users regarding accounts or services</li>
          <li>providing customer support</li>
          <li>improving platform features and performance</li>
          <li>detecting fraud, abuse, or security incidents</li>
          <li>enforcing our <Link href="/terms" className="text-tank-accent hover:underline">Terms of Service</Link></li>
          <li>complying with legal obligations</li>
        </ul>

        {/* 3. AI and Automated Processing */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">3. AI and Automated Processing</h2>
        <p className="text-gray-300 mb-2">AiMediaTank may use automated systems and algorithms to process platform data and uploaded content for purposes such as:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>content moderation</li>
          <li>indexing and search functionality</li>
          <li>recommendation systems</li>
          <li>fraud detection</li>
          <li>platform integrity and security monitoring</li>
        </ul>
        <p className="text-gray-300 mb-4">AiMediaTank does not use user-uploaded content to train artificial intelligence models without explicit permission from the content owner.</p>

        {/* 4. How We Share Information */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">4. How We Share Information</h2>
        <p className="text-gray-300 mb-4">We do not sell personal information. However, we may share information under the following circumstances.</p>

        <h3 className="text-lg font-semibold mt-6 mb-3">4.1 Service Providers</h3>
        <p className="text-gray-300 mb-2">We may share information with trusted third-party vendors that help operate the Platform, including providers of:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>payment processing</li>
          <li>cloud hosting</li>
          <li>analytics services</li>
          <li>email delivery</li>
          <li>infrastructure and security</li>
          <li>customer support tools</li>
        </ul>
        <p className="text-gray-300 mb-4">These providers may access information only as necessary to perform services on our behalf.</p>

        <h3 className="text-lg font-semibold mt-6 mb-3">4.2 Legal Compliance and Protection</h3>
        <p className="text-gray-300 mb-2">We may disclose information when necessary to:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>comply with legal obligations or court orders</li>
          <li>respond to lawful requests from government authorities</li>
          <li>enforce our Terms of Service</li>
          <li>investigate fraud or illegal activities</li>
          <li>protect the rights, property, or safety of AiMediaTank, our users, or the public</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">4.3 Business Transfers</h3>
        <p className="text-gray-300 mb-4">If AiMediaTank undergoes a merger, acquisition, financing, reorganization, or sale of assets, user information may be transferred as part of that transaction.</p>

        {/* 5. Cookies */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">5. Cookies and Tracking Technologies</h2>
        <p className="text-gray-300 mb-2">We use cookies and similar tracking technologies to:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>maintain login sessions</li>
          <li>remember user preferences</li>
          <li>analyze website traffic</li>
          <li>improve performance and reliability</li>
        </ul>
        <p className="text-gray-300 mb-4">Users may control cookie preferences through their browser settings. Disabling cookies may affect certain platform functionality.</p>

        {/* 6. Data Retention */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">6. Data Retention</h2>
        <p className="text-gray-300 mb-2">We retain personal information only for as long as reasonably necessary to:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>operate and maintain the Platform</li>
          <li>complete marketplace transactions</li>
          <li>comply with legal obligations</li>
          <li>resolve disputes</li>
          <li>enforce agreements</li>
          <li>prevent fraud and abuse</li>
        </ul>
        <p className="text-gray-300 mb-4">Uploaded media and associated metadata may remain stored while accounts are active or as necessary to support completed transactions.</p>

        {/* 7. Data Security */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">7. Data Security</h2>
        <p className="text-gray-300 mb-2">AiMediaTank implements reasonable administrative, technical, and organizational safeguards designed to protect user information, including:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>encryption where appropriate</li>
          <li>access controls</li>
          <li>monitoring systems</li>
          <li>security logging</li>
        </ul>
        <p className="text-gray-300 mb-4">However, no method of transmission or storage over the internet can be guaranteed to be completely secure.</p>

        {/* 8. Children's Privacy */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">8. Children&apos;s Privacy</h2>
        <p className="text-gray-300 mb-4">The Platform is not intended for children under the age of 13.</p>
        <p className="text-gray-300 mb-4">We do not knowingly collect personal information from children under 13 in accordance with the Children&apos;s Online Privacy Protection Act (COPPA).</p>
        <p className="text-gray-300 mb-4">If we become aware that such information has been collected, we will take reasonable steps to delete it.</p>

        {/* 9. California Privacy Rights */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">9. California Privacy Rights (CCPA / CPRA)</h2>
        <p className="text-gray-300 mb-4">Residents of California may have rights under the California Consumer Privacy Act (CCPA) and the California Privacy Rights Act (CPRA), including the right to:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>request access to personal information collected about them</li>
          <li>request deletion of personal information</li>
          <li>request disclosure of categories of personal data collected</li>
          <li>request disclosure of categories of data shared with third parties</li>
          <li>correct inaccurate personal information</li>
        </ul>
        <p className="text-gray-300 mb-4">AiMediaTank does not sell personal information.</p>
        <p className="text-gray-300 mb-4">Requests may be submitted by contacting: <strong>support@aimediatank.com</strong></p>

        {/* 10. International Data Transfers */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">10. International Data Transfers</h2>
        <p className="text-gray-300 mb-4">AiMediaTank operates from the United States.</p>
        <p className="text-gray-300 mb-4">If you access the Platform from outside the United States, your information may be transferred to and processed in the United States or other jurisdictions where our service providers operate. By using the Platform, you consent to such transfers.</p>
        <p className="text-gray-300 mb-4">Users located in regions governed by the General Data Protection Regulation (GDPR) may have additional rights including: access to personal data; correction of inaccurate information; deletion of personal data; restriction of processing; data portability.</p>

        {/* 11. User Rights and Account Control */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">11. User Rights and Account Control</h2>
        <p className="text-gray-300 mb-2">Users may:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>update account or profile information</li>
          <li>download certain account data</li>
          <li>request deletion of their account</li>
          <li>request access to stored personal information</li>
        </ul>
        <p className="text-gray-300 mb-4">Requests can be submitted to: <strong>support@aimediatank.com</strong></p>
        <p className="text-gray-300 mb-4">We may require verification of identity before fulfilling certain requests.</p>

        {/* 12. Do Not Track */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">12. Do Not Track Signals</h2>
        <p className="text-gray-300 mb-4">Some browsers include a &quot;Do Not Track&quot; feature. Because there is not yet a universally accepted standard for responding to such signals, AiMediaTank currently does not respond to Do Not Track requests.</p>

        {/* 13. Changes */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">13. Changes to This Privacy Policy</h2>
        <p className="text-gray-300 mb-4">We may update this Privacy Policy from time to time.</p>
        <p className="text-gray-300 mb-4">If changes are made, the updated policy will be posted on the Platform with a revised Effective Date.</p>
        <p className="text-gray-300 mb-4">Continued use of the Platform after such changes constitutes acceptance of the revised Privacy Policy.</p>

        {/* 14. Contact */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">14. Contact Information</h2>
        <div className="bg-tank-dark rounded-xl p-4 space-y-2 mb-4">
          <p className="text-gray-300"><strong>AiMediaTank LLC</strong></p>
          <p className="text-gray-300">Email: support@aimediatank.com</p>
          <p className="text-gray-300">Website: https://www.aimediatank.com</p>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-tank-light text-center">
          <p className="text-gray-500 text-sm">&copy; 2025–2026 AiMediaTank. All Rights Reserved.</p>
          <p className="text-gray-600 text-xs mt-1">This document should be reviewed by qualified legal counsel. It does not constitute legal advice.</p>
        </div>

        <div className="mt-8 pt-6 border-t border-tank-light flex flex-wrap gap-3">
          <Link
            href="/terms"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent font-medium"
          >
            Terms of Service
          </Link>
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
