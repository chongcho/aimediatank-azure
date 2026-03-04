'use client'

import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto p-0 m-0 pb-[500px]">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/policy" className="text-tank-accent hover:underline">
          ← Policy Documents
        </Link>
        <span className="text-gray-500">|</span>
        <Link href="/privacy" className="text-tank-accent hover:underline">
          Privacy Policy
        </Link>
      </div>

      <div className="card prose prose-invert max-w-none">
        <h1 className="text-2xl font-bold text-tank-accent mb-2">Terms of Service</h1>
        <p className="text-gray-400 text-sm mb-8">Effective: December 20, 2024 &middot; Last Updated: March 4, 2026</p>

        {/* 1. Acceptance */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">1. Acceptance of Terms</h2>
        <p className="text-gray-300 mb-4">
          By accessing, browsing, or using AiMediaTank (&quot;the Platform,&quot; &quot;Service,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), located at https://www.aimediatank.com, you (&quot;User,&quot; &quot;you,&quot; or &quot;your&quot;) acknowledge that you have read, understood, and agree to be bound by these Terms of Service. If you do not agree, you must immediately stop using the Platform.
        </p>
        <p className="text-gray-300 mb-4">
          These Terms constitute a legally binding agreement between you and AiMediaTank. Your use is also governed by our <Link href="/privacy" className="text-tank-accent hover:underline">Privacy Policy</Link> and any supplemental guidelines posted on the Platform.
        </p>
        <p className="text-gray-300 mb-4">
          We may modify these Terms at any time. Material changes will be communicated via email or a prominent notice at least <strong>14 days</strong> before taking effect. For changes affecting your rights, we may require re-acceptance. Continued use after the effective date constitutes acceptance.
        </p>

        {/* 2. Eligibility */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">2. Eligibility</h2>

        <h3 className="text-lg font-semibold mt-6 mb-3">2.1 Minimum Age</h3>
        <p className="text-gray-300 mb-4">
          You must be at least <strong>13 years of age</strong> to create an account or use the Platform. By using the Platform, you represent and warrant that you meet this requirement.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">2.2 Users Aged 13–17</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4">
          <li>Must have verifiable parental or legal guardian consent before creating an account.</li>
          <li>Parents/guardians are responsible for monitoring usage and agree to these Terms on the minor&apos;s behalf.</li>
          <li>Filtered access to age-appropriate content; mature/adult content is restricted.</li>
          <li>Financial transactions require parental authorization.</li>
          <li>Content filtering is automatic and cannot be disabled by the minor.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">2.3 Users 18+</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Full access to all content, including age-restricted material.</li>
          <li>Upload, purchase, sell, rate, comment, and access all Platform features.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">2.4 Users Under 13</h3>
        <p className="text-gray-300 mb-4">
          <strong>Not permitted to use the Platform.</strong> If we learn personal information has been collected from a child under 13, we will delete it promptly.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">2.5 General Requirements</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Legal capacity to enter a binding agreement (or parental consent if a minor).</li>
          <li>Not barred under applicable local, national, or international law.</li>
          <li>Not located in a U.S.-embargoed country or on a restricted parties list.</li>
        </ul>

        {/* 3. Description */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">3. Description of Service</h2>
        <p className="text-gray-300 mb-4">
          AiMediaTank is a global community platform for sharing, discovering, showcasing, and purchasing AI-generated and real media content — videos, images, and music — with built-in tools to publish, showcase, and monetize creative work.
        </p>
        <p className="text-gray-300 mb-4">
          You acknowledge that AI-generated content is an emerging technology with an evolving legal landscape around ownership, copyright, and liability. You use the Platform at your own risk.
        </p>

        {/* 4. User Accounts */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">4. User Accounts</h2>

        <h3 className="text-lg font-semibold mt-6 mb-3">4.1 Account Creation</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>One account per person</strong> — multiple accounts are prohibited.</li>
          <li>Accurate, current, and complete information required.</li>
          <li>You are solely responsible for credential security and all account activity.</li>
          <li>Report unauthorized access immediately to support@aimediatank.com.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">4.2 Verification</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Email verification required for all accounts.</li>
          <li>Age verification for restricted content/features.</li>
          <li>Additional ID verification for sellers, high-value transactions, or flagged accounts.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">4.3 Suspension &amp; Termination</h3>
        <p className="text-gray-300 mb-2"><strong>By You:</strong> Delete your account any time via settings or support. Deletion is permanent.</p>
        <p className="text-gray-300 mb-2"><strong>By AiMediaTank:</strong> We may suspend or terminate accounts for Terms violations, illegal activity, inactivity (24+ months), fraud, or at law enforcement request. Appeals accepted within 30 days.</p>
        <p className="text-gray-300 mb-4">
          After termination: transaction records retained 7 years (legal compliance); personal data deleted within 30 days; purchased content may remain in buyers&apos; libraries.
        </p>

        {/* 5. User Conduct */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">5. User Conduct</h2>

        <h3 className="text-lg font-semibold mt-6 mb-3">5.1 Expected Behavior</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Treat all users with respect, civility, and professionalism.</li>
          <li>Provide accurate and truthful information.</li>
          <li>Safeguard credentials and report violations.</li>
          <li>Respect intellectual property and privacy rights.</li>
          <li>Comply with all applicable laws.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">5.2 Prohibited Activities</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Harassment, bullying, threats, stalking, discrimination.</li>
          <li>Multiple accounts to circumvent bans.</li>
          <li>Impersonation of users, public figures, or entities.</li>
          <li>Hacking, exploiting, or reverse-engineering the Platform.</li>
          <li>Introducing malware or harmful code.</li>
          <li>Scraping data without permission.</li>
          <li>Manipulating ratings, reviews, or engagement metrics.</li>
          <li>Fraudulent transactions or financial crimes.</li>
          <li>Unauthorized bots, scripts, or automated tools.</li>
          <li>Circumventing content filters, age restrictions, or safety mechanisms.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">5.3 Consequences</h3>
        <p className="text-gray-300 mb-4">
          Violations may result in: warning, content removal, temporary suspension (7–90 days), permanent termination, legal action, or financial consequences (payout withholding/forfeit).
        </p>

        {/* 6. Content Guidelines */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">6. Content Guidelines</h2>

        <h3 className="text-lg font-semibold mt-6 mb-3">6.1 Acceptable Content</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>AI-generated, AI-assisted, or original real-world content you created.</li>
          <li>Original or properly licensed with legal right to distribute.</li>
          <li>Accurately labeled (AI tool or capture device disclosed).</li>
          <li>Appropriate for general audiences unless rated otherwise.</li>
          <li>Compliant with all applicable laws.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">6.2 Prohibited Content</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>CSAM</strong> — reported to NCMEC and law enforcement.</li>
          <li>Non-consensual intimate imagery (including AI deepfakes).</li>
          <li>Deepfakes of real individuals without explicit consent.</li>
          <li>Violence, terrorism, or self-harm promotion.</li>
          <li>Hate speech targeting protected characteristics.</li>
          <li>Intellectual property infringement.</li>
          <li>Malware, phishing, spam, or deceptive content.</li>
          <li>Illegal activity or misleading AI/real attribution.</li>
          <li>Content violating AI tool terms of service.</li>
          <li>Export control or sanctions violations.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">6.3 Moderation</h3>
        <p className="text-gray-300 mb-4">
          Automated + human review. Reports reviewed within 48 hours. Appeals accepted within 14 days. Repeated violations lead to termination.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">6.4 Age-Restricted Content</h3>
        <p className="text-gray-300 mb-4">
          Mature (18+) content must be labeled using the rating system. Age verification required. Minors&apos; filtering is automatic and mandatory. Failure to label is a violation.
        </p>

        {/* 7. AI Content */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">7. AI-Generated Content Policy</h2>

        <h3 className="text-lg font-semibold mt-6 mb-3">7.1 Definition</h3>
        <p className="text-gray-300 mb-4">
          Media created wholly or partially using AI tools: image generators (Midjourney, DALL-E, Stable Diffusion, Adobe Firefly, Leonardo AI), video generators (Runway, Pika, Sora, Kling, Luma, HailuoAI), music generators (Suno, Udio, AIVA, Soundraw), and other generative AI technologies.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">7.2 Disclosure</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>AI content <strong>must</strong> be identified as AI-generated at upload.</li>
          <li>Primary AI tool(s) <strong>must</strong> be specified.</li>
          <li>Sharing prompts/techniques is encouraged.</li>
          <li>Misrepresentation is prohibited. Aligns with EU AI Act transparency obligations.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">7.3 Compliance &amp; Ethics</h3>
        <p className="text-gray-300 mb-4">
          You are responsible for AI tool TOS compliance, commercialization rights, and ensuring no third-party infringement. Do not upload content from unauthorized training data. AiMediaTank does not use uploads to train AI without consent.
        </p>

        {/* 8. Copyright */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">8. Copyright and Intellectual Property</h2>

        <h3 className="text-lg font-semibold mt-6 mb-3">8.1 Ownership</h3>
        <p className="text-gray-300 mb-4">
          You retain ownership. By uploading, you grant AiMediaTank a worldwide, non-exclusive, royalty-free, sublicensable license to display, distribute, and promote your content on the Platform. License continues until content/account deletion. We do not claim ownership.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">8.2 DMCA</h3>
        <p className="text-gray-300 mb-4">
          We comply with the DMCA and international copyright frameworks. Takedown notices: provide contact info, copyrighted work identification, infringing material location, good faith and perjury statements, and signature. Send to support@aimediatank.com (Subject: &quot;DMCA Notice&quot;). Counter-notifications follow the same channel.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">8.3 Repeat Infringers</h3>
        <p className="text-gray-300 mb-4">
          Three-strike policy: accounts with three valid DMCA notices are permanently terminated.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">8.4 AI Content &amp; Copyright</h3>
        <p className="text-gray-300 mb-4">
          Copyright status of AI-generated content varies by jurisdiction. AiMediaTank does not guarantee AI-generated uploads are eligible for copyright protection.
        </p>

        {/* 9. Payments */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">9. Payment and Refund Policy</h2>

        <h3 className="text-lg font-semibold mt-6 mb-3">9.1 Pricing &amp; Processing</h3>
        <p className="text-gray-300 mb-4">
          All prices in USD. Taxes (VAT, GST, sales tax) may apply. Processed via <strong>Stripe</strong> (PCI DSS Level 1). We never store card details. 30 days&apos; notice for price increases.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">9.2 Membership Plans</h3>
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
                <td className="py-2 px-3">Viewer</td>
                <td className="py-2 px-3">Free</td>
                <td className="py-2 px-3">Browse &amp; purchase; 5 free uploads</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Basic</td>
                <td className="py-2 px-3">$2/mo</td>
                <td className="py-2 px-3">5 free uploads; $1/extra; sell content</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Advanced</td>
                <td className="py-2 px-3">$5/mo</td>
                <td className="py-2 px-3">5 free uploads; $0.50/extra; priority support</td>
              </tr>
              <tr>
                <td className="py-2 px-3">Premium</td>
                <td className="py-2 px-3">$8/mo</td>
                <td className="py-2 px-3">Unlimited uploads; featured; creator badge</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold mt-6 mb-3">9.3 Refunds</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>Digital content:</strong> All sales final once accessed. Refunds at discretion for technical issues, misrepresentation, or duplicates within 7 days.</li>
          <li><strong>Subscriptions:</strong> Cancel any time; no partial refunds. Access through paid period. No refund if terminated for violations.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">9.4 Creator Payouts</h3>
        <p className="text-gray-300 mb-4">
          Creators receive <strong>70%</strong> net revenue (30% platform commission). Minimum payout $10. Monthly via Stripe Connect. Creators responsible for tax reporting. Fraudulent chargebacks may lead to termination.
        </p>

        {/* 10. Third-Party */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">10. Third-Party Platforms</h2>
        <p className="text-gray-300 mb-4">
          The Platform allows sharing to <strong>YouTube</strong>, <strong>TikTok</strong>, <strong>X (formerly Twitter)</strong>, Facebook, LinkedIn, Reddit, and WhatsApp. When sharing, you are subject to that platform&apos;s terms and privacy policy. We are not responsible for third-party data handling.
        </p>
        <p className="text-gray-300 mb-4">
          Social login via Google, Microsoft, Facebook, and Apple provides limited profile data only (name, email, picture). We do not access your posts, friends, or messages. See our <Link href="/privacy" className="text-tank-accent hover:underline">Privacy Policy</Link> for details.
        </p>
        <p className="text-gray-300 mb-2">Platform-specific terms apply:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>YouTube:</strong> <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">YouTube Terms</a> &amp; <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">Google Privacy</a></li>
          <li><strong>TikTok:</strong> <a href="https://www.tiktok.com/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">TikTok Terms</a> &amp; <a href="https://www.tiktok.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">TikTok Privacy</a></li>
          <li><strong>X:</strong> <a href="https://x.com/en/tos" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">X Terms</a> &amp; <a href="https://x.com/en/privacy" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">X Privacy</a></li>
        </ul>
        <p className="text-gray-300 mb-4 text-sm">
          AiMediaTank is not affiliated with or endorsed by Google LLC, ByteDance Ltd., X Corp., Meta Platforms, Inc., Apple Inc., or Microsoft Corporation.
        </p>

        {/* 11. Disclaimer */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">11. Disclaimer of Warranties</h2>
        <p className="text-gray-300 mb-4 text-sm">
          THE PLATFORM IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR AVAILABILITY. WE DO NOT GUARANTEE UNINTERRUPTED, SECURE, OR ERROR-FREE ACCESS. RELIANCE ON PLATFORM CONTENT IS AT YOUR OWN RISK.
        </p>

        {/* 12. Liability */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">12. Limitation of Liability</h2>
        <p className="text-gray-300 mb-4 text-sm">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, AIMEDIATANK SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES. TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE GREATER OF AMOUNTS PAID IN THE PRECEDING 12 MONTHS OR $100 USD. SOME JURISDICTIONS DO NOT ALLOW THESE LIMITATIONS; IN SUCH CASES, LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED BY LAW.
        </p>

        {/* 13. Indemnification */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">13. Indemnification</h2>
        <p className="text-gray-300 mb-4">
          You agree to indemnify, defend, and hold harmless AiMediaTank and its officers, directors, employees, and affiliates from claims arising from your use of the Platform, violations of these Terms, content you upload, or infringement of third-party rights.
        </p>

        {/* 14. Dispute Resolution */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">14. Dispute Resolution</h2>
        <p className="text-gray-300 mb-4">
          <strong>Governing Law:</strong> State of Washington, United States (except where superseded by mandatory local consumer protection laws).
        </p>
        <p className="text-gray-300 mb-4">
          <strong>Informal Resolution First:</strong> Contact support@aimediatank.com; 30-day resolution period.
        </p>
        <p className="text-gray-300 mb-4">
          <strong>Arbitration:</strong> Binding individual arbitration under AAA Consumer Rules. English, virtual or King County, WA. We pay filing fees for non-frivolous claims under $10,000.
        </p>
        <p className="text-gray-300 mb-4">
          <strong>Class Action Waiver:</strong> To the fullest extent permitted by law, you waive the right to participate in class actions or class arbitration. May not be enforceable in all jurisdictions.
        </p>
        <p className="text-gray-300 mb-4">
          <strong>Exceptions:</strong> IP injunctive relief, small claims court, and mandated local forums.
        </p>

        {/* 15. General */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">15. General Provisions</h2>
        <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4">
          <li><strong>Entire Agreement:</strong> These Terms + <Link href="/privacy" className="text-tank-accent hover:underline">Privacy Policy</Link> constitute the entire agreement.</li>
          <li><strong>Severability:</strong> Invalid provisions are modified minimally; remaining provisions continue.</li>
          <li><strong>Assignment:</strong> We may assign without restriction; you may not without consent.</li>
          <li><strong>Waiver:</strong> Failure to enforce does not constitute waiver; waivers must be written.</li>
          <li><strong>Force Majeure:</strong> Not liable for failures beyond reasonable control (disasters, wars, pandemics, cyberattacks).</li>
          <li><strong>Export Compliance:</strong> Platform subject to U.S. export controls and sanctions.</li>
          <li><strong>Accessibility:</strong> Committed to accessibility. Contact support@aimediatank.com (Subject: &quot;Accessibility&quot;).</li>
        </ul>

        {/* 16. Contact */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">16. Contact Information</h2>
        <div className="bg-tank-dark rounded-xl p-4 space-y-2 mb-4">
          <p className="text-gray-300"><strong>General Support:</strong> support@aimediatank.com</p>
          <p className="text-gray-300"><strong>Legal Inquiries:</strong> support@aimediatank.com (Subject: &quot;Legal Inquiry&quot;)</p>
          <p className="text-gray-300"><strong>DMCA / Copyright:</strong> support@aimediatank.com (Subject: &quot;DMCA Notice&quot;)</p>
          <p className="text-gray-300"><strong>Trust &amp; Safety:</strong> support@aimediatank.com (Subject: &quot;Trust &amp; Safety Report&quot;)</p>
          <p className="text-gray-300"><strong>Website:</strong> https://www.aimediatank.com</p>
          <p className="text-gray-400 text-sm mt-2">Response time: within 2 business days.</p>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-tank-light text-center">
          <p className="text-gray-500 text-sm">&copy; 2025–2026 AiMediaTank. All Rights Reserved.</p>
          <p className="text-gray-600 text-xs mt-1">This document should be reviewed by qualified legal counsel. It does not constitute legal advice.</p>
        </div>

        <div className="mt-8 pt-6 border-t border-tank-light flex flex-wrap gap-3">
          <Link
            href="/privacy"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent font-medium"
          >
            Privacy Policy
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
