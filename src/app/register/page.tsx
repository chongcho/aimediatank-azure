'use client'

// Registration page with email verification
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PasswordField from '@/components/PasswordField'
import { SocialSignIn } from '@/components/SocialSignIn'
import AvatarNicknameBioBlock from '@/components/AvatarNicknameBioBlock'
import SmsOptInDisclosure from '@/components/SmsOptInDisclosure'
import { compressImage } from '@/lib/mediaCompression'
import { parseBirthdayToIso, preferDayFirstFromLocation } from '@/lib/birthday'
import { useLanguageModeList, useLanguageModeText } from '@/hooks/useLanguageModeText'
import { LanguageModeTrans } from '@/components/LanguageModeTrans'
import BirthdayInput from '@/components/BirthdayInput'

const COUNTRY_VALUES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Japan',
  'South Korea',
  'China',
  'India',
  'Brazil',
  'Mexico',
  'Spain',
  'Italy',
  'Netherlands',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Switzerland',
  'Austria',
  'Belgium',
  'Poland',
  'Ireland',
  'Portugal',
  'New Zealand',
  'Singapore',
  'Hong Kong',
  'Taiwan',
  'Thailand',
  'Vietnam',
  'Philippines',
  'Indonesia',
  'Malaysia',
  'Russia',
  'Ukraine',
  'Turkey',
  'Israel',
  'United Arab Emirates',
  'Saudi Arabia',
  'South Africa',
  'Egypt',
  'Nigeria',
  'Argentina',
  'Chile',
  'Colombia',
  'Peru',
  'Other',
] as const

const COUNTRY_LABELS = [...COUNTRY_VALUES] as const

const REGISTER_STRINGS = [
  'Create Account',
  'Close',
  'Or',
  'Join with Email',
  'Name *',
  'First',
  'Middle',
  'Last',
  'Birthday *',
  'Email *',
  'your@email.com',
  'Email Verified',
  'Sending...',
  'Resend Code',
  'Verify Email',
  'Verification OFF',
  'Mobile',
  '+1 (555) 000-0000',
  'Send verification code',
  'Enter the 6-digit code sent to your phone.',
  '000000',
  'Verifying...',
  'Verify',
  'Resend code',
  'Phone verified',
  'Location *',
  'Select country',
  'Select your country',
  'Set Password',
  'Password *',
  'Confirm Password *',
  'Password must be at least 6 characters',
  'Passwords match',
  'Passwords do not match',
  'Membership',
  'Free Viewer Plan',
  'Basic Plan — $2/month',
  'Advanced Plan — $5/month',
  'Premium Plan — $8/month',
  'Start free. Select a paid plan to subscribe.',
  'Choose monthly or yearly billing to continue to checkout.',
  'Membership plan (optional)',
  'Terms & Policy Agreement',
  'By creating an account, you agree to the AI Media Tank (AiM)',
  'Terms of Service',
  'and',
  'Privacy Policy',
  'and acknowledge that you have read and accepted all applicable rules and regulations.',
  'You must agree to the policy to create an account',
  'Cancel',
  'Creating account...',
  'Already have an account?',
  'Log in',
  'Check Your Email!',
  'We\'ve sent a verification link to',
  'Please click the link to verify your account.',
  'Didn\'t receive the email?',
  'Check your spam or junk folder',
  'Make sure the email address is correct',
  'Wait a few minutes and check again',
  'Development Mode',
  'Click to verify:',
  'Go to Login',
  'Resend Verification Email',
  'Verify Your Email',
  'We\'ve sent a 6-digit verification code to',
  'Dev Mode - Your code:',
  'Enter Verification Code',
  'Didn\'t receive the code?',
  'Resend',
  'Create your account and sign in to complete checkout.',
  'Choose Billing Period',
  'You selected:',
  'Monthly',
  'Billed every month',
  'Yearly',
  'Billed annually',
  '/month',
  '/year',
  'You can cancel anytime. Your subscription continues until the end of the billing period.',
  'To create your account, please fix:',
  'Please enter a valid birthday (e.g. 1990-01-15, 1990年1月15日, or 31.12.1990)',
  'Please enter your email',
  'Please enter a password',
] as const

const MEMBERSHIP_PLANS: Record<
  string,
  { id: string; price: number; yearlyPrice: number; labelIndex: number }
> = {
  basic: { id: 'basic', price: 2, yearlyPrice: 20, labelIndex: 36 },
  advanced: { id: 'advanced', price: 5, yearlyPrice: 50, labelIndex: 37 },
  premium: { id: 'premium', price: 8, yearlyPrice: 80, labelIndex: 38 },
}

