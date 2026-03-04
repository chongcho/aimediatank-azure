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
        <p className="text-gray-400 text-sm mb-8">Effective: December 20, 2024 &middot; Last Updated: March 4, 2026</p>

        {/* 1. Scope */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">1. Scope and Compliance</h2>
        <p className="text-gray-300 mb-4">
          This Privacy Policy describes how AiMediaTank (&quot;the Platform,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), located at https://www.aimediatank.com, collects, uses, stores, shares, and protects your personal information. It applies to all users worldwide and complies with:
        </p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>GDPR</strong> — EU General Data Protection Regulation</li>
          <li><strong>UK DPA 2018</strong> — UK Data Protection Act</li>
          <li><strong>CCPA / CPRA</strong> — California Consumer Privacy Act / California Privacy Rights Act</li>
          <li><strong>COPPA</strong> — Children&apos;s Online Privacy Protection Act (U.S.)</li>
          <li><strong>LGPD</strong> — Brazil&apos;s Lei Geral de Proteção de Dados</li>
          <li><strong>PIPEDA</strong> — Canada&apos;s Personal Information Protection and Electronic Documents Act</li>
          <li>Other applicable national, state, and local privacy laws</li>
        </ul>
        <p className="text-gray-300 mb-4">
          This policy should be read alongside our <Link href="/terms" className="text-tank-accent hover:underline">Terms of Service</Link>.
        </p>

        {/* 2. Data Controller */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">2. Data Controller</h2>
        <p className="text-gray-300 mb-4">
          AiMediaTank is the data controller responsible for your personal information. Contact: <strong>support@aimediatank.com</strong> (Subject: &quot;Privacy Request&quot;).
        </p>

        {/* 3. Information We Collect */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">3. Information We Collect</h2>

        <h3 className="text-lg font-semibold mt-6 mb-3">3.1 Information You Provide</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>Account:</strong> Name, legal name, username, email, phone, date of birth</li>
          <li><strong>Profile:</strong> Avatar, biography, location</li>
          <li><strong>Payment:</strong> Billing info via Stripe (card details never stored on our servers)</li>
          <li><strong>Content:</strong> Uploads with metadata, tags, AI tool disclosures, prompts</li>
          <li><strong>Communications:</strong> Messages, comments, ratings, support requests</li>
          <li><strong>Parental consent records</strong> for users aged 13–17</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">3.2 Automatically Collected</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>IP address and approximate geolocation</li>
          <li>Device type, OS, browser type and version</li>
          <li>Pages visited, content viewed, features used, timestamps</li>
          <li>Referring URLs, search queries</li>
          <li>Upload, purchase, and transaction history</li>
          <li>Session duration, interaction patterns</li>
          <li>Cookies and similar tracking technologies</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">3.3 From Third Parties</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>Social login</strong> (Google, Microsoft, Facebook, Apple): name, email, profile picture</li>
          <li><strong>Stripe:</strong> Payment status, transaction confirmations, fraud signals</li>
          <li><strong>Fraud prevention services:</strong> Identity verification data</li>
        </ul>

        {/* 4. Legal Bases */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">4. Legal Bases for Processing</h2>
        <h3 className="text-lg font-semibold mt-6 mb-3">GDPR (EU/EEA/UK)</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-gray-300 text-sm">
            <thead>
              <tr className="border-b border-tank-light">
                <th className="text-left py-2 px-3">Legal Basis</th>
                <th className="text-left py-2 px-3">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">Contract</td>
                <td className="py-2 px-3">Provide Platform, manage accounts, process transactions</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">Consent</td>
                <td className="py-2 px-3">Marketing, non-essential cookies, children&apos;s data processing</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">Legitimate Interests</td>
                <td className="py-2 px-3">Improve Platform, prevent fraud, enforce terms, analytics</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Legal Obligation</td>
                <td className="py-2 px-3">Tax/financial reporting, law enforcement, DMCA</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-300 mb-4">
          You may withdraw consent at any time without affecting the lawfulness of prior processing.
        </p>

        {/* 5. How We Use */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">5. How We Use Your Information</h2>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Create and manage accounts, authenticate identity, verify age</li>
          <li>Provide, maintain, operate, and improve Platform features</li>
          <li>Process payments, subscriptions, uploads, and creator payouts</li>
          <li>Enable messaging, comments, ratings, and notifications</li>
          <li>Send transactional emails, service updates, and security alerts</li>
          <li>Marketing and promotions (consent-based; opt out any time)</li>
          <li>Personalize experience and recommend content</li>
          <li>Detect, prevent, and address fraud, abuse, and security incidents</li>
          <li>Comply with legal obligations and enforce terms</li>
          <li>Conduct analytics and research</li>
        </ul>

        {/* 6. Sharing */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">6. Information Sharing and Disclosure</h2>
        <p className="text-gray-300 mb-4">
          <strong>We do not sell your personal information.</strong> Under CCPA, we confirm we have not sold personal information in the preceding 12 months and do not intend to.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">Service Providers</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-gray-300 text-sm">
            <thead>
              <tr className="border-b border-tank-light">
                <th className="text-left py-2 px-3">Recipient</th>
                <th className="text-left py-2 px-3">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Stripe</td>
                <td className="py-2 px-3">Payments, subscriptions, creator payouts</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Microsoft Azure</td>
                <td className="py-2 px-3">Cloud hosting, storage, database, CDN</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Auth providers (Google, Microsoft, Facebook, Apple)</td>
                <td className="py-2 px-3">Authentication only</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Azure Communication Services</td>
                <td className="py-2 px-3">Email and SMS notifications</td>
              </tr>
              <tr>
                <td className="py-2 px-3">Analytics providers</td>
                <td className="py-2 px-3">Anonymized/aggregated usage data</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold mt-6 mb-3">Other Disclosures</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>Legal requirements:</strong> Law, subpoena, court order, government request</li>
          <li><strong>Law enforcement:</strong> CSAM reporting to NCMEC</li>
          <li><strong>Business transfers:</strong> Mergers, acquisitions, asset sales (same protections apply)</li>
          <li><strong>With your consent:</strong> Any other explicit consent scenarios</li>
        </ul>

        {/* 7. Cookies */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">7. Cookies and Tracking Technologies</h2>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-gray-300 text-sm">
            <thead>
              <tr className="border-b border-tank-light">
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-left py-2 px-3">Purpose</th>
                <th className="text-left py-2 px-3">Duration</th>
                <th className="text-left py-2 px-3">Consent</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Strictly Necessary</td>
                <td className="py-2 px-3">Auth, session, security</td>
                <td className="py-2 px-3">Session–30 days</td>
                <td className="py-2 px-3">No</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Functional</td>
                <td className="py-2 px-3">Preferences (language, theme)</td>
                <td className="py-2 px-3">Up to 1 year</td>
                <td className="py-2 px-3">No</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3">Analytics</td>
                <td className="py-2 px-3">Usage, errors, performance</td>
                <td className="py-2 px-3">Up to 2 years</td>
                <td className="py-2 px-3">Yes*</td>
              </tr>
              <tr>
                <td className="py-2 px-3">Marketing</td>
                <td className="py-2 px-3">Promotions</td>
                <td className="py-2 px-3">Up to 1 year</td>
                <td className="py-2 px-3">Yes</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-400 text-sm mb-4">* Where required by law (e.g., GDPR/ePrivacy).</p>
        <p className="text-gray-300 mb-4">
          Manage cookies via browser settings or our consent banner. Disabling essential cookies may impair functionality.
        </p>

        {/* 8. Security */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">8. Data Security</h2>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>HTTPS/TLS encryption in transit</li>
          <li>Encrypted data at rest (Azure services)</li>
          <li>Bcrypt password hashing</li>
          <li>Role-based access controls, least privilege</li>
          <li>Regular vulnerability testing and security reviews</li>
          <li>Automated threat detection and monitoring</li>
          <li>Incident response and breach notification (GDPR Art. 33/34 compliant)</li>
        </ul>
        <p className="text-gray-300 mb-4">
          No system is 100% secure. You are responsible for safeguarding your credentials and reporting unauthorized access.
        </p>

        {/* 9. Your Rights */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">9. Your Privacy Rights</h2>
        <p className="text-gray-300 mb-4">
          To exercise any right: email <strong>support@aimediatank.com</strong> (Subject: &quot;Privacy Request&quot;). Response within <strong>30 days</strong>. Identity verification may be required.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">9.1 All Users</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-gray-300 text-sm">
            <thead>
              <tr className="border-b border-tank-light">
                <th className="text-left py-2 px-3">Right</th>
                <th className="text-left py-2 px-3">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">Access</td>
                <td className="py-2 px-3">Request a copy of your personal data</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">Correction</td>
                <td className="py-2 px-3">Correct inaccurate or incomplete data</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">Deletion</td>
                <td className="py-2 px-3">Delete your account and personal data</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">Portability</td>
                <td className="py-2 px-3">Data in machine-readable format (JSON/CSV)</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">Opt-Out</td>
                <td className="py-2 px-3">Unsubscribe from marketing any time</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Withdraw Consent</td>
                <td className="py-2 px-3">Withdraw consent for consent-based processing</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold mt-6 mb-3">9.2 EU/EEA/UK (GDPR)</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>Restriction</strong> — restrict processing in certain circumstances</li>
          <li><strong>Objection</strong> — object to legitimate-interest processing</li>
          <li><strong>Automated Decisions</strong> — not subject to solely automated decisions with legal effects</li>
          <li><strong>Supervisory Authority</strong> — lodge complaint with your local data protection authority</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">9.3 California (CCPA/CPRA)</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>Right to Know</strong> — categories and specific data collected</li>
          <li><strong>Right to Delete</strong> — request deletion</li>
          <li><strong>No Sale</strong> — we do not sell personal information</li>
          <li><strong>Non-Discrimination</strong> — no penalties for exercising rights</li>
          <li><strong>Correct</strong> — fix inaccurate data</li>
          <li><strong>Limit Sensitive Data</strong> — restrict sensitive data use</li>
          <li><strong>Authorized Agent</strong> — designate someone to act on your behalf</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">9.4 Brazil (LGPD) &amp; Canada (PIPEDA)</h3>
        <p className="text-gray-300 mb-4">
          <strong>Brazil:</strong> Rights similar to GDPR; right to petition ANPD.<br />
          <strong>Canada:</strong> Access, correct, and challenge accuracy; complain to the Privacy Commissioner of Canada.
        </p>

        {/* 10. Children */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">10. Children&apos;s Privacy</h2>
        <h3 className="text-lg font-semibold mt-6 mb-3">Under 13</h3>
        <p className="text-gray-300 mb-4">
          We do not knowingly collect data from children under 13. The Platform is not for children under 13. If you believe a child under 13 has provided personal information, contact us immediately — we will delete it.
        </p>
        <h3 className="text-lg font-semibold mt-6 mb-3">Ages 13–17</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>Data collected <strong>only with verifiable parental consent</strong>.</li>
          <li>Parents/guardians may: review data, request deletion, refuse further collection, restrict features.</li>
          <li>Contact: support@aimediatank.com (Subject: &quot;Parental Request&quot;).</li>
        </ul>
        <h3 className="text-lg font-semibold mt-6 mb-3">Protections for All Minors</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>No</strong> targeted advertising, profiling, or behavioral tracking for under-18 users.</li>
          <li>Automatic content filtering for ages 13–17 (cannot be disabled).</li>
          <li>Minor data is <strong>not</strong> shared with third parties for marketing.</li>
        </ul>

        {/* 11. Retention */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">11. Data Retention</h2>
        <h3 className="text-lg font-semibold mt-6 mb-3">Content</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-gray-300 text-sm">
            <thead>
              <tr className="border-b border-tank-light">
                <th className="text-left py-2 px-3">Data</th>
                <th className="text-left py-2 px-3">Retention</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-tank-light/50"><td className="py-2 px-3">Uploaded content</td><td className="py-2 px-3">While account active</td></tr>
              <tr className="border-b border-tank-light/50"><td className="py-2 px-3">Purchased content</td><td className="py-2 px-3">While hosted on Platform</td></tr>
              <tr className="border-b border-tank-light/50"><td className="py-2 px-3">Inactive media</td><td className="py-2 px-3">Archived/removed after 60 days (with notice)</td></tr>
              <tr><td className="py-2 px-3">Deleted content</td><td className="py-2 px-3">Removed within 30 days</td></tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold mt-6 mb-3">User Data</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-gray-300 text-sm">
            <thead>
              <tr className="border-b border-tank-light">
                <th className="text-left py-2 px-3">Data</th>
                <th className="text-left py-2 px-3">Retention</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-tank-light/50"><td className="py-2 px-3">Account info</td><td className="py-2 px-3">While active; 30 days post-termination</td></tr>
              <tr className="border-b border-tank-light/50"><td className="py-2 px-3">Transaction records</td><td className="py-2 px-3">7 years (legal/tax)</td></tr>
              <tr className="border-b border-tank-light/50"><td className="py-2 px-3">Usage logs</td><td className="py-2 px-3">90 days</td></tr>
              <tr className="border-b border-tank-light/50"><td className="py-2 px-3">Support communications</td><td className="py-2 px-3">2 years</td></tr>
              <tr className="border-b border-tank-light/50"><td className="py-2 px-3">Parental consent records</td><td className="py-2 px-3">Account + 3 years</td></tr>
              <tr><td className="py-2 px-3">Security/fraud logs</td><td className="py-2 px-3">2 years</td></tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold mt-6 mb-3">Backups</h3>
        <p className="text-gray-300 mb-4">
          Encrypted backups retained 30 days. Deleted data purged from backups within 60 days.
        </p>

        {/* 12. International Transfers */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">12. International Data Transfers</h2>
        <p className="text-gray-300 mb-4">
          Infrastructure on <strong>Microsoft Azure</strong> (data centers in the US and other regions). By using the Platform, you acknowledge data may be processed in the US and other countries.
        </p>
        <h3 className="text-lg font-semibold mt-6 mb-3">Safeguards</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li>EU-approved Standard Contractual Clauses (SCCs)</li>
          <li>Data Processing Agreements with all providers</li>
          <li>Azure certifications: EU-U.S. Data Privacy Framework, ISO 27001, SOC 1/2/3</li>
          <li>Stripe PCI DSS Level 1</li>
          <li>Encryption in transit (TLS) and at rest</li>
        </ul>
        <h3 className="text-lg font-semibold mt-6 mb-3">Regional Details</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>EU/EEA/UK:</strong> GDPR compliant; SCCs for transfers; ROPA maintained; lodge complaints with local authority.</li>
          <li><strong>California:</strong> CCPA/CPRA compliant; no sale of data; authorized agent requests accepted.</li>
          <li><strong>Brazil:</strong> LGPD compliant; petition ANPD.</li>
          <li><strong>Canada:</strong> PIPEDA compliant; complain to Privacy Commissioner.</li>
        </ul>

        {/* 13. Third-Party */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">13. Third-Party Services and Social Platforms</h2>

        <h3 className="text-lg font-semibold mt-6 mb-3">Social Login</h3>
        <p className="text-gray-300 mb-4">
          Sign in via Google, Microsoft, Facebook, or Apple. We receive limited data (name, email, picture) as authorized. We do not access posts, friends, or messages. Revoke access via the provider&apos;s settings.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-3">Social Sharing</h3>
        <p className="text-gray-300 mb-2">When you share content, the destination platform&apos;s privacy policy governs their data collection:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
          <li><strong>YouTube</strong> — <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">Google Privacy Policy</a></li>
          <li><strong>TikTok</strong> — <a href="https://www.tiktok.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">TikTok Privacy Policy</a></li>
          <li><strong>X (Twitter)</strong> — <a href="https://x.com/en/privacy" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">X Privacy Policy</a></li>
          <li><strong>Facebook, LinkedIn, Reddit, WhatsApp</strong> — governed by each platform&apos;s respective policy</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-3">Payment &amp; Infrastructure</h3>
        <p className="text-gray-300 mb-4">
          <strong>Stripe</strong> handles payments (<a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">Stripe Privacy</a>). <strong>Microsoft Azure</strong> provides hosting (<a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noopener noreferrer" className="text-tank-accent hover:underline">Azure Privacy</a>). We do not store card details.
        </p>

        <p className="text-gray-300 mb-4 text-sm">
          AiMediaTank is not affiliated with or endorsed by Google LLC, ByteDance Ltd., X Corp., Meta Platforms, Inc., Apple Inc., or Microsoft Corporation.
        </p>

        {/* 14. DNT */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">14. Do Not Track Signals</h2>
        <p className="text-gray-300 mb-4">
          We do not currently respond to DNT browser signals (no uniform standard exists). Regardless: we do not sell data and do not track across third-party sites for advertising. Control cookies via Section 7.
        </p>

        {/* 15. Changes */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">15. Changes to This Privacy Policy</h2>
        <p className="text-gray-300 mb-4">
          We may update this policy. Material changes communicated via email or prominent notice at least <strong>14 days</strong> before taking effect. Continued use constitutes acceptance. If you disagree, discontinue use and request data deletion.
        </p>

        {/* 16. Contact */}
        <h2 className="text-xl font-bold mt-10 mb-4 text-white">16. Contact Information</h2>
        <div className="bg-tank-dark rounded-xl p-4 space-y-2 mb-4">
          <p className="text-gray-300"><strong>Privacy / Data Requests:</strong> support@aimediatank.com (Subject: &quot;Privacy Request&quot;)</p>
          <p className="text-gray-300"><strong>Parental Rights:</strong> support@aimediatank.com (Subject: &quot;Parental Request&quot;)</p>
          <p className="text-gray-300"><strong>General Support:</strong> support@aimediatank.com</p>
          <p className="text-gray-300"><strong>Law Enforcement:</strong> support@aimediatank.com (Subject: &quot;Law Enforcement Request&quot;)</p>
          <p className="text-gray-300"><strong>Website:</strong> https://www.aimediatank.com</p>
          <p className="text-gray-400 text-sm mt-2">Response: within 2 business days. Data requests: within 30 days.</p>
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
