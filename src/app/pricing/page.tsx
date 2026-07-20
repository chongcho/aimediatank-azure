'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguageModeList } from '@/hooks/useLanguageModeText'

const PRICING_STRINGS = [
  'Welcome to',
  'Your subscription is now active. Enjoy your new benefits!',
  'Close',
  'Choose Your Plan',
  'Your current plan:',
  'Unlimited Free Uploads',
  'Upload',
  'Uploads',
  'Left',
  'Free Upload',
  'Free Uploads',
  'free',
  'credits',
  'Cancel Subscription',
  'Loading...',
  'Processing...',
  'Current Plan',
  'Buy/Change Plan',
  'Viewer Plan',
  'Basic Plan',
  'Advanced Plan',
  'Premium Plan',
  'Suit for occasional creators',
  'Suit for moderate creators',
  'Suit for scale creators',
  'Five Free Uploads',
  '$1 per Upload after Five Free Uploads',
  '$0.5 per Upload after Five Free Uploads',
  '5 Free Uploads',
  '5 Free + $1/upload',
  '5 Free + $0.5/upload',
  'Unlimited Free',
  'Free',
  '/month',
  'or',
  '/year',
  'View contents',
  'Buy contents',
  'Comparison',
  'Feature',
  'Viewer',
  'Basic',
  'Advanced',
  'Premium',
  'Monthly Price',
  'Yearly Price',
  'Free Uploads',
  'After Free Uploads',
  '5 uploads',
  'Unlimited',
  '—',
  '$1 per upload',
  '$0.5 per upload',
  'View Contents',
  'Buy Contents',
  'Sell Contents',
  'Frequently Asked Questions',
  'Can I cancel anytime?',
  'Yes, you can cancel your subscription at any time. Your benefits will continue until the end of your billing period.',
  'What payment methods do you accept?',
  'We accept all major credit cards and debit cards through our secure Stripe payment system.',
  'What happens to my uploads if I cancel?',
  'Your existing uploads will remain on the platform. However, you won\'t be able to upload new content until you resubscribe.',
  'Can I upgrade or downgrade?',
  'Yes, you can change your plan at any time using the "Change / Cancel Subscription" button above.',
  'Choose Billing Period',
  'You selected:',
  'Monthly',
  'Billed every month',
  'Yearly',
  'Billed annually',
  'You can cancel anytime. Your subscription will continue until the end of the billing period.',
  'Manage Subscription',
  'Downgrade to Basic ($5/month)',
  'Keep Subscription',
  'Changes take effect immediately. Your existing uploads will not be affected.',
  '← Back',
] as const

const S = {
  welcomePrefix: 0,
  successMessage: 1,
  close: 2,
  chooseYourPlan: 3,
  yourCurrentPlan: 4,
  unlimitedFreeUploads: 5,
  uploadSingular: 6,
  uploadPlural: 7,
  left: 8,
  freeUploadSingular: 9,
  freeUploadPlural: 10,
  freeWord: 11,
  creditsWord: 12,
  cancelSubscription: 13,
  loading: 14,
  processing: 15,
  currentPlan: 16,
  buyChangePlan: 17,
  viewerPlan: 18,
  basicPlan: 19,
  advancedPlan: 20,
  premiumPlan: 21,
  descOccasional: 22,
  descModerate: 23,
  descScale: 24,
  fiveFreeUploads: 25,
  onePerUploadAfter: 26,
  halfPerUploadAfter: 27,
  fiveFreeShort: 28,
  fiveFreePlusOne: 29,
  fiveFreePlusHalf: 30,
  unlimitedFreeShort: 31,
  free: 32,
  perMonth: 33,
  or: 34,
  perYear: 35,
  viewContents: 36,
  buyContents: 37,
  planComparison: 38,
  feature: 39,
  viewer: 40,
  basic: 41,
  advanced: 42,
  premium: 43,
  monthlyPrice: 44,
  yearlyPrice: 45,
  freeUploads: 46,
  afterFreeUploads: 47,
  fiveUploads: 48,
  unlimited: 49,
  emDash: 50,
  onePerUpload: 51,
  halfPerUpload: 52,
  viewContentsTitle: 53,
  buyContentsTitle: 54,
  sellContentsTitle: 55,
  faqTitle: 56,
  faqCancelQ: 57,
  faqCancelA: 58,
  faqPaymentQ: 59,
  faqPaymentA: 60,
  faqUploadsQ: 61,
  faqUploadsA: 62,
  faqChangeQ: 63,
  faqChangeA: 64,
  chooseBillingPeriod: 65,
  youSelected: 66,
  monthly: 67,
  billedMonthly: 68,
  yearly: 69,
  billedAnnually: 70,
  billingCancelNote: 71,
  manageSubscription: 72,
  downgradeToBasic: 73,
  keepSubscription: 74,
  manageChangesNote: 75,
  back: 76,
} as const

