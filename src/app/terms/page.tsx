'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function TermsPageContent() {
  const searchParams = useSearchParams()
  const fromLogin = searchParams.get('from') === 'login'
  const fromRegister = searchParams.get('from') === 'register'
  const fromPolicy = searchParams.get('from') === 'policy'
  const fromAuth = fromLogin || fromRegister

  return (
    <div className="max-w-4xl mx-auto p-0 m-0 pb-[500px]">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {fromPolicy && (
          <Link href="/policy" className="text-tank-accent hover:underline">
            ← Policy Home
          </Link>
        )}
        {!fromAuth && !fromPolicy && (
          <>
            <Link href="/policy" className="text-tank-accent hover:underline">
              ← Policy Home
            </Link>
            <span className="text-gray-500">|</span>
            <Link href="/privacy" className="text-tank-accent hover:underline">
              Privacy Policy
            </Link>
          </>
        )}
        {!fromPolicy && (
          <div className={`flex gap-2 ${fromAuth ? '' : 'ml-auto'}`}>
            {(!fromAuth || fromLogin) && (
              <Link href="/login" className="inline-flex items-center px-3 py-1.5 rounded-lg border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent text-sm font-medium">
                Previous to Log in
              </Link>
            )}
            {(!fromAuth || fromRegister) && (
              <Link href="/register" className="inline-flex items-center px-3 py-1.5 rounded-lg border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent text-sm font-medium">
                Previous to Register
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="card prose prose-invert max-w-none">
        <h1 className="text-2xl font-bold text-tank-accent mb-2">Terms of Service</h1>
        <p className="text-gray-400 text-sm mb-8">Effective: December 20, 2024 &middot; Last Updated: September 3, 2026</p>

        {/* 1. Acceptance */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">1. Acceptance of Terms</h2>
        <p className="text-gray-300 mb-4">
          By accessing, browsing, or using the Platform at https://www.aimediatank.com (the &quot;Platform&quot; and &quot;Service&quot;; AI Media Tank, LLC (AMT) is referred to herein as &quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), you (&quot;User&quot;, &quot;you&quot;, or &quot;your&quot;) acknowledge that you have read, understood, and agree to be bound by these Terms of Service (&quot;Terms&quot;).
        </p>
        <p className="text-gray-300 mb-4">
          If you do not agree to these Terms, you must immediately discontinue use of the Platform.
        </p>
        <p className="text-gray-300 mb-4">
          These Terms constitute a legally binding agreement between you and AI Media Tank, LLC (AMT). Your use of the Platform is also governed by our <Link href={fromLogin ? '/privacy?from=login' : fromRegister ? '/privacy?from=register' : fromPolicy ? '/privacy?from=policy' : '/privacy'} className="text-tank-accent hover:underline">Privacy Policy</Link> and any additional policies, guidelines, or rules posted on the Platform.
        </p>

        {/* 2. Eligibility */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">2. Eligibility</h2>
        <p className="text-gray-300 mb-2">To register for an account or use the Platform, you must:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>meet the Platform&apos;s minimum age requirement (9+, 13+, 16+, or 18+, as configured by the operator)</li>
          <li>have the legal capacity to enter into a binding agreement</li>
          <li>not be located in a jurisdiction restricted by U.S. sanctions or applicable law</li>
        </ul>
        <p className="text-gray-300 mb-4">
          Users who do not meet the configured minimum age are strictly prohibited from using the Platform. The Platform does not knowingly collect personal information from children under 13.
        </p>
        <p className="text-gray-300 mb-4">
          If you are under the age of 18, you represent that you have permission from a parent or legal guardian.
        </p>
        <p className="text-gray-300 mb-4">
          During registration, you must provide an accurate date of birth. We may use your birthday to assess age eligibility and to display your profile information. Providing a false date of birth is a violation of these Terms.
        </p>

        {/* 3. Description */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">3. Description of Service</h2>
        <p className="text-gray-300 mb-4">
          AI Media Tank, LLC (AMT) operates a global digital media marketplace and community platform where users may upload, share, discover, showcase, license, and purchase digital media including but not limited to: videos, images, music, AI-generated media, AI-assisted media, and real-world creative media.
        </p>
        <p className="text-gray-300 mb-4">
          The Platform provides tools for creators to publish, distribute, and monetize their content.
        </p>
        <p className="text-gray-300 mb-2">In addition to the marketplace, the Platform includes community and communications features, including but not limited to:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>Open Chat</strong> — a public community chat room (TalkChat)</li>
          <li><strong>Private Chat</strong> — one-to-one and group messaging with media attachments</li>
          <li><strong>Voice Talk</strong> — real-time voice calls between members using WebRTC, with native lock-screen incoming-call UI on supported iOS (CallKit) and Android (ConnectionService) apps</li>
          <li><strong>Celebration Cards</strong> — digital greeting cards shareable with others</li>
          <li>Comments, ratings, bookmarks, and notifications</li>
          <li>Built-in games for community entertainment</li>
          <li>Social sharing to external platforms (including LinkedIn, TikTok, X, Facebook, WhatsApp, Reddit, and KakaoTalk)</li>
          <li>Upload and crop tools for images and other media</li>
          <li>Automatic machine translation of user-facing text when enabled by platform settings</li>
          <li>Guest watermarked downloads of free content; registered members may receive unwatermarked downloads according to plan and media settings</li>
          <li>Native mobile applications (iOS and Android) in addition to the browser and Progressive Web App (PWA)</li>
        </ul>
        <p className="text-gray-300 mb-4">
          Voice calls require microphone permission on your device. The Platform does not guarantee call quality, connectivity, or availability. Native mobile apps may use push notification services (including Apple Push Notification service and Firebase Cloud Messaging) to deliver incoming-call alerts.
        </p>
        <p className="text-gray-300 mb-4">
          You acknowledge that AI-generated content technologies are evolving, and the legal framework surrounding authorship, copyright, and ownership may change over time. Use of such content is undertaken at your own risk.
        </p>

        {/* 4. User Accounts */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">4. User Accounts</h2>
        <h3 className="text-lg font-semibold mt-6 mb-3">4.1 Account Creation (Register)</h3>
        <p className="text-gray-300 mb-2">To access certain features, users must register for an account (via email or a supported social identity provider such as Google, Facebook, Apple, or Microsoft) and:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>provide accurate information, including legal name where requested, date of birth, email address, and country / location</li>
          <li>optionally provide a mobile phone number for verification and account contact</li>
          <li>maintain the security of login credentials</li>
          <li>promptly update account information when necessary</li>
          <li>agree to these Terms and the Privacy Policy before completing registration</li>
        </ul>
        <p className="text-gray-300 mb-4">You are responsible for all activities conducted under your account.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">4.2 Verification</h3>
        <p className="text-gray-300 mb-2">AI Media Tank, LLC (AMT) may require verification including:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>email verification</li>
          <li>phone verification (SMS)</li>
          <li>identity verification</li>
          <li>payment verification for sellers</li>
        </ul>
        <p className="text-gray-300 mb-4">
          Where phone verification is used, providing your mobile number includes consent to receive SMS verification and related transactional messages as disclosed on the Register and Edit Profile screens.
        </p>
        <h3 className="text-lg font-semibold mt-6 mb-3">4.3 Account Suspension or Termination</h3>
        <p className="text-gray-300 mb-2">We may suspend or terminate accounts that:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>violate these Terms</li>
          <li>engage in fraud or illegal activity</li>
          <li>upload prohibited or infringing content</li>
          <li>misuse the Platform</li>
        </ul>
        <p className="text-gray-300 mb-4">Users may request account deletion at any time.</p>

        {/* 5. User Conduct */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">5. User Conduct</h2>
        <p className="text-gray-300 mb-2">Users agree to:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>comply with all applicable laws</li>
          <li>respect intellectual property rights</li>
          <li>interact respectfully with other users</li>
          <li>refrain from abusive or harassing behavior</li>
        </ul>
        <p className="text-gray-300 mb-2">Prohibited activities include:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>hacking or attempting to exploit the Platform</li>
          <li>impersonating other users or public figures</li>
          <li>fraudulent transactions</li>
          <li>automated scraping or data harvesting</li>
          <li>distribution of malware or harmful code</li>
          <li>manipulation of engagement metrics</li>
          <li>doxxing or unauthorized disclosure of personal information</li>
          <li>illegal surveillance or unauthorized recording</li>
          <li>harassment, threats, or spam in Open Chat, Private Chat, or Voice Talk</li>
          <li>recording voice calls without the consent of all participants where required by law</li>
          <li>circumventing guest watermarks or download restrictions</li>
        </ul>
        <p className="text-gray-300 mb-4">Violations may result in warnings, suspension, or permanent account termination.</p>

        {/* 6. Content Guidelines */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">6. Content Guidelines</h2>
        <p className="text-gray-300 mb-2">Users may upload content that is:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>AI-generated, AI-assisted, or original content</li>
          <li>lawfully owned or licensed by the uploader</li>
          <li>compliant with all applicable laws</li>
        </ul>
        <p className="text-gray-300 mb-2">Prohibited content includes:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>child sexual exploitation material</li>
          <li>non-consensual intimate imagery</li>
          <li>deepfakes of real individuals without consent</li>
          <li>hate speech or extremist content</li>
          <li>terrorism-related material</li>
          <li>malware or phishing content</li>
          <li>intellectual property infringement</li>
        </ul>
        <p className="text-gray-300 mb-4">AI Media Tank, LLC (AMT) may utilize automated systems and manual moderation to review content.</p>

        <h3 className="text-lg font-semibold mt-6 mb-3">6.1 Zero Tolerance for Objectionable Content and Abusive Users</h3>
        <p className="text-gray-300 mb-4">
          There is <strong className="text-white">no tolerance</strong> for objectionable content or abusive users on the Platform.
          Objectionable content includes (without limitation) illegal content, sexual exploitation, harassment, hate speech,
          threats, spam, scams, and any other material that violates these Terms or applicable law.
        </p>
        <p className="text-gray-300 mb-2">Users can:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>
            <strong className="text-white">Report / flag</strong> media, chat messages, or users (Report on media pages; long-press
            a message in TalkChat)
          </li>
          <li>
            <strong className="text-white">Block</strong> abusive users — blocking immediately hides that user&apos;s content from
            your feed and chat, and notifies Platform moderators
          </li>
        </ul>
        <p className="text-gray-300 mb-4">
          AI Media Tank, LLC (AMT) reviews user reports and will act within <strong className="text-white">24 hours</strong> by
          removing objectionable content and ejecting (suspending or permanently terminating) the account of the user who provided
          the offending content, when the report is substantiated.
        </p>
        <p className="text-gray-300 mb-4">
          Filtering: the Platform uses automated screening where available, age/content controls, and per-user block lists so
          blocked users&apos; posts and messages do not appear in the blocker&apos;s feed or chat.
        </p>

        {/* 7. AI-Generated Content */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">7. AI-Generated Content Policy</h2>
        <p className="text-gray-300 mb-4">AI-generated media must be clearly disclosed during upload.</p>
        <p className="text-gray-300 mb-2">Examples include content created using:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>image generation tools</li>
          <li>video generation tools</li>
          <li>music generation tools</li>
          <li>AI-assisted editing software</li>
        </ul>
        <p className="text-gray-300 mb-4">Users are solely responsible for ensuring they have the legal rights to distribute such content.</p>
        <p className="text-gray-300 mb-4">AI Media Tank, LLC (AMT) does not claim ownership of AI-generated media and will not use uploaded content to train AI models without user consent.</p>
        <p className="text-gray-300 mb-2">Content uploaded to the Platform may be processed by automated systems for purposes including:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>moderation</li>
          <li>indexing</li>
          <li>recommendation algorithms</li>
          <li>search functionality</li>
          <li>platform security</li>
        </ul>

        {/* 8. Intellectual Property */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">8. Intellectual Property</h2>
        <h3 className="text-lg font-semibold mt-6 mb-3">8.1 Ownership</h3>
        <p className="text-gray-300 mb-4">Creators retain ownership of the media they upload. Uploading media to the Platform does not transfer ownership to AI Media Tank, LLC (AMT) or other users.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">8.2 License Grant to Platform</h3>
        <p className="text-gray-300 mb-2">By uploading media to the Platform, you grant AI Media Tank, LLC (AMT) a worldwide, non-exclusive, royalty-free, sublicensable license to: host, store, reproduce, display, distribute, and promote the media solely for the purposes of operating, marketing, and improving the Platform. This license does not transfer ownership of the media.</p>

        {/* 9. Membership Plans */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">9. Membership Plans</h2>
        <p className="text-gray-300 mb-4">The Platform may offer optional paid membership tiers.</p>
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
                <td className="py-2 px-3">Browse, purchase, sell, 5 free uploads, community features</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Basic</td>
                <td className="py-2 px-3">$2/month</td>
                <td className="py-2 px-3">5 free uploads/month, $1 per additional upload, yearly billing available</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Advanced</td>
                <td className="py-2 px-3">$5/month</td>
                <td className="py-2 px-3">5 free uploads/month, $0.50 per additional upload, priority support</td>
              </tr>
              <tr>
                <td className="py-2 px-3">Premium</td>
                <td className="py-2 px-3">$8/month</td>
                <td className="py-2 px-3">Unlimited free uploads, featured placement, premium badge</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-300 mb-4">Membership fees are non-refundable except where required by law. Users may cancel at any time, but no partial refunds will be issued.</p>

        {/* 10. Marketplace Trade Terms */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">10. Marketplace Trade Terms</h2>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.1 No Returns on Purchased Media</h3>
        <p className="text-gray-300 mb-4">All digital media purchases made through the AI Media Tank app are final. Due to the nature of digital assets, no returns, refunds, cancellations, or exchanges will be permitted once payment has been successfully processed.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.2 Media Pricing</h3>
        <p className="text-gray-300 mb-4">The price displayed for any media item on the AI Media Tank app represents the fee for downloading the media as a digital file. The Seller (Poster) may change the listed price of any media item at any time and for any reason prior to purchase. Prices may be modified at any time but will not affect completed transactions. AI Media Tank, LLC (AMT) does not verify or control seller pricing.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.3 Payment Processing</h3>
        <p className="text-gray-300 mb-4">Buyers pay the listed price plus applicable taxes through the Platform. Payments may be processed through third-party payment providers. AI Media Tank, LLC (AMT) acts as a marketplace facilitator and payment intermediary. Use of payment services may also be subject to the terms of the applicable payment processor.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.4 Platform Processing Fee</h3>
        <p className="text-gray-300 mb-4">For each completed sale: AI Media Tank, LLC (AMT) retains 30% Processing Fee; 70% is credited to the Seller. Processing fees may be modified for future transactions at the Company&apos;s discretion.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.5 Seller Payouts</h3>
        <p className="text-gray-300 mb-4">Seller earnings accumulate in their account. Withdrawals occur when the account balance reaches $50 USD or more. If a seller withdraws below $50: the seller is responsible for transaction fees; fees may be up to 10% depending on payment method. Sellers are responsible for any applicable taxes and reporting obligations related to their earnings.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.6 Seller Representations</h3>
        <p className="text-gray-300 mb-4">Sellers represent and warrant that they are the original creator or they possess all rights necessary to distribute the media. Sellers are solely responsible for copyright compliance.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.7 Copyright Ownership</h3>
        <p className="text-gray-300 mb-4">Payment for downloading media does not transfer or assign any copyright, intellectual property rights, or ownership interests from the Seller (Poster) to the Buyer (Downloader). The Seller remains the original copyright owner of the media unless otherwise expressly agreed in writing.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.8 License Granted Upon Download</h3>
        <p className="text-gray-300 mb-4">Upon the Seller&apos;s successful upload of the media to the AI Media Tank app and the Buyer&apos;s lawful purchase and download of the media, the media shall be deemed licensed on a license-free basis between the Seller and the Buyer. Both parties are granted a non-exclusive, perpetual, worldwide, royalty-free license to use the media.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.9 Permitted Uses</h3>
        <p className="text-gray-300 mb-2">Subject to these Terms and Conditions:</p>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-1">
          <li>The Seller (Poster), as the original creator and copyright owner, retains the unrestricted right to use, reproduce, display, distribute, sell, and commercially exploit the media.</li>
          <li>The Buyer (Downloader) is granted a non-exclusive, perpetual, royalty-free license to use, reproduce, display, modify, and distribute the downloaded media for both personal and commercial purposes without the obligation to pay additional royalties to the Seller.</li>
        </ul>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.10 Restrictions</h3>
        <p className="text-gray-300 mb-4">The Buyer (Downloader) may not upload, post, list for sale, or otherwise make available the identical downloaded media file on the AI Media Tank app. Any media that is determined to be a duplicate or substantially identical copy of previously downloaded content may be removed by AI Media Tank at its sole discretion as a violation of platform policy. Buyers may also not: claim authorship of the media; use media for illegal or defamatory purposes.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.11 Platform Enforcement</h3>
        <p className="text-gray-300 mb-4">AI Media Tank reserves the right to remove duplicated media and take any appropriate enforcement actions against accounts that violate these policies, including content removal, suspension of posting privileges, or account termination where necessary.</p>
        <h3 className="text-lg font-semibold mt-6 mb-3">10.12 Guest Downloads and Watermarks</h3>
        <p className="text-gray-300 mb-4">Visitors who are not logged in may download certain free media only with a burned-in watermark applied by the Platform. Registered members may receive unwatermarked downloads according to their membership plan, purchase status, and per-media download settings. Circumventing watermarks or technical download restrictions is prohibited.</p>

        {/* 11. Content Moderation */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">11. Content Moderation</h2>
        <p className="text-gray-300 mb-4">AI Media Tank, LLC (AMT) reserves the right to remove or disable access to any content at its sole discretion. Where possible, users will be notified regarding the reason for removal. The Company may also moderate Open Chat, Private Chat, and Voice Talk usage, including issuing warnings, removing messages, suspending chat privileges, or terminating accounts for violations.</p>

        {/* 12. Copyright and DMCA */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">12. Copyright and DMCA</h2>
        <p className="text-gray-300 mb-4">AI Media Tank, LLC (AMT) complies with the Digital Millennium Copyright Act (DMCA). Copyright owners may submit takedown requests. Repeat infringers may have their accounts permanently terminated.</p>

        {/* 13. Third-Party Platforms */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">13. Third-Party Platforms</h2>
        <p className="text-gray-300 mb-2">The Platform allows sharing to third-party services including: YouTube, TikTok, X (formerly Twitter), Facebook, LinkedIn, Reddit, WhatsApp, and KakaoTalk.</p>
        <p className="text-gray-300 mb-4">The Platform is also available through native mobile applications distributed via the Apple App Store (TestFlight) and Google Play (internal testing), which are subject to the respective store terms. When sharing content to these services, users are subject to the terms and privacy policies of those platforms. AI Media Tank, LLC (AMT) is not affiliated with or endorsed by the companies operating these services.</p>

        {/* 14. Disclaimer */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">14. Disclaimer of Warranties</h2>
        <p className="text-gray-300 mb-4 text-sm">
          THE PLATFORM IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; AI Media Tank, LLC (AMT) makes no warranties, express or implied, including: merchantability, fitness for a particular purpose, non-infringement, uninterrupted service. Use of the Platform is at your own risk.
        </p>

        {/* 15. Limitation of Liability */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">15. Limitation of Liability</h2>
        <p className="text-gray-300 mb-4 text-sm">
          To the maximum extent permitted by law, AI Media Tank, LLC (AMT) shall not be liable for: disputes between buyers and sellers; misuse of media by third parties; intellectual property claims arising from uploaded content; indirect or consequential damages. Total liability shall not exceed the greater of: $100 USD, or the total processing fees paid to the Company in the previous 12 months.
        </p>

        {/* 16. Indemnification */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">16. Indemnification</h2>
        <p className="text-gray-300 mb-4">You agree to indemnify, defend, and hold harmless AI Media Tank, LLC (AMT) and its officers, employees, and affiliates from any claims arising from: your use of the Platform; content you upload; violations of these Terms; infringement of third-party rights.</p>

        {/* 17. Service Availability */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">17. Service Availability</h2>
        <p className="text-gray-300 mb-4">AI Media Tank, LLC (AMT) reserves the right to modify, suspend, or discontinue any part of the Platform at any time without liability. The Company does not guarantee uninterrupted availability.</p>

        {/* 18. Export Compliance */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">18. Export Compliance</h2>
        <p className="text-gray-300 mb-4">Users may not use the Platform in violation of United States export control or sanctions laws. Users represent that they are not located in, or acting on behalf of, any sanctioned jurisdiction.</p>

        {/* 19. Dispute Resolution */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">19. Dispute Resolution</h2>
        <p className="text-gray-300 mb-4">These Terms are governed by the laws of the State of Washington, United States. Users agree to attempt informal resolution by contacting support@aimediatank.com before initiating formal proceedings.</p>

        {/* 20. Arbitration */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">20. Arbitration Agreement</h2>
        <p className="text-gray-300 mb-4">Any dispute arising from these Terms shall be resolved through binding arbitration administered by the American Arbitration Association (AAA). Arbitration shall be conducted: by a single arbitrator; in English; in Washington State or via virtual hearing. Small claims court actions remain permitted where applicable.</p>

        {/* 21. Class Action Waiver */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">21. Class Action Waiver</h2>
        <p className="text-gray-300 mb-4">Users agree that disputes will be resolved individually. You waive any right to participate in: class actions; class arbitration; representative lawsuits.</p>

        {/* 22. Force Majeure */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">22. Force Majeure</h2>
        <p className="text-gray-300 mb-4">AI Media Tank, LLC (AMT) shall not be liable for delays or failures caused by events beyond its reasonable control including: natural disasters; war; cyberattacks; infrastructure failures; government actions.</p>

        {/* 23. Survival */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">23. Survival of Terms</h2>
        <p className="text-gray-300 mb-4">The following sections survive termination: Intellectual Property; Limitation of Liability; Indemnification; Dispute Resolution; Arbitration; Class Action Waiver.</p>

        {/* 24. User Content Responsibility and Safe Harbor */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">24. User Content Responsibility and Safe Harbor</h2>
        <p className="text-gray-300 mb-4">Users are solely responsible for the media, files, text, and other content they upload, publish, or distribute through the Platform (&quot;User Content&quot;). AI Media Tank, LLC (AMT) does not review all uploaded content and does not guarantee the legality, accuracy, or ownership of User Content.</p>
        <p className="text-gray-300 mb-4">By uploading content to the Platform, you represent and warrant that: you own the content or you have obtained all necessary licenses, rights, and permissions to upload and distribute the content.</p>
        <p className="text-gray-300 mb-4">AI Media Tank, LLC (AMT) operates as an online service provider under the Digital Millennium Copyright Act (DMCA) and qualifies for safe harbor protection under 17 U.S.C. §512. The Company shall not be held liable for infringing content uploaded by users, provided that it responds to valid takedown notices and removes infringing material when notified.</p>

        {/* 25. User Liability for Uploaded Media */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">25. User Liability for Uploaded Media</h2>
        <p className="text-gray-300 mb-2">Users are solely responsible for ensuring that media uploaded to the Platform:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>does not infringe copyrights</li>
          <li>does not violate trademarks</li>
          <li>does not violate rights of publicity or privacy</li>
          <li>does not contain unauthorized third-party material</li>
        </ul>
        <p className="text-gray-300 mb-4">The Company does not independently verify ownership of uploaded media. If any claim, lawsuit, or legal dispute arises from uploaded media, the User agrees to indemnify and hold harmless AI Media Tank, LLC (AMT) from any damages, costs, or legal fees resulting from such claims. The Company reserves the right to: remove disputed media; suspend accounts; cooperate with law enforcement when required.</p>

        {/* 26. Changes to Terms */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">26. Changes to Terms</h2>
        <p className="text-gray-300 mb-4">The Company reserves the right to modify these Terms at any time. Updated versions will be posted on the Platform and will become effective upon publication.</p>

        {/* 27. Contact */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">27. Contact Information</h2>
        <div className="bg-tank-dark rounded-xl p-4 space-y-2 mb-4">
          <p className="text-gray-300"><strong>AI Media Tank (AMT) Support</strong></p>
          <p className="text-gray-300">Email: support@aimediatank.com</p>
          <p className="text-gray-300">Website: https://www.aimediatank.com</p>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-tank-light text-center">
          <p className="text-gray-500 text-sm">&copy; 2025–2026 AI Media Tank, LLC (AMT). All rights reserved.</p>
          <p className="text-gray-600 text-xs mt-1">This document should be reviewed by qualified legal counsel. It does not constitute legal advice.</p>
        </div>

        <div className="mt-8 pt-6 border-t border-tank-light flex flex-wrap gap-3">
          {fromPolicy && (
            <Link
              href="/policy"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent font-medium"
            >
              ← Policy Home
            </Link>
          )}
          {!fromAuth && !fromPolicy && (
            <Link
              href="/privacy"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent font-medium"
            >
              Privacy Policy
            </Link>
          )}
          {(!fromAuth || fromLogin) && !fromPolicy && (
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent font-medium"
            >
              Previous to Log in
            </Link>
          )}
          {(!fromAuth || fromRegister) && !fromPolicy && (
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent font-medium"
            >
              Previous to Register
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function TermsPageFallback() {
  return (
    <div className="max-w-4xl mx-auto p-0 m-0 pb-[500px]">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/policy" className="text-tank-accent hover:underline">← Policy Home</Link>
        <span className="text-gray-500">|</span>
        <Link href="/privacy" className="text-tank-accent hover:underline">Privacy Policy</Link>
        <div className="ml-auto flex gap-2">
          <Link href="/login" className="inline-flex items-center px-3 py-1.5 rounded-lg border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent text-sm font-medium">Previous to Log in</Link>
          <Link href="/register" className="inline-flex items-center px-3 py-1.5 rounded-lg border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-tank-accent text-sm font-medium">Previous to Register</Link>
        </div>
      </div>
      <div className="card prose prose-invert max-w-none">
        <h1 className="text-2xl font-bold text-tank-accent mb-2">Terms of Service</h1>
        <p className="text-gray-400 text-sm mb-8">Effective: December 20, 2024 · Last Updated: September 3, 2026</p>
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  )
}

export default function TermsPage() {
  return (
    <Suspense fallback={<TermsPageFallback />}>
      <TermsPageContent />
    </Suspense>
  )
}
