'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

const plans = [
  {
    id: 'viewer',
    name: 'Viewer Plan',
    price: 0,
    yearlyPrice: 0,
    period: 'month',
    description: 'Suit for occasional creators',
    uploadCost: 'Five Free Uploads',
    uploadCostShort: '5 Free Uploads',
    features: [
      'View contents',
      'Buy contents',
      'Sell contents',
      '5 free uploads',
    ],
    buttonText: 'Buy Plan',
    isFree: true,
  },
  {
    id: 'basic',
    name: 'Basic Plan',
    price: 2,
    yearlyPrice: 20,
    period: 'month',
    description: 'Suit for occasional creators',
    uploadCost: '$1 per Upload after Five Free Uploads',
    uploadCostShort: '5 Free + $1/upload',
    features: [
      'View contents',
      'Buy contents',
      'Sell contents',
      '5 free uploads',
      '$1 per upload after',
    ],
    buttonText: 'Buy Plan',
  },
  {
    id: 'advanced',
    name: 'Advanced Plan',
    price: 5,
    yearlyPrice: 50,
    period: 'month',
    description: 'Suit for moderate creators',
    uploadCost: '$0.5 per Upload after Five Free Uploads',
    uploadCostShort: '5 Free + $0.5/upload',
    features: [
      'View contents',
      'Buy contents',
      'Sell contents',
      '5 free uploads',
      '$0.5 per upload after',
    ],
    buttonText: 'Buy Plan',
  },
  {
    id: 'premium',
    name: 'Premium Plan',
    price: 8,
    yearlyPrice: 80,
    period: 'month',
    description: 'Suit for scale creators',
    uploadCost: 'Unlimited Free Uploads',
    uploadCostShort: 'Unlimited Free',
    features: [
      'View contents',
      'Buy contents',
      'Sell contents',
      'Unlimited free uploads',
    ],
    buttonText: 'Buy Plan',
  },
]

// Helper to get plan details by membership type
const getPlanByMembership = (membership: string) => {
  const planId = membership.toLowerCase()
  return plans.find(p => p.id === planId) || plans[0]
}

interface UploadStatus {
  freeUploadsUsed: number
  freeUploadsRemaining: number | string
  costPerUpload: number
  statusMessage: string
  statusType: 'free' | 'paid' | 'blocked'
}