const plans = [
  {
    id: 'viewer',
    price: 0,
    yearlyPrice: 0,
    period: 'month',
    isFree: true,
    strings: {
      name: S.viewerPlan,
      description: S.descOccasional,
      uploadCost: S.fiveFreeUploads,
      uploadCostShort: S.fiveFreeShort,
    },
  },
  {
    id: 'basic',
    price: 2,
    yearlyPrice: 20,
    period: 'month',
    strings: {
      name: S.basicPlan,
      description: S.descOccasional,
      uploadCost: S.onePerUploadAfter,
      uploadCostShort: S.fiveFreePlusOne,
    },
  },
  {
    id: 'advanced',
    price: 5,
    yearlyPrice: 50,
    period: 'month',
    strings: {
      name: S.advancedPlan,
      description: S.descModerate,
      uploadCost: S.halfPerUploadAfter,
      uploadCostShort: S.fiveFreePlusHalf,
    },
  },
  {
    id: 'premium',
    price: 8,
    yearlyPrice: 80,
    period: 'month',
    strings: {
      name: S.premiumPlan,
      description: S.descScale,
      uploadCost: S.unlimitedFreeUploads,
      uploadCostShort: S.unlimitedFreeShort,
    },
  },
]

const comparisonPlanLabels: Record<(typeof plans)[number]['id'], number> = {
  viewer: S.viewer,
  basic: S.basic,
  advanced: S.advanced,
  premium: S.premium,
}

// Helper to get plan details by membership type
const getPlanByMembership = (membership: string) => {
  const planId = membership.toLowerCase()
  return plans.find(p => p.id === planId) || plans[0]
}

interface UploadStatus {
  freeUploadsUsed: number
  freeUploadsRemaining: number | string
  bonusCredits?: number
  totalCredits?: number
  uploadsAvailable?: number | string
  costPerUpload: number
  statusMessage: string
  statusType: 'free' | 'paid' | 'blocked'
}

