'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useUiLocale } from '@/hooks/useUiLocale'
import { useTranslatedList } from '@/hooks/useTranslatedTexts'
import { calendarLocaleFromUiTag } from '@/lib/localeUi'
import { POLICY_HOME_ORIGINALS, policyHomeIdx } from '@/messages/policyHomeStrings'

const I = policyHomeIdx

function PolicyPageContent() {
  const { data: session } = useSession()
  const { localeTag } = useUiLocale()
  const tr = useTranslatedList(POLICY_HOME_ORIGINALS, localeTag)
  const [policyStatus, setPolicyStatus] = useState<{ agreed: boolean; agreedAt: string | null }>({
    agreed: false,
    agreedAt: null,
  })

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
    return new Date(dateString).toLocaleDateString(calendarLocaleFromUiTag(localeTag), {
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
            <p className="text-green-400 font-medium">{tr[I.agreementTitle]}</p>
            <p className="text-sm text-gray-400">
              {tr[I.agreementLead]}{' '}
              <Link href="/terms?from=policy" className="text-tank-accent hover:underline">
                {tr[I.termsLinkText]}
              </Link>{' '}
              {tr[I.agreementAnd]}{' '}
              <Link href="/privacy?from=policy" className="text-tank-accent hover:underline">
                {tr[I.privacyLinkText]}
              </Link>{' '}
              {tr[I.agreementOn]} {formatDate(policyStatus.agreedAt!)}
            </p>
          </div>
        </div>
      )}

      <div className="relative mb-8">
        <div className="pr-12">
          <h1 className="text-3xl font-bold mb-2">{tr[I.pageTitle]}</h1>
          <p className="text-gray-400">{tr[I.effectiveLine]}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.href = '/'
          }}
          className="absolute right-0 top-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
          aria-label={tr[I.closeAria]}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <a
            href="/terms?from=policy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tank-accent/20 hover:bg-tank-accent/30 text-tank-accent text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {tr[I.downloadTerms]}
          </a>
          <a
            href="/privacy?from=policy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tank-accent/20 hover:bg-tank-accent/30 text-tank-accent text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {tr[I.downloadPrivacy]}
          </a>
        </div>
      </div>

      <p className="text-gray-300 mb-8">{tr[I.intro]}</p>

      <div className="grid gap-6 md:grid-cols-2 mb-12">
        {/* Terms of Service Card */}
        <Link href="/terms?from=policy" className="group block">
          <div className="card h-full border border-tank-light hover:border-tank-accent/50 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-tank-accent/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-tank-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white group-hover:text-tank-accent transition-colors">{tr[I.cardTermsHeading]}</h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">{tr[I.cardTermsLead]}</p>
            <ul className="text-gray-400 text-sm space-y-1.5 mb-4">
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardTermsBullet1]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardTermsBullet2]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardTermsBullet3]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardTermsBullet4]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardTermsBullet5]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardTermsBullet6]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardTermsBullet7]}</span>
              </li>
            </ul>
            <span className="text-tank-accent text-sm font-medium group-hover:underline">{tr[I.cardTermsRead]}</span>
          </div>
        </Link>

        {/* Privacy Policy Card */}
        <Link href="/privacy?from=policy" className="group block">
          <div className="card h-full border border-tank-light hover:border-tank-accent/50 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-tank-accent/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-tank-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white group-hover:text-tank-accent transition-colors">{tr[I.cardPrivacyHeading]}</h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">{tr[I.cardPrivacyLead]}</p>
            <ul className="text-gray-400 text-sm space-y-1.5 mb-4">
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardPrivacyBullet1]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardPrivacyBullet2]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardPrivacyBullet3]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardPrivacyBullet4]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardPrivacyBullet5]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardPrivacyBullet6]}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tank-accent mt-1">&bull;</span>
                <span>{tr[I.cardPrivacyBullet7]}</span>
              </li>
            </ul>
            <span className="text-tank-accent text-sm font-medium group-hover:underline">{tr[I.cardPrivacyRead]}</span>
          </div>
        </Link>
      </div>

      {/* Compliance */}
      <div className="card mb-8">
        <h2 className="text-lg font-bold mb-4">{tr[I.complianceTitle]}</h2>
        <p className="text-gray-400 text-sm mb-4">{tr[I.complianceIntro]}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-gray-300 text-sm">
            <thead>
              <tr className="border-b border-tank-light">
                <th className="text-left py-2 px-3">{tr[I.tableRegulation]}</th>
                <th className="text-left py-2 px-3">{tr[I.tableJurisdiction]}</th>
                <th className="text-left py-2 px-3">{tr[I.tableKeyAreas]}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">{tr[I.rowGdprName]}</td>
                <td className="py-2 px-3">{tr[I.rowGdprRegion]}</td>
                <td className="py-2 px-3">{tr[I.rowGdprKeys]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">{tr[I.rowUkName]}</td>
                <td className="py-2 px-3">{tr[I.rowUkRegion]}</td>
                <td className="py-2 px-3">{tr[I.rowUkKeys]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">{tr[I.rowCcpaName]}</td>
                <td className="py-2 px-3">{tr[I.rowCcpaRegion]}</td>
                <td className="py-2 px-3">{tr[I.rowCcpaKeys]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">{tr[I.rowCoppaName]}</td>
                <td className="py-2 px-3">{tr[I.rowCoppaRegion]}</td>
                <td className="py-2 px-3">{tr[I.rowCoppaKeys]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">{tr[I.rowLgpdName]}</td>
                <td className="py-2 px-3">{tr[I.rowLgpdRegion]}</td>
                <td className="py-2 px-3">{tr[I.rowLgpdKeys]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">{tr[I.rowPipedaName]}</td>
                <td className="py-2 px-3">{tr[I.rowPipedaRegion]}</td>
                <td className="py-2 px-3">{tr[I.rowPipedaKeys]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">{tr[I.rowDmcaName]}</td>
                <td className="py-2 px-3">{tr[I.rowDmcaRegion]}</td>
                <td className="py-2 px-3">{tr[I.rowDmcaKeys]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-2 px-3 font-medium">{tr[I.rowEuAiName]}</td>
                <td className="py-2 px-3">{tr[I.rowEuAiRegion]}</td>
                <td className="py-2 px-3">{tr[I.rowEuAiKeys]}</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">{tr[I.rowPciName]}</td>
                <td className="py-2 px-3">{tr[I.rowPciRegion]}</td>
                <td className="py-2 px-3">{tr[I.rowPciKeys]}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Contact */}
      <div className="card mb-8">
        <h2 className="text-lg font-bold mb-4">{tr[I.contactTitle]}</h2>
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="text-gray-300">
            <span className="text-gray-400">{tr[I.generalSupportLabel]}</span>
            <br />
            support@aimediatank.com
          </div>
          <div className="text-gray-300">
            <span className="text-gray-400">{tr[I.privacyRequestsLabel]}</span>
            <br />
            support@aimediatank.com
            <br />
            <span className="text-gray-500">{tr[I.subjectPrivacy]}</span>
          </div>
          <div className="text-gray-300">
            <span className="text-gray-400">{tr[I.legalInquiriesLabel]}</span>
            <br />
            support@aimediatank.com
            <br />
            <span className="text-gray-500">{tr[I.subjectLegal]}</span>
          </div>
          <div className="text-gray-300">
            <span className="text-gray-400">{tr[I.dmcaLabel]}</span>
            <br />
            support@aimediatank.com
            <br />
            <span className="text-gray-500">{tr[I.subjectDmca]}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-gray-500 text-sm">
        <p>{tr[I.footerCopyright]}</p>
        <p className="mt-1 text-xs text-gray-600">{tr[I.footerDisclaimer]}</p>
      </div>

      <div className="flex justify-start mt-8">
        <button
          type="button"
          onClick={() => {
            window.location.href = '/'
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors"
        >
          &larr; {tr[I.backButton]}
        </button>
      </div>
    </div>
  )
}

function PolicyPageFallback() {
  return (
    <div className="max-w-4xl mx-auto p-0 m-0 pb-[500px]">
      <div className="relative mb-8">
        <div className="pr-12">
          <h1 className="text-3xl font-bold mb-2">Policy Home</h1>
          <p className="text-gray-400">Effective: December 20, 2024 &middot; Last Updated: August 11, 2026</p>
        </div>
      </div>
      <p className="text-gray-300 mb-8">
        AI Media Tank, LLC (AMT) maintains two standalone policy documents that govern your use of the Platform and how we handle your data. Please review both documents carefully.
      </p>
      <div className="animate-pulse flex gap-4">
        <div className="h-32 flex-1 rounded-lg bg-tank-light/30" />
        <div className="h-32 flex-1 rounded-lg bg-tank-light/30" />
      </div>
    </div>
  )
}

export default function PolicyPage() {
  return (
    <Suspense fallback={<PolicyPageFallback />}>
      <PolicyPageContent />
    </Suspense>
  )
}