const R = {
  membershipHeading: 34,
  membershipViewer: 35,
  membershipBasic: 36,
  membershipAdvanced: 37,
  membershipPremium: 38,
  membershipFreeHint: 39,
  membershipChangeHint: 40,
  membershipPlanLabel: 41,
  membershipCheckoutHint: 70,
  chooseBillingPeriod: 71,
  youSelected: 72,
  monthly: 73,
  billedMonthly: 74,
  yearly: 75,
  billedAnnually: 76,
  perMonth: 77,
  perYear: 78,
  billingCancelNote: 79,
  fixToCreateAccount: 80,
  birthdayInvalidHint: 81,
  emailRequired: 82,
  passwordRequired: 83,
} as const

export default function RegisterPage() {
  const router = useRouter()
  const tr = useLanguageModeList(REGISTER_STRINGS)
  const countryLabels = useLanguageModeList(COUNTRY_LABELS)
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    name: '',
    firstName: '',
    middleName: '',
    lastName: '',
    legalName: '',
    phone: '',
    location: '',
    bio: '',
    birthday: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [success, setSuccess] = useState(false)
  const [verificationUrl, setVerificationUrl] = useState('')
  
  // Avatar state for registration-time upload
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  
  // Email verification state
  const [emailStatus, setEmailStatus] = useState<{
    checking: boolean
    valid: boolean | null
    available: boolean | null
    message: string
  }>({
    checking: false,
    valid: null,
    available: null,
    message: '',
  })
  
  // Username verification state
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean
    valid: boolean | null
    available: boolean | null
    message: string
  }>({
    checking: false,
    valid: null,
    available: null,
    message: '',
  })
  
  // Email verification code state
  const [verificationState, setVerificationState] = useState<{
    codeSent: boolean
    codeVerified: boolean
    sending: boolean
    verifying: boolean
    code: string
    error: string
  }>({
    codeSent: false,
    codeVerified: false,
    sending: false,
    verifying: false,
    code: '',
    error: '',
  })
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [generatedCode, setGeneratedCode] = useState('')
  const [policyAgreed, setPolicyAgreed] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [selectedMembership, setSelectedMembership] = useState('viewer')
  const [showMembershipBillingModal, setShowMembershipBillingModal] = useState(false)
  const [pendingMembershipPlan, setPendingMembershipPlan] = useState<
    (typeof MEMBERSHIP_PLANS)[string] | null
  >(null)
  const [pendingBillingPeriod, setPendingBillingPeriod] = useState<'month' | 'year' | null>(null)

  const closeMembershipBillingModal = () => {
    setShowMembershipBillingModal(false)
    setPendingMembershipPlan(null)
    setSelectedMembership('viewer')
    setPendingBillingPeriod(null)
  }

  const handleMembershipBillingChoice = (billingPeriod: 'month' | 'year') => {
    setPendingBillingPeriod(billingPeriod)
    setShowMembershipBillingModal(false)
    setPendingMembershipPlan(null)
  }

  const handleMembershipChange = (newPlanId: string) => {
    if (newPlanId === 'viewer') {
      setSelectedMembership('viewer')
      setPendingBillingPeriod(null)
      setPendingMembershipPlan(null)
      setShowMembershipBillingModal(false)
      return
    }

    const plan = MEMBERSHIP_PLANS[newPlanId]
    if (!plan) return

    setSelectedMembership(newPlanId)
    setPendingBillingPeriod(null)
    setPendingMembershipPlan(plan)
    setShowMembershipBillingModal(true)
  }

  // Phone verification state (two-step verification when phone is provided)
  const [phoneVerificationState, setPhoneVerificationState] = useState<{
    codeSent: boolean
    codeVerified: boolean
    sending: boolean
    verifying: boolean
    code: string
    error: string
  }>({
    codeSent: false,
    codeVerified: false,
    sending: false,
    verifying: false,
    code: '',
    error: '',
  })
  const [authSettings, setAuthSettings] = useState({
    emailVerificationEnabled: true,
    phoneVerificationEnabled: true,
  })

  const translatedError = useLanguageModeText(error)
  const translatedEmailStatusMessage = useLanguageModeText(emailStatus.message)
  const translatedVerificationError = useLanguageModeText(verificationState.error)
  const translatedPhoneVerificationError = useLanguageModeText(phoneVerificationState.error)

  // Debounced email check
  const checkEmail = useCallback(async (email: string) => {
    if (!email || email.length < 5) {
      setEmailStatus({ checking: false, valid: null, available: null, message: '' })
      return
    }

    setEmailStatus(prev => ({ ...prev, checking: true }))

    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()

      setEmailStatus({
        checking: false,
        valid: data.valid,
        available: data.available,
        message: data.error || data.message || '',
      })
    } catch {
      setEmailStatus({
        checking: false,
        valid: null,
        available: null,
        message: 'Failed to verify email',
      })
    }
  }, [])

  // Debounced username check
  const checkUsername = useCallback(async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameStatus({ checking: false, valid: null, available: null, message: '' })
      return
    }

    setUsernameStatus(prev => ({ ...prev, checking: true }))

    try {
      const res = await fetch('/api/auth/check-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const data = await res.json()

      setUsernameStatus({
        checking: false,
        valid: data.valid,
        available: data.available,
        message: data.error || data.message || '',
      })
    } catch {
      setUsernameStatus({
        checking: false,
        valid: null,
        available: null,
        message: 'Failed to check username',
      })
    }
  }, [])

  // Debounce email verification
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.email) {
        checkEmail(formData.email)
      }
    }, 500) // Wait 500ms after user stops typing

    return () => clearTimeout(timer)
  }, [formData.email, checkEmail])

  // Debounce username verification
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.username) {
        checkUsername(formData.username)
      }
    }, 500) // Wait 500ms after user stops typing

    return () => clearTimeout(timer)
  }, [formData.username, checkUsername])

  useEffect(() => {
    let cancelled = false
    const loadAuthenticationSettings = async () => {
      try {
        const res = await fetch('/api/ui/authentication')
        const data = await res.json()
        if (!cancelled) {
          setAuthSettings({
            emailVerificationEnabled: data.emailVerificationEnabled !== false,
            phoneVerificationEnabled: data.phoneVerificationEnabled !== false,
          })
        }
      } catch {
        // Keep secure defaults (both enabled) when endpoint is unavailable.
      }
    }
    loadAuthenticationSettings()
    const onUpdated = () => loadAuthenticationSettings()
    window.addEventListener('authenticationSettingsUpdated', onUpdated)
    return () => {
      cancelled = true
      window.removeEventListener('authenticationSettingsUpdated', onUpdated)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    const isNamePart = name === 'firstName' || name === 'middleName' || name === 'lastName'
    setFormData((prev) => {
      const next = { ...prev, [name]: value }
      if (isNamePart) {
        const first = name === 'firstName' ? value : prev.firstName
        const middle = name === 'middleName' ? value : prev.middleName
        const last = name === 'lastName' ? value : prev.lastName
        next.legalName = [first, middle, last].filter(Boolean).join(' ').trim() || ''
      }
      return next
    })

    // Reset verification if email changes
    if (name === 'email') {
      setVerificationState(prev => ({
        ...prev,
        codeSent: false,
        codeVerified: false,
        code: '',
        error: '',
      }))
    }
    // Reset phone verification if phone changes
    if (name === 'phone') {
      setPhoneVerificationState(prev => ({
        ...prev,
        codeSent: false,
        codeVerified: false,
        code: '',
        error: '',
      }))
    }
  }

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error('Failed to read image'))
      }
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.readAsDataURL(file)
    })

  // Prepare avatar at registration time and persist during account creation.
  const handleAvatarFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    try {
      const prepared = await compressImage(file, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.82,
      })
      setAvatarFile(prepared)
      const previewUrl = URL.createObjectURL(prepared)
      setAvatarPreview(previewUrl)
      setError('')
    } catch {
      setError('Failed to prepare avatar image')
    }
  }

  // Send verification code
  const sendVerificationCode = async () => {
    if (!emailStatus.valid || !emailStatus.available) {
      return
    }

    setVerificationState(prev => ({ ...prev, sending: true, error: '' }))

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      })
      const data = await res.json()

      if (res.ok) {
        setVerificationState(prev => ({
          ...prev,
          codeSent: true,
          sending: false,
        }))
        setShowVerifyModal(true)
        if (data.code) {
          // Dev mode: show code
          setGeneratedCode(data.code)
        }
      } else {
        setVerificationState(prev => ({
          ...prev,
          sending: false,
          error: data.error || 'Failed to send code',
        }))
      }
    } catch {
      setVerificationState(prev => ({
        ...prev,
        sending: false,
        error: 'Failed to send verification code',
      }))
    }
  }

  // Verify the code
  const verifyCode = async () => {
    setVerificationState(prev => ({ ...prev, verifying: true, error: '' }))

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: formData.email,
          code: verificationState.code,
        }),
      })
      const data = await res.json()

      if (res.ok && data.verified) {
        setVerificationState(prev => ({
          ...prev,
          codeVerified: true,
          verifying: false,
        }))
        setShowVerifyModal(false)
      } else {
        setVerificationState(prev => ({
          ...prev,
          verifying: false,
          error: data.error || 'Invalid verification code',
        }))
      }
    } catch {
      setVerificationState(prev => ({
        ...prev,
        verifying: false,
        error: 'Failed to verify code',
      }))
    }
  }

  // Send phone verification code (two-step verification)
  const sendPhoneCode = async () => {
    const phone = formData.phone.trim()
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setPhoneVerificationState(prev => ({ ...prev, error: 'Please enter a valid phone number' }))
      return
    }
    setPhoneVerificationState(prev => ({ ...prev, sending: true, error: '' }))
    try {
      const res = await fetch('/api/auth/send-phone-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (res.ok) {
        setPhoneVerificationState(prev => ({
          ...prev,
          codeSent: true,
          sending: false,
          error: '',
          // When API returns code (e.g. dev or no SMS configured), pre-fill so user can verify
          ...(data.code ? { code: String(data.code).slice(0, 6) } : {}),
        }))
      } else {
        setPhoneVerificationState(prev => ({
          ...prev,
          sending: false,
          error: data.error || 'Failed to send code',
        }))
      }
    } catch {
      setPhoneVerificationState(prev => ({
        ...prev,
        sending: false,
        error: 'Failed to send verification code',
      }))
    }
  }

  // Verify phone code
  const verifyPhoneCode = async () => {
    const phone = formData.phone.trim()
    if (!phone || phoneVerificationState.code.length !== 6) return
    setPhoneVerificationState(prev => ({ ...prev, verifying: true, error: '' }))
    try {
      const res = await fetch('/api/auth/verify-phone-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: phoneVerificationState.code }),
      })
      const data = await res.json()
      if (res.ok && data.valid) {
        setPhoneVerificationState(prev => ({
          ...prev,
          codeVerified: true,
          verifying: false,
        }))
      } else {
        setPhoneVerificationState(prev => ({
          ...prev,
          verifying: false,
          error: data.error || 'Invalid verification code',
        }))
      }
    } catch {
      setPhoneVerificationState(prev => ({
        ...prev,
        verifying: false,
        error: 'Failed to verify code',
      }))
    }
  }

  const dayFirstDates = preferDayFirstFromLocation(formData.location)

  const phoneNeedsVerification =
    authSettings.phoneVerificationEnabled &&
    formData.phone.trim().replace(/\D/g, '').length >= 10 &&
    !phoneVerificationState.codeVerified

  const submitBlockers = useMemo(() => {
    const blockers: string[] = []
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      blockers.push('Please enter your first and last name')
    }
    if (!parseBirthdayToIso(formData.birthday, { preferDayFirst: dayFirstDates })) {
      blockers.push(REGISTER_STRINGS[R.birthdayInvalidHint])
    }
    if (!formData.email.trim()) {
      blockers.push(REGISTER_STRINGS[R.emailRequired])
    } else if (authSettings.emailVerificationEnabled && !verificationState.codeVerified) {
      blockers.push('Please verify your email address first')
    }
    if (!formData.location) {
      blockers.push('Please select your location')
    }
    if (!usernameStatus.valid || !usernameStatus.available) {
      blockers.push('Please choose an available Nickname')
    }
    if (phoneNeedsVerification) {
      blockers.push('Please verify your phone number first')
    }
    if (!formData.password) {
      blockers.push(REGISTER_STRINGS[R.passwordRequired])
    } else if (formData.password.length < 6) {
      blockers.push('Password must be at least 6 characters')
    }
    if (formData.password !== formData.confirmPassword) {
      blockers.push('Passwords do not match')
    }
    if (!policyAgreed) {
      blockers.push('You must agree to the policy to create an account')
    }
    return blockers
  }, [
    formData.firstName,
    formData.lastName,
    formData.birthday,
    formData.email,
    formData.location,
    formData.password,
    formData.confirmPassword,
    formData.phone,
    authSettings.emailVerificationEnabled,
    authSettings.phoneVerificationEnabled,
    verificationState.codeVerified,
    phoneVerificationState.codeVerified,
    usernameStatus.valid,
    usernameStatus.available,
    phoneNeedsVerification,
    policyAgreed,
    dayFirstDates,
  ])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setAttemptedSubmit(true)

    if (submitBlockers.length > 0) {
      setError(submitBlockers[0])
      return
    }

    const birthdayIso = parseBirthdayToIso(formData.birthday, { preferDayFirst: dayFirstDates })
    if (!birthdayIso) {
      setError(REGISTER_STRINGS[R.birthdayInvalidHint])
      return
    }

    setLoading(true)

    try {
      let avatarDataUrl: string | undefined
      if (avatarFile) {
        avatarDataUrl = await fileToDataUrl(avatarFile)
      }
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          username: formData.username,
          password: formData.password,
          name: formData.name,
          legalName: formData.legalName,
          phone: formData.phone,
          location: formData.location,
          bio: formData.bio,
          birthday: birthdayIso,
          avatarDataUrl,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
      } else {
        const planQuery =
          selectedMembership && selectedMembership !== 'viewer'
            ? pendingBillingPeriod
              ? `&plan=${encodeURIComponent(selectedMembership)}&billing=${encodeURIComponent(pendingBillingPeriod)}`
              : `&plan=${encodeURIComponent(selectedMembership)}`
            : ''
        router.push(`/login?registered=true${planQuery}`)
      }
    } catch (err) {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Success state - show verification instructions
  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-0 m-0 pb-[500px] pt-[10px]">
        <div className="card p-8 text-center mt-3">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">{tr[53]}</h1>
            <p className="text-gray-400 mb-6">
              {tr[54]}{' '}
              <strong className="text-white">{formData.email}</strong>.{' '}
              {tr[55]}
            </p>
            
            <div className="p-4 bg-tank-gray rounded-xl text-left mb-6">
              <p className="text-sm text-gray-400 mb-2">{tr[56]}</p>
              <ul className="text-sm text-gray-500 list-disc list-inside space-y-1">
                <li>{tr[57]}</li>
                <li>{tr[58]}</li>
                <li>{tr[59]}</li>
              </ul>
            </div>

            {/* Dev mode: show verification link */}
            {verificationUrl && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-left mb-6">
                <p className="text-yellow-400 text-sm font-semibold mb-2">
                  🔧 {tr[60]}
                </p>
                <p className="text-xs text-gray-400 mb-2">{tr[61]}</p>
                <a 
                  href={verificationUrl} 
                  className="text-xs text-tank-accent break-all hover:underline"
                >
                  {verificationUrl}
                </a>
              </div>
            )}

            <div className="space-y-3">
              <Link href="/login" className="btn-primary block">
                {tr[62]}
              </Link>
              <Link href="/resend-verification" className="block text-tank-accent hover:underline text-sm">
                {tr[63]}
              </Link>
            </div>
          </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-0 m-0 pb-[500px] pt-[10px]">
        <div className="py-[20px]">
          <div className="flex items-center justify-center relative">
            <h1 className="text-3xl font-bold">{tr[0]}</h1>
            <button
              type="button"
              onClick={() => { window.location.href = '/' }}
              className="absolute right-2 w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
              aria-label={tr[1]}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="card">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {translatedError}
            </div>
          )}

          {!showEmailForm ? (
            <>
              <SocialSignIn mode="signup" callbackUrl="/" hideDividerAbove />

              <div className="relative mt-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-tank-light" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-tank-gray px-3 text-gray-400">{tr[2]}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-gray-200"
              >
                {tr[3]}
              </button>
            </>
          ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <AvatarNicknameBioBlock
              avatarPreviewUrl={avatarPreview}
              username={formData.username}
              onUsernameChange={(value) =>
                setFormData((prev) => ({ ...prev, username: value }))
              }
              bio={formData.bio}
              onBioChange={(value) => setFormData((prev) => ({ ...prev, bio: value }))}
              onAvatarFile={handleAvatarFile}
              usernameStatus={usernameStatus}
              statusHighlightMode="register"
            />

            {/* Name (First, Middle, Last) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tr[4]}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder={tr[5]}
                  required
                  className="w-full"
                />
                <input
                  type="text"
                  name="middleName"
                  value={formData.middleName}
                  onChange={handleChange}
                  placeholder={tr[6]}
                  className="w-full"
                />
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder={tr[7]}
                  required
                  className="w-full"
                />
              </div>
            </div>

            {/* Birthday — manual entry (incl. 年/月/日) + native calendar */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tr[8]}
              </label>
              <BirthdayInput
                name="birthday"
                value={formData.birthday}
                onChange={(value) =>
                  setFormData((prev) => ({ ...prev, birthday: value }))
                }
                preferDayFirst={dayFirstDates}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tr[9]}
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder={tr[10]}
                required
                    disabled={verificationState.codeVerified}
                    className={`w-full ${
                      verificationState.codeVerified
                        ? 'border-green-500 bg-green-500/10'
                        : emailStatus.valid === false || emailStatus.available === false
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                        : emailStatus.valid && emailStatus.available
                        ? 'border-tank-accent focus:border-tank-accent focus:ring-tank-accent/20'
                        : ''
                    }`}
                  />
                </div>
                {/* Verify Email Button - Always visible */}
                {authSettings.emailVerificationEnabled && verificationState.codeVerified ? (
                  <div className="flex items-center px-4 py-2 bg-green-500/20 text-green-400 rounded-xl text-sm font-medium whitespace-nowrap border border-green-500/50">
                    <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {tr[11]}
                  </div>
                ) : authSettings.emailVerificationEnabled ? (
                  <button
                    type="button"
                    onClick={sendVerificationCode}
                    disabled={!formData.email || formData.email.length < 5 || verificationState.sending}
                    className="flex-shrink-0 px-4 py-2.5 bg-tank-accent text-tank-black rounded-xl text-sm font-semibold hover:bg-tank-accent/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
                  >
                    {verificationState.sending ? (
                      <span className="flex items-center">
                        <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {tr[12]}
                      </span>
                    ) : verificationState.codeSent ? (
                      tr[13]
                    ) : (
                      tr[14]
                    )}
                  </button>
                ) : (
                  <div className="flex items-center px-3 py-2 text-gray-400 text-sm whitespace-nowrap">
                    {tr[15]}
                  </div>
                )}
              </div>
              {/* Status message */}
              {emailStatus.message && !verificationState.codeVerified && (
                <p className={`text-xs mt-1 ${
                  emailStatus.valid && emailStatus.available ? 'text-tank-accent' : 'text-red-400'
                }`}>
                  {translatedEmailStatusMessage}
                </p>
              )}
              {verificationState.error && (
                <p className="text-xs mt-1 text-red-400">{translatedVerificationError}</p>
              )}
            </div>

            {/* Mobile (optional) – two-step verification when provided */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tr[16]}
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder={tr[17]}
                className="w-full"
                disabled={phoneVerificationState.codeVerified}
              />
              {/* Always visible for Azure TFV / carrier opt-in proof (even if phone verify is admin-off). */}
              <SmsOptInDisclosure from="register" className="mt-2" />
              {authSettings.phoneVerificationEnabled && formData.phone.trim().replace(/\D/g, '').length >= 10 && (
                <div className="mt-2 space-y-2">
                  {!phoneVerificationState.codeVerified ? (
                    <>
                      {!phoneVerificationState.codeSent ? (
                        <button
                          type="button"
                          onClick={sendPhoneCode}
                          disabled={phoneVerificationState.sending}
                          className="text-sm px-3 py-1.5 rounded-lg bg-tank-accent/20 text-tank-accent hover:bg-tank-accent/30 border border-tank-accent/50"
                        >
                          {phoneVerificationState.sending ? tr[12] : tr[18]}
                        </button>
                      ) : (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-gray-400">
                            {tr[19]}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              placeholder={tr[20]}
                              value={phoneVerificationState.code}
                              onChange={(e) =>
                                setPhoneVerificationState((prev) => ({
                                  ...prev,
                                  code: e.target.value.replace(/\D/g, '').slice(0, 6),
                                }))
                              }
                              className="w-28 px-2 py-1.5 rounded bg-tank-black border border-tank-light text-center font-mono text-lg"
                            />
                            <button
                              type="button"
                              onClick={verifyPhoneCode}
                              disabled={phoneVerificationState.code.length !== 6 || phoneVerificationState.verifying}
                              className="text-sm px-3 py-1.5 rounded-lg bg-tank-accent text-tank-black font-medium disabled:opacity-50"
                            >
                              {phoneVerificationState.verifying ? tr[21] : tr[22]}
                            </button>
                            <button
                              type="button"
                              onClick={sendPhoneCode}
                              disabled={phoneVerificationState.sending}
                              className="text-sm text-gray-400 hover:text-tank-accent"
                            >
                              {tr[23]}
                            </button>
                          </div>
                        </div>
                      )}
                      {phoneVerificationState.error && (
                        <p className="text-xs text-red-400">{translatedPhoneVerificationError}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-green-400 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {tr[24]}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tr[25]}
              </label>
              <select
                name="location"
                value={formData.location}
                onChange={handleChange}
                required
                className="w-full"
                aria-label={tr[27]}
                title={tr[27]}
              >
                <option value="">{tr[26]}</option>
                {COUNTRY_VALUES.map((value, index) => (
                  <option key={value} value={value}>
                    {countryLabels[index]}
                  </option>
                ))}
              </select>
            </div>

            {/* Password Section */}
            <div className="border-t border-tank-light pt-6">
              <h3 className="text-lg font-semibold mb-4">{tr[28]}</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {tr[29]}
                  </label>
                  <PasswordField
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className={`w-full ${
                      formData.password.length > 0 && formData.password.length < 6
                        ? 'border-yellow-500 focus:border-yellow-500'
                        : ''
                    }`}
                  />
                  {formData.password.length > 0 && formData.password.length < 6 && (
                    <p className="text-xs text-yellow-400 mt-1">{tr[31]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {tr[30]}
                  </label>
                  <PasswordField
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    className={`w-full ${
                      formData.confirmPassword.length > 0
                        ? formData.password === formData.confirmPassword
                          ? 'border-green-500 focus:border-green-500'
                          : 'border-red-500 focus:border-red-500'
                        : ''
                    }`}
                  />
                  {formData.confirmPassword.length > 0 && (
                    <p className={`text-xs mt-1 flex items-center gap-1 ${
                      formData.password === formData.confirmPassword ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formData.password === formData.confirmPassword ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {tr[32]}
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {tr[33]}
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Membership Selection — optional; defaults to Free Viewer */}
            <div className="border-t border-tank-light pt-6">
              <h3 className="text-lg font-semibold mb-4">{tr[R.membershipHeading]}</h3>
              <div>
                <select
                  name="membership"
                  value={selectedMembership}
                  onChange={(e) => handleMembershipChange(e.target.value)}
                  className="w-full"
                  aria-label={tr[R.membershipPlanLabel]}
                  title={tr[R.membershipPlanLabel]}
                >
                  <option value="viewer">{tr[R.membershipViewer]}</option>
                  <option value="basic">{tr[R.membershipBasic]}</option>
                  <option value="advanced">{tr[R.membershipAdvanced]}</option>
                  <option value="premium">{tr[R.membershipPremium]}</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  {selectedMembership === 'viewer'
                    ? tr[R.membershipFreeHint]
                    : pendingBillingPeriod
                      ? tr[R.membershipCheckoutHint]
                      : tr[R.membershipChangeHint]}
                </p>
              </div>
            </div>

            {/* Policy Agreement Section */}
            <div className="p-4 bg-tank-dark rounded-xl border border-tank-light">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-tank-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {tr[42]}
              </h3>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policyAgreed}
                  onChange={(e) => setPolicyAgreed(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-tank-light bg-tank-dark text-tank-accent focus:ring-tank-accent focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-sm text-gray-300">
                  <LanguageModeTrans text={REGISTER_STRINGS[43]} />{' '}
                  <Link href="/terms?from=register" target="_blank" className="text-tank-accent hover:underline font-medium">
                    {tr[44]}
                  </Link>
                  {' '}<LanguageModeTrans text={REGISTER_STRINGS[45]} />{' '}
                  <Link href="/privacy?from=register" target="_blank" className="text-tank-accent hover:underline font-medium">
                    {tr[46]}
                  </Link>
                  {' '}<LanguageModeTrans text={REGISTER_STRINGS[47]} />
                </span>
              </label>
              {!policyAgreed && (
                <p className="text-xs text-yellow-500 mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {tr[48]}
                </p>
              )}
            </div>

            {attemptedSubmit && submitBlockers.length > 0 && (
              <div
                className="p-4 bg-yellow-500/10 border border-yellow-500/40 rounded-xl text-yellow-200 text-sm"
                role="alert"
                aria-live="assertive"
              >
                <p className="font-semibold text-yellow-300 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {tr[R.fixToCreateAccount]}
                </p>
                <ul className="list-disc pl-5 space-y-1 text-yellow-100/90">
                  {submitBlockers.map((msg) => (
                    <li key={msg}>
                      <LanguageModeTrans text={msg} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 py-3 rounded-xl font-semibold bg-tank-gray border border-tank-light text-white hover:bg-tank-light transition-all"
              >
                {tr[49]}
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all ${
                  loading
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-tank-accent text-tank-black hover:bg-tank-accent/90'
                }`}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    {tr[50]}
                  </>
                ) : (
                  tr[0]
                )}
              </button>
            </div>
          </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-400">
            <LanguageModeTrans text={REGISTER_STRINGS[43]} />{' '}
<Link href="/terms?from=register" className="text-tank-accent hover:underline font-medium">
            {tr[44]}
          </Link>
          {' '}<LanguageModeTrans text={REGISTER_STRINGS[45]} />{' '}
          <Link href="/privacy?from=register" className="text-tank-accent hover:underline font-medium">
            {tr[46]}
          </Link>
            {' '}<LanguageModeTrans text={REGISTER_STRINGS[47]} />
          </p>
        </div>

        <p className="text-center mt-6 text-gray-400">
          {tr[51]}{' '}
          <Link href="/login" className="text-tank-accent hover:underline">
            {tr[52]}
          </Link>
        </p>

      {showMembershipBillingModal && pendingMembershipPlan && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={closeMembershipBillingModal}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-400 bg-gray-500 p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold">{tr[R.chooseBillingPeriod]}</h3>
              <button
                type="button"
                onClick={closeMembershipBillingModal}
                className="rounded-lg p-2 transition-colors hover:bg-gray-400"
                aria-label={tr[1]}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-6 text-center text-gray-200">
              {tr[R.youSelected]}{' '}
              <span className="font-bold text-tank-accent">
                {tr[pendingMembershipPlan.labelIndex]}
              </span>
            </p>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => handleMembershipBillingChoice('month')}
                className="group h-20 w-full cursor-pointer rounded-xl border-2 border-gray-400 bg-gray-600 p-4 transition-all hover:border-tank-accent hover:bg-gray-500"
              >
                <div className="flex h-full items-center justify-between">
                  <div className="text-left">
                    <p className="text-lg font-semibold text-white transition-colors group-hover:text-tank-accent">
                      {tr[R.monthly]}
                    </p>
                    <p className="text-sm text-gray-300">{tr[R.billedMonthly]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${pendingMembershipPlan.price}</p>
                    <p className="text-sm text-gray-300">{tr[R.perMonth]}</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleMembershipBillingChoice('year')}
                className="group h-20 w-full cursor-pointer rounded-xl border-2 border-gray-400 bg-gray-600 p-4 transition-all hover:border-tank-accent hover:bg-gray-500"
              >
                <div className="flex h-full items-center justify-between">
                  <div className="text-left">
                    <p className="text-lg font-semibold text-white transition-colors group-hover:text-tank-accent">
                      {tr[R.yearly]}
                    </p>
                    <p className="text-sm text-gray-300">{tr[R.billedAnnually]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${pendingMembershipPlan.yearlyPrice}</p>
                    <p className="text-sm text-gray-300">{tr[R.perYear]}</p>
                  </div>
                </div>
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-gray-400">{tr[R.billingCancelNote]}</p>
          </div>
        </div>
      )}

      {/* Verification Code Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-tank-dark border border-tank-gray rounded-2xl p-6 w-full max-w-md">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-tank-accent/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-tank-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">{tr[64]}</h3>
              <p className="text-gray-400 text-sm">
                {tr[65]}<br />
                <strong className="text-white">{formData.email}</strong>
              </p>
            </div>

            {/* Dev mode: show code */}
            {generatedCode && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <p className="text-yellow-400 text-xs font-semibold mb-1">🔧 {tr[66]}</p>
                <p className="text-2xl font-mono font-bold text-center text-yellow-400">{generatedCode}</p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tr[67]}
              </label>
              <input
                type="text"
                value={verificationState.code}
                onChange={(e) => setVerificationState(prev => ({ 
                  ...prev, 
                  code: e.target.value.replace(/\D/g, '').slice(0, 6),
                  error: '',
                }))}
                placeholder={tr[20]}
                maxLength={6}
                className="text-center text-2xl font-mono tracking-widest"
              />
            </div>

            {verificationState.error && (
              <p className="text-red-400 text-sm text-center mb-4">{translatedVerificationError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="flex-1 px-4 py-3 bg-tank-gray text-white rounded-xl font-medium hover:bg-tank-gray/80 transition-colors"
              >
                {tr[49]}
              </button>
              <button
                type="button"
                onClick={verifyCode}
                disabled={verificationState.code.length !== 6 || verificationState.verifying}
                className="flex-1 px-4 py-3 bg-tank-accent text-tank-black rounded-xl font-medium hover:bg-tank-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {verificationState.verifying ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {tr[21]}
                  </span>
                ) : (
                  tr[22]
                )}
              </button>
            </div>

            <p className="text-center text-gray-500 text-xs mt-4">
              {tr[68]}{' '}
              <button
                type="button"
                onClick={sendVerificationCode}
                disabled={verificationState.sending}
                className="text-tank-accent hover:underline"
              >
                {tr[69]}
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