function PricingPageContent() {
  const { data: session, update: updateSession } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tr = useLanguageModeList(PRICING_STRINGS)
  const [loading, setLoading] = useState<string | null>(null)
  const [currentMembership, setCurrentMembership] = useState('VIEWER')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [manageLoading, setManageLoading] = useState<string | null>(null)
  const [showBillingModal, setShowBillingModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0] | null>(null)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [policyAgreed, setPolicyAgreed] = useState(false)
  const [purchasedPlanId, setPurchasedPlanId] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null)

  const getPlanLabel = (plan: (typeof plans)[number]) => tr[plan.strings.name]

  // Check for success parameter on mount
  useEffect(() => {
    const success = searchParams.get('success')
    const planId = searchParams.get('plan')
    
    if (success === 'true' && planId) {
      const plan = plans.find(p => p.id === planId)
      if (plan) {
        setPurchasedPlanId(planId)
        setShowSuccessMessage(true)
        
        // Refresh session to get updated role
        updateSession()
        
        // Refresh membership after a short delay to allow webhook to process
        setTimeout(() => {
          fetchMembership()
        }, 2000)
        
        // Auto-hide success message after 10 seconds
        setTimeout(() => {
          setShowSuccessMessage(false)
          // Clean up URL
          router.replace('/pricing', { scroll: false })
        }, 10000)
      }
    }
  }, [searchParams])

  useEffect(() => {
    if (session?.user) {
      fetchMembership()
    }
  }, [session])

  const fetchMembership = async () => {
    try {
      const res = await fetch('/api/user/profile')
      const data = await res.json()
      if (data.user?.membershipType) {
        setCurrentMembership(data.user.membershipType)
      }
      
      // Also fetch upload status
      const uploadRes = await fetch('/api/upload/status')
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json()
        setUploadStatus({
          freeUploadsUsed: uploadData.freeUploadsUsed,
          freeUploadsRemaining: uploadData.freeUploadsRemaining,
          bonusCredits: uploadData.bonusCredits,
          totalCredits: uploadData.totalCredits,
          uploadsAvailable: uploadData.uploadsAvailable,
          costPerUpload: uploadData.costPerUpload,
          statusMessage: uploadData.statusMessage,
          statusType: uploadData.statusType,
        })
      }
    } catch (error) {
      console.error('Error fetching membership:', error)
    }
  }

  const handleBuyPlanClick = (plan: typeof plans[0]) => {
    if (!session) {
      router.push('/login')
      return
    }

    if (plan.id === 'viewer') return

    // Show billing period selection modal
    setSelectedPlan(plan)
    setShowBillingModal(true)
  }

  const handleSubscribe = async (billingPeriod: 'month' | 'year') => {
    if (!selectedPlan) return

    setShowBillingModal(false)
    setLoading(selectedPlan.id)

    try {
      const res = await fetch('/api/stripe/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan.id, billingPeriod }),
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        // Show detailed error for debugging
        const errorMsg = data.details 
          ? `${data.error}: ${data.details}` 
          : data.error || 'Failed to start checkout'
        alert(errorMsg)
        console.error('Checkout error:', data)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to start checkout')
    } finally {
      setLoading(null)
      setSelectedPlan(null)
    }
  }

  const handleManageSubscription = async () => {
    setCancelLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
      })
      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else if (data.showManualOptions) {
        // Show manual management modal
        setShowManageModal(true)
      } else {
        alert(data.error || 'Failed to open billing portal')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to open billing portal')
    } finally {
      setCancelLoading(false)
    }
  }

  const handleManageAction = async (action: 'cancel' | 'downgrade') => {
    setManageLoading(action)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sendEmail: true }),
      })
      const data = await res.json()

      if (data.success) {
        setShowManageModal(false)
        fetchMembership() // Refresh membership status
        // Show success message briefly
        alert(data.message)
      } else {
        alert(data.error || 'Failed to update subscription')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to update subscription')
    } finally {
      setManageLoading(null)
    }
  }

  const isCurrentPlan = (planId: string) => {
    return currentMembership.toLowerCase() === planId.toLowerCase()
  }

  const hasPaidSubscription = currentMembership !== 'VIEWER'

  const purchasedPlan = purchasedPlanId ? plans.find(p => p.id === purchasedPlanId) : null

  return (
    <div className="max-w-6xl mx-auto p-0 m-0 pb-[500px]">
      {/* Success Message Banner */}
      {showSuccessMessage && purchasedPlan && (
        <div className="relative mb-8 p-6 bg-gradient-to-r from-tank-accent/20 to-emerald-500/20 border border-tank-accent rounded-xl">
          <div className="flex items-center justify-center gap-4">
            <div className="text-4xl">🎉</div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-tank-accent mb-1">
                {tr[S.welcomePrefix]} {getPlanLabel(purchasedPlan)}!
              </h2>
              <p className="text-gray-300">
                {tr[S.successMessage]}
              </p>
            </div>
            <div className="text-4xl">🎉</div>
          </div>
          <button
            onClick={() => {
              setShowSuccessMessage(false)
              router.replace('/pricing', { scroll: false })
            }}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
            aria-label={tr[S.close]}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex items-center justify-center relative pt-[25px] mb-8">
        <h1 className="text-[18px] font-bold">{tr[S.chooseYourPlan]}</h1>
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute right-2 w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
          aria-label={tr[S.close]}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Current Plan Banner */}
      {session && (
        <div className="mb-8 p-4 bg-tank-accent/10 border border-tank-accent/30 rounded-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <p className="text-tank-accent">
              {tr[S.yourCurrentPlan]} <span className="font-bold">{currentMembership}</span>
            </p>
              {uploadStatus ? (
                <div className="flex items-center gap-2">
                  {uploadStatus.uploadsAvailable === 'Unlimited' ||
                  uploadStatus.freeUploadsRemaining === 'Unlimited' ? (
                    <span className="text-sm text-tank-accent bg-tank-gray px-3 py-1 rounded-full">
                      ✨ {tr[S.unlimitedFreeUploads]}
                    </span>
                  ) : typeof uploadStatus.uploadsAvailable === 'number' &&
                    uploadStatus.uploadsAvailable > 0 ? (
                    <span className="text-sm text-gray-300 bg-tank-gray px-3 py-1 rounded-full">
                      {/* Keep English — MT mangled “uploads left” / counts */}
                      🎁 You have {uploadStatus.uploadsAvailable} upload credit
                      {uploadStatus.uploadsAvailable !== 1 ? 's' : ''} to post
                      {typeof uploadStatus.freeUploadsRemaining === 'number' &&
                      uploadStatus.freeUploadsRemaining > 0 &&
                      (uploadStatus.totalCredits || 0) > 0
                        ? ` (${uploadStatus.freeUploadsRemaining} free + ${uploadStatus.totalCredits} credit${uploadStatus.totalCredits !== 1 ? 's' : ''})`
                        : ''}
                    </span>
                  ) : typeof uploadStatus.freeUploadsRemaining === 'number' &&
                    uploadStatus.freeUploadsRemaining > 0 ? (
                    <span className="text-sm text-gray-300 bg-tank-gray px-3 py-1 rounded-full">
                      🎁 {uploadStatus.freeUploadsRemaining}{' '}
                      {uploadStatus.freeUploadsRemaining !== 1 ? tr[S.freeUploadPlural] : tr[S.freeUploadSingular]}{' '}
                      {tr[S.left]}
                    </span>
                  ) : (
                    <span className="text-sm text-yellow-400 bg-yellow-500/10 px-3 py-1 rounded-full">
                      💳 ${uploadStatus.costPerUpload.toFixed(2)}/upload
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-sm text-gray-300 bg-tank-gray px-3 py-1 rounded-full">
                  {PRICING_STRINGS[getPlanByMembership(currentMembership).strings.uploadCostShort]}
                </span>
              )}
            </div>
            {hasPaidSubscription && (
              <button
                onClick={handleManageSubscription}
                disabled={cancelLoading}
                className="px-4 py-2 bg-tank-gray border border-tank-light rounded-lg hover:bg-tank-light transition-colors text-sm flex items-center gap-2"
              >
                {cancelLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    {tr[S.loading]}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {tr[S.cancelSubscription]}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        {plans.map((plan) => {
          const current = isCurrentPlan(plan.id)
          return (
          <div
            key={plan.id}
            className={`relative bg-tank-gray rounded-2xl border-2 transition-all ${
              current
                ? 'border-tank-accent'
                : 'border-gray-500 hover:border-gray-400'
            }`}
          >
            <div className="p-6 text-center">
              {/* Plan names stay English; descriptions follow language mode */}
              <h3 className="text-xl font-bold mb-2">{PRICING_STRINGS[plan.strings.name]}</h3>
              <p className="text-gray-400 text-sm italic mb-6">{tr[plan.strings.description]}</p>

              {/* Pricing — stay English */}
              <div className="mb-2">
                {plan.isFree ? (
                  <span className="text-4xl font-bold">{PRICING_STRINGS[S.free]}</span>
                ) : (
                  <>
                <span className="text-4xl font-bold">${plan.price}</span>
                <span className="text-gray-400">{PRICING_STRINGS[S.perMonth]}</span>
                  </>
                )}
              </div>
              {!plan.isFree && (
              <p className="text-gray-500 text-sm mb-4">{PRICING_STRINGS[S.or]} ${plan.yearlyPrice}{PRICING_STRINGS[S.perYear]}</p>
              )}
              {plan.isFree && <p className="text-gray-500 text-sm mb-4">&nbsp;</p>}

              {/* Upload cost stays English — MT can corrupt prices (e.g. $0.5 → $5) */}
              <div className="mb-6 py-3">
                <span className={`text-sm font-semibold ${current ? 'text-tank-accent' : 'text-white'}`}>
                  {PRICING_STRINGS[plan.strings.uploadCost]}
                </span>
              </div>

              <div className="space-y-2 mb-8">
                <p className="text-gray-300">{tr[S.viewContents]}</p>
                <p className="text-gray-300">{tr[S.buyContents]}</p>
              </div>

              {/* Button: hide Buy/Change on free Viewer; always show Current Plan when selected */}
              {(current || !plan.isFree) && (
                <button
                  onClick={() => handleBuyPlanClick(plan)}
                  disabled={loading !== null || current}
                  className={`w-full py-3 rounded-xl font-semibold transition-all ${
                    current
                      ? 'bg-tank-gray border-2 border-tank-accent text-tank-accent cursor-not-allowed'
                      : 'bg-tank-gray border-2 border-tank-light text-white hover:bg-tank-light hover:border-gray-400'
                  }`}
                >
                  {loading === plan.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                      {tr[S.processing]}
                    </span>
                  ) : current ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {tr[S.currentPlan]}
                    </span>
                  ) : (
                    tr[S.buyChangePlan]
                  )}
                </button>
              )}
            </div>
          </div>
          )
        })}
      </div>

      {/* Comparison Table — values stay English; title + feature labels follow language mode */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-center mb-8">
          {/* Keep PLAN in English — MT often mistranslates “Plan” */}
          PLAN {tr[S.planComparison]}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full max-w-4xl mx-auto">
            <thead>
              <tr className="border-b border-tank-light">
                <th className="text-left py-4 px-4 font-semibold">{tr[S.feature]}</th>
                {(['viewer', 'basic', 'advanced', 'premium'] as const).map((planId) => (
                  <th
                    key={planId}
                    className={`text-center py-4 px-4 font-semibold capitalize ${
                      isCurrentPlan(planId) ? 'text-tank-accent' : 'text-white'
                    }`}
                  >
                    {PRICING_STRINGS[comparisonPlanLabels[planId]]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">{tr[S.monthlyPrice]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('viewer') ? 'text-tank-accent' : ''}`}>{PRICING_STRINGS[S.free]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('basic') ? 'text-tank-accent' : ''}`}>$2{PRICING_STRINGS[S.perMonth]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('advanced') ? 'text-tank-accent' : ''}`}>$5{PRICING_STRINGS[S.perMonth]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('premium') ? 'text-tank-accent' : ''}`}>$8{PRICING_STRINGS[S.perMonth]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">{tr[S.yearlyPrice]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('viewer') ? 'text-tank-accent' : ''}`}>{PRICING_STRINGS[S.free]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('basic') ? 'text-tank-accent' : ''}`}>$20{PRICING_STRINGS[S.perYear]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('advanced') ? 'text-tank-accent' : ''}`}>$50{PRICING_STRINGS[S.perYear]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('premium') ? 'text-tank-accent' : ''}`}>$80{PRICING_STRINGS[S.perYear]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">{tr[S.freeUploads]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('viewer') ? 'text-tank-accent' : ''}`}>{PRICING_STRINGS[S.fiveUploads]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('basic') ? 'text-tank-accent' : ''}`}>{PRICING_STRINGS[S.fiveUploads]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('advanced') ? 'text-tank-accent' : ''}`}>{PRICING_STRINGS[S.fiveUploads]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('premium') ? 'text-tank-accent' : ''}`}>{PRICING_STRINGS[S.unlimited]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">{tr[S.afterFreeUploads]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('viewer') ? 'text-tank-accent' : 'text-gray-500'}`}>{PRICING_STRINGS[S.emDash]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('basic') ? 'text-tank-accent' : ''}`}>{PRICING_STRINGS[S.onePerUpload]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('advanced') ? 'text-tank-accent' : ''}`}>{PRICING_STRINGS[S.halfPerUpload]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('premium') ? 'text-tank-accent' : ''}`}>{PRICING_STRINGS[S.free]}</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">{tr[S.viewContentsTitle]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('viewer') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('basic') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('advanced') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('premium') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">{tr[S.buyContentsTitle]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('viewer') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('basic') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('advanced') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('premium') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">{tr[S.sellContentsTitle]}</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('viewer') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('basic') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('advanced') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
                <td className={`py-4 px-4 text-center ${isCurrentPlan('premium') ? 'text-tank-accent' : 'text-white'}`}>✓</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-center mb-8">{tr[S.faqTitle]}</h2>
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="bg-tank-gray rounded-xl p-6">
            <h3 className="font-semibold mb-2">{tr[S.faqCancelQ]}</h3>
            <p className="text-gray-400 text-sm">
              {tr[S.faqCancelA]}
            </p>
          </div>
          <div className="bg-tank-gray rounded-xl p-6">
            <h3 className="font-semibold mb-2">{tr[S.faqPaymentQ]}</h3>
            <p className="text-gray-400 text-sm">
              {tr[S.faqPaymentA]}
            </p>
          </div>
          <div className="bg-tank-gray rounded-xl p-6">
            <h3 className="font-semibold mb-2">{tr[S.faqUploadsQ]}</h3>
            <p className="text-gray-400 text-sm">
              {tr[S.faqUploadsA]}
            </p>
          </div>
          <div className="bg-tank-gray rounded-xl p-6">
            <h3 className="font-semibold mb-2">{tr[S.faqChangeQ]}</h3>
            <p className="text-gray-400 text-sm">
              {tr[S.faqChangeA]}
            </p>
          </div>
        </div>
      </div>

      {/* Billing Period Selection Modal */}
      {showBillingModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-500 border border-gray-400 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">{tr[S.chooseBillingPeriod]}</h3>
              <button
                onClick={() => {
                  setShowBillingModal(false)
                  setSelectedPlan(null)
                  setPolicyAgreed(false)
                }}
                className="p-2 hover:bg-gray-400 rounded-lg transition-colors"
                aria-label={tr[S.close]}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-gray-200 mb-6 text-center">
              {tr[S.youSelected]} <span className="text-tank-accent font-bold">{tr[selectedPlan.strings.name]}</span>
            </p>

            <div className="space-y-4">
              {/* Monthly Option */}
              <button
                onClick={() => handleSubscribe('month')}
                className="w-full p-4 h-20 bg-gray-600 border-2 border-gray-400 rounded-xl transition-all group hover:border-tank-accent hover:bg-gray-500 cursor-pointer"
              >
                <div className="flex items-center justify-between h-full">
                  <div className="text-left">
                    <p className="font-semibold text-lg text-white group-hover:text-tank-accent transition-colors">{tr[S.monthly]}</p>
                    <p className="text-gray-300 text-sm">{tr[S.billedMonthly]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${selectedPlan.price}</p>
                    <p className="text-gray-300 text-sm">{tr[S.perMonth]}</p>
                  </div>
                </div>
              </button>

              {/* Yearly Option */}
              <button
                onClick={() => handleSubscribe('year')}
                className="w-full p-4 h-20 bg-gray-600 border-2 border-gray-400 rounded-xl transition-all group hover:border-tank-accent hover:bg-gray-500 cursor-pointer"
              >
                <div className="flex items-center justify-between h-full">
                  <div className="text-left">
                    <p className="font-semibold text-lg text-white group-hover:text-tank-accent transition-colors">{tr[S.yearly]}</p>
                    <p className="text-gray-300 text-sm">{tr[S.billedAnnually]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${selectedPlan.yearlyPrice}</p>
                    <p className="text-gray-300 text-sm">{tr[S.perYear]}</p>
                  </div>
                </div>
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-4 text-center">
              {tr[S.billingCancelNote]}
            </p>
          </div>
        </div>
      )}

      {/* Manage Subscription Modal */}
      {showManageModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-tank-dark border border-tank-light rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">{tr[S.manageSubscription]}</h3>
              <button
                onClick={() => setShowManageModal(false)}
                className="p-2 hover:bg-tank-light rounded-lg transition-colors"
                aria-label={tr[S.close]}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-gray-400 mb-6">
              {tr[S.yourCurrentPlan]} <span className="text-tank-accent font-bold">{currentMembership}</span>
            </p>

            <div className="space-y-3">
              {currentMembership === 'PREMIUM' && (
                <button
                  onClick={() => handleManageAction('downgrade')}
                  disabled={manageLoading !== null}
                  className="w-full py-3 px-4 bg-yellow-500/20 text-yellow-400 rounded-xl hover:bg-yellow-500/30 transition-colors flex items-center justify-center gap-2"
                >
                  {manageLoading === 'downgrade' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                      {tr[S.processing]}
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      {tr[S.downgradeToBasic]}
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => handleManageAction('cancel')}
                disabled={manageLoading !== null}
                className="w-full py-3 px-4 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2"
              >
                {manageLoading === 'cancel' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    {tr[S.processing]}
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {tr[S.cancelSubscription]}
                  </>
                )}
              </button>

              <button
                onClick={() => setShowManageModal(false)}
                className="w-full py-3 px-4 bg-tank-gray text-gray-400 rounded-xl hover:bg-tank-light transition-colors"
              >
                {tr[S.keepSubscription]}
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              {tr[S.manageChangesNote]}
            </p>
          </div>
        </div>
      )}

      {/* Back Button at bottom left */}
      <div className="flex justify-start mt-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors"
        >
          {tr[S.back]}
        </button>
      </div>
    </div>
  )
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto p-0 m-0 text-center">
        <div className="animate-pulse">
          <div className="h-10 bg-tank-light rounded w-64 mx-auto mb-4"></div>
          <div className="h-4 bg-tank-light rounded w-96 mx-auto"></div>
        </div>
      </div>
    }>
      <PricingPageContent />
    </Suspense>
  )
}