function PricingPageContent() {
  const { data: session, update: updateSession } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState<string | null>(null)
  const [currentMembership, setCurrentMembership] = useState('VIEWER')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [manageLoading, setManageLoading] = useState<string | null>(null)
  const [showBillingModal, setShowBillingModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0] | null>(null)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [policyAgreed, setPolicyAgreed] = useState(false)
  const [purchasedPlanName, setPurchasedPlanName] = useState('')
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null)

  // Check for success parameter on mount
  useEffect(() => {
    const success = searchParams.get('success')
    const planId = searchParams.get('plan')
    
    if (success === 'true' && planId) {
      const plan = plans.find(p => p.id === planId)
      if (plan) {
        setPurchasedPlanName(plan.name)
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Success Message Banner */}
      {showSuccessMessage && (
        <div className="relative mb-8 p-6 bg-gradient-to-r from-tank-accent/20 to-emerald-500/20 border border-tank-accent rounded-xl">
          <div className="flex items-center justify-center gap-4">
            <div className="text-4xl">🎉</div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-tank-accent mb-1">
                Welcome to {purchasedPlanName}!
              </h2>
              <p className="text-gray-300">
                Your subscription is now active. Enjoy your new benefits!
              </p>
            </div>
            <div className="text-4xl">🎉</div>
          </div>
          <button
            onClick={() => {
              setShowSuccessMessage(false)
              router.replace('/pricing', { scroll: false })
            }}
            className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>
      )}

      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Whether you&apos;re here to explore or create, we have a plan that fits your needs.
          Upgrade anytime to unlock more features.
        </p>
      </div>

      {/* Current Plan Banner */}
      {session && (
        <div className="mb-8 p-4 bg-tank-accent/10 border border-tank-accent/30 rounded-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <p className="text-tank-accent">
              Your current plan: <span className="font-bold">{currentMembership}</span>
            </p>
              {uploadStatus ? (
                <div className="flex items-center gap-2">
                  {uploadStatus.freeUploadsRemaining === 'Unlimited' ? (
                    <span className="text-sm text-tank-accent bg-tank-gray px-3 py-1 rounded-full">
                      ✨ Unlimited Free Uploads
                    </span>
                  ) : typeof uploadStatus.freeUploadsRemaining === 'number' && uploadStatus.freeUploadsRemaining > 0 ? (
                    <span className="text-sm text-gray-300 bg-tank-gray px-3 py-1 rounded-full">
                      🎁 {uploadStatus.freeUploadsRemaining} Free Upload{uploadStatus.freeUploadsRemaining !== 1 ? 's' : ''} Left
                    </span>
                  ) : (
                    <span className="text-sm text-yellow-400 bg-yellow-500/10 px-3 py-1 rounded-full">
                      💳 ${uploadStatus.costPerUpload.toFixed(2)}/upload
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-sm text-gray-300 bg-tank-gray px-3 py-1 rounded-full">
                  {getPlanByMembership(currentMembership).uploadCostShort}
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
                    Loading...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Cancel Subscription
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="relative bg-tank-gray rounded-2xl border border-tank-light hover:border-tank-accent/50 transition-all"
          >
            <div className="p-6 text-center">
              <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
              <p className="text-gray-400 text-sm italic mb-6">{plan.description}</p>

              {/* Pricing */}
              <div className="mb-2">
                {plan.isFree ? (
                  <span className="text-4xl font-bold">Free</span>
                ) : (
                  <>
                <span className="text-4xl font-bold">${plan.price}</span>
                <span className="text-gray-400">/month</span>
                  </>
                )}
              </div>
              {!plan.isFree && (
              <p className="text-gray-500 text-sm mb-4">or ${plan.yearlyPrice}/year</p>
              )}
              {plan.isFree && <p className="text-gray-500 text-sm mb-4">&nbsp;</p>}

              {/* Upload cost highlight */}
              <div className="mb-6 py-3 border-t border-b border-tank-light">
                <span className={`text-sm font-semibold ${
                  plan.id === 'premium' || plan.id === 'viewer' ? 'text-tank-accent' : 'text-white'
                }`}>
                  {plan.uploadCost}
                </span>
              </div>

              {/* Features */}
              <div className="space-y-2 mb-8">
                <p className="text-gray-300">View contents</p>
                <p className="text-gray-300">Buy contents</p>
              </div>

              {/* Button */}
              <button
                onClick={() => handleBuyPlanClick(plan)}
                disabled={loading !== null || isCurrentPlan(plan.id) || plan.isFree}
                className={`w-full py-3 rounded-xl font-semibold transition-all ${
                  isCurrentPlan(plan.id)
                    ? 'bg-gradient-to-r from-tank-accent/20 to-emerald-500/20 text-tank-accent border-2 border-tank-accent cursor-not-allowed'
                    : plan.isFree
                    ? 'bg-tank-gray border-2 border-tank-light text-gray-400 cursor-default'
                    : 'bg-tank-gray border-2 border-tank-light text-white hover:bg-tank-light hover:border-tank-accent/50'
                }`}
              >
                {loading === plan.id ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : isCurrentPlan(plan.id) ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Current Plan
                  </span>
                ) : (
                  'Buy Plan'
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison Table */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-center mb-8">Plan Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full max-w-4xl mx-auto">
            <thead>
              <tr className="border-b border-tank-light">
                <th className="text-left py-4 px-4 font-semibold">Feature</th>
                <th className="text-center py-4 px-4 font-semibold">Viewer</th>
                <th className="text-center py-4 px-4 font-semibold">Basic</th>
                <th className="text-center py-4 px-4 font-semibold">Advanced</th>
                <th className="text-center py-4 px-4 font-semibold text-tank-accent">Premium</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">Monthly Price</td>
                <td className="py-4 px-4 text-center">Free</td>
                <td className="py-4 px-4 text-center">$2/month</td>
                <td className="py-4 px-4 text-center">$5/month</td>
                <td className="py-4 px-4 text-center">$8/month</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">Yearly Price</td>
                <td className="py-4 px-4 text-center">Free</td>
                <td className="py-4 px-4 text-center">$20/year</td>
                <td className="py-4 px-4 text-center">$50/year</td>
                <td className="py-4 px-4 text-center">$80/year</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">Free Uploads</td>
                <td className="py-4 px-4 text-center">5 uploads</td>
                <td className="py-4 px-4 text-center">5 uploads</td>
                <td className="py-4 px-4 text-center">5 uploads</td>
                <td className="py-4 px-4 text-center text-tank-accent">Unlimited</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">After Free Uploads</td>
                <td className="py-4 px-4 text-center text-gray-500">—</td>
                <td className="py-4 px-4 text-center">$1 per upload</td>
                <td className="py-4 px-4 text-center">$0.5 per upload</td>
                <td className="py-4 px-4 text-center text-tank-accent">Free</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">View Contents</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">Buy Contents</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
              </tr>
              <tr className="border-b border-tank-light/50">
                <td className="py-4 px-4 text-gray-300">Sell Contents</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
                <td className="py-4 px-4 text-center text-tank-accent">✓</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="bg-tank-gray rounded-xl p-6">
            <h3 className="font-semibold mb-2">Can I cancel anytime?</h3>
            <p className="text-gray-400 text-sm">
              Yes, you can cancel your subscription at any time. Your benefits will continue until the end of your billing period.
            </p>
          </div>
          <div className="bg-tank-gray rounded-xl p-6">
            <h3 className="font-semibold mb-2">What payment methods do you accept?</h3>
            <p className="text-gray-400 text-sm">
              We accept all major credit cards and debit cards through our secure Stripe payment system.
            </p>
          </div>
          <div className="bg-tank-gray rounded-xl p-6">
            <h3 className="font-semibold mb-2">What happens to my uploads if I cancel?</h3>
            <p className="text-gray-400 text-sm">
              Your existing uploads will remain on the platform. However, you won&apos;t be able to upload new content until you resubscribe.
            </p>
          </div>
          <div className="bg-tank-gray rounded-xl p-6">
            <h3 className="font-semibold mb-2">Can I upgrade or downgrade?</h3>
            <p className="text-gray-400 text-sm">
              Yes, you can change your plan at any time using the &quot;Change / Cancel Subscription&quot; button above.
            </p>
          </div>
        </div>
      </div>

      {/* Billing Period Selection Modal */}
      {showBillingModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-tank-dark border border-tank-light rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Choose Billing Period</h3>
              <button
                onClick={() => {
                  setShowBillingModal(false)
                  setSelectedPlan(null)
                  setPolicyAgreed(false)
                }}
                className="p-2 hover:bg-tank-light rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-gray-400 mb-6 text-center">
              You selected: <span className="text-tank-accent font-bold">{selectedPlan.name}</span>
            </p>

            {/* Policy Agreement Checkbox */}
            <div className="mb-6 p-4 bg-tank-gray rounded-xl border border-tank-light">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policyAgreed}
                  onChange={(e) => setPolicyAgreed(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-tank-light bg-tank-dark text-tank-accent focus:ring-tank-accent focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-sm text-gray-300">
                  I have read and agree to the{' '}
                  <a href="/policy" target="_blank" className="text-tank-accent hover:underline">
                    Terms of Service and Privacy Policy
                  </a>
                </span>
              </label>
            </div>

            <div className="space-y-4">
              {/* Monthly Option - Default/Recommended */}
              <button
                onClick={() => handleSubscribe('month')}
                disabled={!policyAgreed}
                className={`w-full p-4 bg-tank-gray border-2 rounded-xl transition-all group relative overflow-hidden ${
                  policyAgreed 
                    ? 'border-tank-accent hover:bg-tank-light cursor-pointer' 
                    : 'border-tank-light opacity-50 cursor-not-allowed'
                }`}
              >
                <div className={`absolute top-0 right-0 text-black text-xs font-bold px-2 py-1 rounded-bl-lg ${
                  policyAgreed ? 'bg-tank-accent' : 'bg-gray-500'
                }`}>
                  Recommended
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <p className={`font-semibold text-lg ${policyAgreed ? 'text-tank-accent' : 'text-gray-500'}`}>Monthly</p>
                    <p className="text-gray-400 text-sm">Billed every month</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${selectedPlan.price}</p>
                    <p className="text-gray-400 text-sm">/month</p>
                  </div>
                </div>
              </button>

              {/* Yearly Option */}
              <button
                onClick={() => handleSubscribe('year')}
                disabled={!policyAgreed}
                className={`w-full p-4 bg-tank-gray border-2 rounded-xl transition-all group relative overflow-hidden ${
                  policyAgreed 
                    ? 'border-tank-light hover:border-tank-accent/50 cursor-pointer' 
                    : 'border-tank-light opacity-50 cursor-not-allowed'
                }`}
              >
                <div className={`absolute top-0 right-0 text-black text-xs font-bold px-2 py-1 rounded-bl-lg ${
                  policyAgreed ? 'bg-yellow-500' : 'bg-gray-500'
                }`}>
                  Save ${(selectedPlan.price * 12 - selectedPlan.yearlyPrice).toFixed(0)}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <p className={`font-semibold text-lg transition-colors ${policyAgreed ? 'group-hover:text-tank-accent' : 'text-gray-500'}`}>Yearly</p>
                    <p className="text-gray-400 text-sm">Billed annually</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${selectedPlan.yearlyPrice}</p>
                    <p className="text-gray-400 text-sm">/year</p>
                    <p className="text-yellow-400 text-xs">(${(selectedPlan.yearlyPrice / 12).toFixed(2)}/mo)</p>
                  </div>
                </div>
              </button>
            </div>

            {!policyAgreed && (
              <p className="text-xs text-yellow-500 mt-4 text-center">
                Please agree to the Terms of Service and Privacy Policy to continue.
              </p>
            )}

            <p className="text-xs text-gray-500 mt-4 text-center">
              You can cancel anytime. Your subscription will continue until the end of the billing period.
            </p>
          </div>
        </div>
      )}

      {/* Manage Subscription Modal */}
      {showManageModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-tank-dark border border-tank-light rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Manage Subscription</h3>
              <button
                onClick={() => setShowManageModal(false)}
                className="p-2 hover:bg-tank-light rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-gray-400 mb-6">
              Your current plan: <span className="text-tank-accent font-bold">{currentMembership}</span>
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
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      Downgrade to Basic ($5/month)
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
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel Subscription
                  </>
                )}
              </button>

              <button
                onClick={() => setShowManageModal(false)}
                className="w-full py-3 px-4 bg-tank-gray text-gray-400 rounded-xl hover:bg-tank-light transition-colors"
              >
                Keep Subscription
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              Changes take effect immediately. Your existing uploads will not be affected.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-4 py-12 text-center">
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
