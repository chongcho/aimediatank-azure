'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { compressImage } from '@/lib/mediaCompression'
import { parseBirthdayToIso, preferDayFirstFromLocation, isBirthdayAtLeastAge, normalizeAgeRequirement, maxBirthdayIsoForMinAge, type AgeRequirement } from '@/lib/birthday'
import { buildUploadFileSizeExceededMessage } from '@/lib/uploadPlanConfig'
import { localeTagFromUserLocation } from '@/lib/localeFromLocation'
import { persistFeedCardTextMode } from '@/contexts/FeedCardTextModeContext'
import AvatarNicknameBioBlock from '@/components/AvatarNicknameBioBlock'
import BirthdayInput from '@/components/BirthdayInput'
import PasswordField from '@/components/PasswordField'
import SmsOptInDisclosure from '@/components/SmsOptInDisclosure'
import { isAppAdminRole } from '@/lib/adminFreshStep2'
import { useLanguageModeList, useLanguageModeText } from '@/hooks/useLanguageModeText'

const EDIT_PROFILE_STRINGS = [
  'Edit Profile',
  'Close',
  'Update your account information',
  'Name *',
  'First',
  'Middle',
  'Last',
  'Birthday *',
  'Email *',
  'your@email.com',
  'Sending...',
  'Resend Code',
  'Verify Email',
  'Verified',
  'Verification OFF',
  'Email changed - verification required',
  'Mobile',
  '+1 (555) 000-0000',
  'Verify this number to save. A code will be sent via SMS (Azure ACS).',
  'Send verification code',
  'SMS not configured or not delivered. Use the code below if you have it.',
  'Enter 6-digit code:',
  '000000',
  'Resend code',
  'Location *',
  'Select country',
  'Change Password',
  'Leave blank to keep current password',
  'New Password',
  'Confirm New Password',
  'Password must be at least 6 characters',
  'Passwords match',
  'Passwords do not match',
  'Account',
  'Deactivate',
  'Cancel',
  'Saving...',
  'Save',
  'Account deactivation',
  'This hides your uploads from the home feed and your profile, removes your username from search, and limits what you can do while signed in. You can turn the account back on anytime from the profile menu (green Restore Account). Active subscriptions are cancelled when you confirm.',
  'Continue',
  'Confirm account deactivation',
  'Type your username and password (if you use one) to confirm. This cannot be undone without contacting support.',
  'Type your username',
  'to confirm',
  'Account password (leave blank if you only use social sign-in)',
  'Keep account',
  'Deactivating…',
  'Verify Your New Email',
  "We've sent a 6-digit verification code to",
  '🔧 Dev Mode - Your code:',
  'Enter Verification Code',
  'Verifying...',
  'Verify',
  "Didn't receive the code?",
  'Resend',
  'Membership',
  'Free Viewer Plan',
  'Basic Plan — $2/month',
  'Advanced Plan — $5/month',
  'Premium Plan — $8/month',
  'Your current plan. Select another plan to subscribe or manage billing.',
  'Choose monthly or yearly billing to continue to checkout.',
  'Membership plan',
  'Choose Billing Period',
  'You selected:',
  'Monthly',
  'Billed every month',
  'Yearly',
  'Billed annually',
  '/month',
  '/year',
  'You can cancel anytime. Your subscription continues until the end of the billing period.',
] as const

const MEMBERSHIP_PLANS: Record<
  string,
  { id: string; price: number; yearlyPrice: number; labelIndex: number }
> = {
  basic: { id: 'basic', price: 2, yearlyPrice: 20, labelIndex: 58 },
  advanced: { id: 'advanced', price: 5, yearlyPrice: 50, labelIndex: 59 },
  premium: { id: 'premium', price: 8, yearlyPrice: 80, labelIndex: 60 },
}

const E = {
  membershipHeading: 56,
  membershipViewer: 57,
  membershipBasic: 58,
  membershipAdvanced: 59,
  membershipPremium: 60,
  membershipCurrentHint: 61,
  membershipChangeHint: 62,
  membershipPlanLabel: 63,
  chooseBillingPeriod: 64,
  youSelected: 65,
  monthly: 66,
  billedMonthly: 67,
  yearly: 68,
  billedAnnually: 69,
  perMonth: 70,
  perYear: 71,
  billingCancelNote: 72,
} as const

const COUNTRY_NAMES = [
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

interface ProfileData {
  name: string
  legalName: string
  username: string
  email: string
  phone: string
  location: string
  bio: string
  birthday: string
  password: string
  confirmPassword: string
  emailVerified: boolean
  avatar: string | null
}

export default function EditProfilePage() {
  const { data: session, status, update: updateSession } = useSession()
  const accountDeactivatedSession = Boolean(session?.user?.accountDeactivated)
  const isAdminAccount = isAppAdminRole(session?.user?.role)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formData, setFormData] = useState<ProfileData>({
    name: '',
    legalName: '',
    username: '',
    email: '',
    phone: '',
    location: '',
    bio: '',
    birthday: '',
    password: '',
    confirmPassword: '',
    emailVerified: false,
    avatar: null,
  })
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [originalEmail, setOriginalEmail] = useState('')
  const [originalUsername, setOriginalUsername] = useState('')
  const [originalPhone, setOriginalPhone] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [maxUploadBytes, setMaxUploadBytes] = useState(10 * 1024 * 1024)
  const [deactivateIntroOpen, setDeactivateIntroOpen] = useState(false)
  const [cancelRegOpen, setCancelRegOpen] = useState(false)
  const [cancelRegUsername, setCancelRegUsername] = useState('')
  const [cancelRegPassword, setCancelRegPassword] = useState('')
  const [cancelRegLoading, setCancelRegLoading] = useState(false)
  const [cancelRegError, setCancelRegError] = useState('')

  const notifyAvatarFileSizeExceeded = (actualFileBytes: number) => {
    setError(buildUploadFileSizeExceededMessage(maxUploadBytes, actualFileBytes))
  }
  
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
  
  // Email verification state
  const [emailVerificationState, setEmailVerificationState] = useState<{
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
  // Phone verification when subscriber adds or changes phone (Azure ACS SMS)
  const [phoneVerificationState, setPhoneVerificationState] = useState<{
    codeSent: boolean
    sending: boolean
    code: string
    error: string
    codeInMessage?: boolean
  }>({
    codeSent: false,
    sending: false,
    code: '',
    error: '',
  })
  const [authSettings, setAuthSettings] = useState<{
    emailVerificationEnabled: boolean
    phoneVerificationEnabled: boolean
    selfServiceDeactivateAccountEnabled: boolean
    ageRequirement: AgeRequirement
  }>({
    emailVerificationEnabled: true,
    phoneVerificationEnabled: true,
    selfServiceDeactivateAccountEnabled: true,
    ageRequirement: 13,
  })
  const [panelCurrentPassword, setPanelCurrentPassword] = useState('')
  const [panelNewPassword, setPanelNewPassword] = useState('')
  const [panelConfirmPassword, setPanelConfirmPassword] = useState('')
  const [panelPasswordSaving, setPanelPasswordSaving] = useState(false)
  const [panelPasswordMessage, setPanelPasswordMessage] = useState<string | null>(null)
  const [panelPasswordError, setPanelPasswordError] = useState<string | null>(null)
  const [selectedMembership, setSelectedMembership] = useState('viewer')
  const [originalMembership, setOriginalMembership] = useState('viewer')
  const [showMembershipBillingModal, setShowMembershipBillingModal] = useState(false)
  const [pendingMembershipPlan, setPendingMembershipPlan] = useState<
    (typeof MEMBERSHIP_PLANS)[string] | null
  >(null)
  const [membershipCheckoutLoading, setMembershipCheckoutLoading] = useState<string | null>(null)

  const tr = useLanguageModeList(EDIT_PROFILE_STRINGS)
  const countryLabels = useLanguageModeList(COUNTRY_NAMES)
  const localizedError = useLanguageModeText(error)
  const localizedSuccess = useLanguageModeText(success)
  const localizedEmailVerificationError = useLanguageModeText(emailVerificationState.error)
  const localizedPhoneVerificationError = useLanguageModeText(phoneVerificationState.error)
  const localizedCancelRegError = useLanguageModeText(cancelRegError)

  const closeMembershipBillingModal = () => {
    setShowMembershipBillingModal(false)
    setPendingMembershipPlan(null)
    setSelectedMembership(originalMembership)
  }

  const handleMembershipSubscribe = async (billingPeriod: 'month' | 'year') => {
    if (!pendingMembershipPlan) return
    setShowMembershipBillingModal(false)
    setMembershipCheckoutLoading(pendingMembershipPlan.id)
    try {
      const res = await fetch('/api/stripe/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: pendingMembershipPlan.id, billingPeriod }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      setError(data.error || 'Failed to start checkout')
      setSelectedMembership(originalMembership)
    } catch {
      setError('Failed to start checkout')
      setSelectedMembership(originalMembership)
    } finally {
      setMembershipCheckoutLoading(null)
      setPendingMembershipPlan(null)
    }
  }

  const handleMembershipChange = async (newPlanId: string) => {
    if (newPlanId === originalMembership) {
      setSelectedMembership(newPlanId)
      return
    }

    if (newPlanId === 'viewer') {
      setSelectedMembership(originalMembership)
      if (originalMembership !== 'viewer') {
        try {
          const res = await fetch('/api/stripe/portal', { method: 'POST' })
          const data = await res.json()
          if (data.url) {
            window.location.href = data.url
          } else {
            setError(data.error || 'Failed to open billing portal')
          }
        } catch {
          setError('Failed to open billing portal')
        }
      }
      return
    }

    const plan = MEMBERSHIP_PLANS[newPlanId]
    if (!plan) return

    setSelectedMembership(newPlanId)
    setPendingMembershipPlan(plan)
    setShowMembershipBillingModal(true)
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      if (session?.user?.accountDeactivated) {
        router.replace('/')
        return
      }
      fetchProfile()
    }
  }, [status, session?.user?.accountDeactivated, router])

  useEffect(() => {
    fetch('/api/ui/crop-settings')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.maxUploadFileBytes === 'number' && d.maxUploadFileBytes > 0) {
          setMaxUploadBytes(d.maxUploadFileBytes)
        }
      })
      .catch(() => {})
  }, [])

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
            selfServiceDeactivateAccountEnabled: data.selfServiceDeactivateAccountEnabled !== false,
            ageRequirement: normalizeAgeRequirement(data.ageRequirement),
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

  const saveAdminPanelAccessPasswordFromProfile = async () => {
    setPanelPasswordSaving(true)
    setPanelPasswordMessage(null)
    setPanelPasswordError(null)
    try {
      const res = await fetch('/api/admin/panel-access-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: panelCurrentPassword,
          newPassword: panelNewPassword,
          confirmPassword: panelConfirmPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPanelPasswordError(typeof data.error === 'string' ? data.error : 'Could not update Admin Panel password')
        return
      }
      setPanelCurrentPassword('')
      setPanelNewPassword('')
      setPanelConfirmPassword('')
      setPanelPasswordMessage(typeof data.message === 'string' ? data.message : 'Admin Panel password updated')
    } catch (error) {
      console.error('Error saving Admin Panel password from profile:', error)
      setPanelPasswordError('Could not update Admin Panel password')
    } finally {
      setPanelPasswordSaving(false)
    }
  }

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/user/profile')
      const data = await res.json()

      if (data.user) {
        const bday = data.user.birthday ? new Date(data.user.birthday).toISOString().slice(0, 10) : ''
        setFormData({
          name: data.user.name || '',
          legalName: data.user.legalName || '',
          username: data.user.username || '',
          email: data.user.email || '',
          phone: data.user.phone || '',
          location: data.user.location || '',
          bio: data.user.bio || '',
          birthday: bday,
          password: '',
          confirmPassword: '',
          emailVerified: data.user.emailVerified || false,
          avatar: data.user.avatar || null,
        })
        const legalParts = (data.user.legalName || '').split(' ').filter(Boolean)
        if (legalParts.length === 1) { setFirstName(legalParts[0]); setMiddleName(''); setLastName('') }
        else if (legalParts.length === 2) { setFirstName(legalParts[0]); setMiddleName(''); setLastName(legalParts[1]) }
        else if (legalParts.length >= 3) { setFirstName(legalParts[0]); setLastName(legalParts[legalParts.length - 1]); setMiddleName(legalParts.slice(1, -1).join(' ')) }
        setOriginalEmail(data.user.email || '')
        setOriginalUsername(data.user.username || '')
        setOriginalPhone(data.user.phone || '')
        const membership = String(data.user.membershipType || 'VIEWER')
          .trim()
          .toLowerCase()
        const membershipId = ['viewer', 'basic', 'advanced', 'premium'].includes(membership)
          ? membership
          : 'viewer'
        setSelectedMembership(membershipId)
        setOriginalMembership(membershipId)
        if (data.user.avatar) {
          setAvatarPreview(data.user.avatar)
        }
        if (data.user.accountDeactivatedAt) {
          router.replace('/')
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }
  
  // Check if email changed
  const emailChanged = formData.email !== originalEmail && formData.email.length > 0
  
  // Check if username changed
  const usernameChanged = formData.username !== originalUsername && formData.username.length > 0

  const phoneDigits = (v: string) => v.replace(/\D/g, '')
  const phoneChangedAndValid =
    formData.phone.trim().length > 0 &&
    phoneDigits(formData.phone).length >= 10 &&
    phoneDigits(formData.phone) !== phoneDigits(originalPhone)

  const sendPhoneCode = async () => {
    const phone = formData.phone.trim()
    if (!phone || phoneDigits(phone).length < 10) {
      setPhoneVerificationState((prev) => ({ ...prev, error: 'Please enter a valid phone number' }))
      return
    }
    setPhoneVerificationState((prev) => ({ ...prev, sending: true, error: '' }))
    try {
      const res = await fetch('/api/auth/send-phone-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        const codeFromError = typeof data.code === 'string' ? data.code.trim().slice(0, 6) : ''
        setPhoneVerificationState((prev) => ({
          ...prev,
          sending: false,
          error: data.error || 'Failed to send code',
          ...(codeFromError ? { codeSent: true, code: codeFromError, codeInMessage: true } : {}),
        }))
        return
      }
      // If server returned a code (SMS not configured or fallback), show it so user can still verify
      const codeFromServer = typeof data.code === 'string' ? data.code.trim().slice(0, 6) : ''
      setPhoneVerificationState((prev) => ({
        ...prev,
        codeSent: true,
        sending: false,
        error: '',
        ...(codeFromServer ? { code: codeFromServer } : {}),
        codeInMessage: data.message?.includes('use code below') || !!codeFromServer,
      }))
    } catch {
      setPhoneVerificationState((prev) => ({ ...prev, sending: false, error: 'Failed to send code' }))
    }
  }

  // Debounced username check
  const checkUsername = useCallback(async (username: string) => {
    // If username is same as original, it's valid
    if (username === originalUsername) {
      setUsernameStatus({ checking: false, valid: true, available: true, message: '' })
      return
    }
    
    if (!username || username.length < 3) {
      setUsernameStatus({ checking: false, valid: null, available: null, message: '' })
      return
    }

    setUsernameStatus(prev => ({ ...prev, checking: true }))

    try {
      const res = await fetch('/api/auth/check-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, currentUserId: session?.user?.id }),
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
  }, [originalUsername, session?.user?.id])

  // Debounce username verification
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.username && usernameChanged) {
        checkUsername(formData.username)
      } else if (!usernameChanged) {
        setUsernameStatus({ checking: false, valid: true, available: true, message: '' })
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [formData.username, usernameChanged, checkUsername])
  
  // Send verification code
  const sendVerificationCode = async () => {
    if (!formData.email || formData.email.length < 5) return

    setEmailVerificationState(prev => ({ ...prev, sending: true, error: '' }))

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      })
      const data = await res.json()

      if (res.ok) {
        setEmailVerificationState(prev => ({
          ...prev,
          codeSent: true,
          sending: false,
        }))
        setShowVerifyModal(true)
        if (data.code) {
          setGeneratedCode(data.code)
        }
      } else {
        setEmailVerificationState(prev => ({
          ...prev,
          sending: false,
          error: data.error || 'Failed to send code',
        }))
      }
    } catch {
      setEmailVerificationState(prev => ({
        ...prev,
        sending: false,
        error: 'Failed to send verification code',
      }))
    }
  }

  // Verify the code
  const verifyCode = async () => {
    setEmailVerificationState(prev => ({ ...prev, verifying: true, error: '' }))

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: formData.email,
          code: emailVerificationState.code,
        }),
      })
      const data = await res.json()

      if (res.ok && data.verified) {
        setEmailVerificationState(prev => ({
          ...prev,
          codeVerified: true,
          verifying: false,
        }))
        setShowVerifyModal(false)
        setFormData(prev => ({ ...prev, emailVerified: true }))
      } else {
        setEmailVerificationState(prev => ({
          ...prev,
          verifying: false,
          error: data.error || 'Invalid verification code',
        }))
      }
    } catch {
      setEmailVerificationState(prev => ({
        ...prev,
        verifying: false,
        error: 'Failed to verify code',
      }))
    }
  }
  
  // Reset email verification when email changes
  const handleEmailChange = (newEmail: string) => {
    setFormData(prev => ({ ...prev, email: newEmail }))
    if (newEmail !== originalEmail) {
      setEmailVerificationState({
        codeSent: false,
        codeVerified: false,
        sending: false,
        verifying: false,
        code: '',
        error: '',
      })
    }
  }

  const handleAvatarFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    if (file.size > maxUploadBytes) {
      notifyAvatarFileSizeExceeded(file.size)
      return
    }

    // Show immediate local preview
    const localPreview = URL.createObjectURL(file)
    setAvatarPreview(localPreview)

    setUploadingAvatar(true)
    setError('')

    try {
      // Compress the image to be under 5MB (avatar size 400x400)
      const compressedFile = await compressImage(file, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.8,
      })

      if (compressedFile.size > maxUploadBytes) {
        notifyAvatarFileSizeExceeded(compressedFile.size)
        setAvatarPreview(formData.avatar)
        URL.revokeObjectURL(localPreview)
        return
      }

      // Get SAS token for upload
      const sasResponse = await fetch('/api/upload/sas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: `avatar-${Date.now()}.jpg`,
          contentType: 'image/jpeg',
          fileType: 'IMAGE',
          fileSize: compressedFile.size,
        }),
      })

      if (!sasResponse.ok) {
        throw new Error('Failed to get upload URL')
      }

      const { uploadUrl, blobUrl } = await sasResponse.json()

      // Upload to Azure Blob Storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': 'image/jpeg',
          'x-ms-blob-cache-control': 'public, max-age=31536000', // Cache for 1 year
        },
        body: compressedFile,
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload avatar')
      }

      // Save avatar to database immediately
      const saveResponse = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: blobUrl }),
      })

      if (!saveResponse.ok) {
        throw new Error('Failed to save avatar')
      }

      // Update preview and form data with cache-busting
      const avatarUrlWithCacheBust = `${blobUrl}?t=${Date.now()}`
      setAvatarPreview(avatarUrlWithCacheBust)
      setFormData(prev => ({ ...prev, avatar: blobUrl }))
      
      // Clean up local preview URL
      URL.revokeObjectURL(localPreview)
      
      // Trigger navbar refresh
      window.dispatchEvent(new Event('profileUpdated'))
      
      setSuccess('Avatar updated successfully!')
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Avatar upload error:', err)
      setError('Failed to upload avatar. Please try again.')
      // Restore previous avatar on error
      setAvatarPreview(formData.avatar)
      URL.revokeObjectURL(localPreview)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name')
      return
    }

    const dayFirstDates = preferDayFirstFromLocation(formData.location)
    const birthdayIso = parseBirthdayToIso(formData.birthday, { preferDayFirst: dayFirstDates })
    if (!birthdayIso) {
      setError('Please enter a valid birthday (e.g. 1990-01-15 or 1990年1月15日)')
      return
    }
    if (
      !isBirthdayAtLeastAge(birthdayIso, authSettings.ageRequirement)
    ) {
      setError(`You must be at least ${authSettings.ageRequirement} years old`)
      return
    }

    if (!formData.location) {
      setError('Please select your location')
      return
    }

    // Check if username changed and is available
    if (usernameChanged && (!usernameStatus.valid || !usernameStatus.available)) {
      setError('Please choose an available Nickname')
      return
    }

    // Check if email changed and needs verification
    if (authSettings.emailVerificationEnabled && emailChanged && !emailVerificationState.codeVerified) {
      setError('Please verify your new email address before saving')
      return
    }

    // Validate passwords match if changing
    if (formData.password && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password && formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (authSettings.phoneVerificationEnabled && phoneChangedAndValid) {
      if (!phoneVerificationState.codeSent || phoneVerificationState.code.trim().length !== 6) {
        setError('Please request a verification code and enter the 6-digit code sent to your phone before saving.')
        return
      }
    }

    setSaving(true)
    setError('')

    try {
      const updateData: any = {
        name: formData.name,
        legalName: formData.legalName,
        username: formData.username,
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        bio: formData.bio,
        birthday: birthdayIso,
        avatar: formData.avatar,
      }
      if (authSettings.phoneVerificationEnabled && phoneChangedAndValid && phoneVerificationState.code.trim().length === 6) {
        updateData.phoneVerificationCode = phoneVerificationState.code.trim()
      }

      // Only include password if user wants to change it
      if (formData.password) {
        updateData.password = formData.password
      }

      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to update profile')
      } else {
        setFormData((prev) => ({
          ...prev,
          password: '',
          confirmPassword: '',
        }))
        setOriginalPhone(formData.phone)
        setPhoneVerificationState({ codeSent: false, sending: false, code: '', error: '', codeInMessage: false })

        window.dispatchEvent(new Event('profileUpdated'))

        const nextLocale =
          typeof data.localeFromProfileLocation === 'string' && data.localeFromProfileLocation.trim()
            ? data.localeFromProfileLocation.trim()
            : localeTagFromUserLocation(data.user.location)
        // Local mode so chrome/MT follow the new Location (Original stays English).
        persistFeedCardTextMode('local')

        const sessionPayload = {
          ...session,
          user: {
            ...session?.user,
            username: data.user.username,
            name: data.user.name,
            locale: nextLocale,
          },
        }
        try {
          await updateSession(sessionPayload)
        } catch (err) {
          console.error('profile edit: session update failed', err)
        }

        // Hard navigation: intercepted @modal routes often keep the overlay when using router.push('/').
        window.location.replace('/')
      }
    } catch (error) {
      setError('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const accountUsernameForDelete = originalUsername || session?.user?.username || ''

  const handleConfirmAccountDeactivation = async () => {
    setCancelRegLoading(true)
    setCancelRegError('')
    try {
      const res = await fetch('/api/user/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmUsername: cancelRegUsername,
          password: cancelRegPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCancelRegError(
          typeof data.error === 'string' ? data.error : 'Could not deactivate account.'
        )
        return
      }
      setCancelRegOpen(false)
      setDeactivateIntroOpen(false)
      setCancelRegUsername('')
      setCancelRegPassword('')
      setCancelRegError('')
      // Hard navigation: avoid (1) full-page spinner from accountDeactivatedSession before
      // client navigation runs, and (2) intercepted / modal routes that keep the edit view
      // on router.replace — same pattern as successful profile save on this page.
      window.location.replace('/')
    } catch (e) {
      console.error(e)
      setCancelRegError('Could not deactivate account.')
    } finally {
      setCancelRegLoading(false)
    }
  }

  if (status === 'authenticated' && accountDeactivatedSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="form-compact-mobile max-w-2xl mx-auto w-full min-w-0 px-3 sm:px-4 pb-[500px] pt-2 sm:pt-[10px] overflow-x-hidden">
      <div className="form-compact-header py-2 sm:py-[20px]">
        <div className="flex items-center justify-center relative">
          <h1 className="form-compact-title text-[18px] font-bold">{tr[0]}</h1>
          <button
            type="button"
            onClick={() => router.back()}
            className="absolute right-2 w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
            aria-label={tr[1]}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="form-compact-subtitle text-gray-400 text-xs text-center">{tr[2]}</p>
      </div>

      <div className="card form-compact-card">
        <form onSubmit={handleSubmit} className="form-compact-stack space-y-3 sm:space-y-4 min-w-0 w-full">
          {error && (
            <div className="p-3 sm:p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {localizedError}
            </div>
          )}

          {success && (
            <div className="p-3 sm:p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm">
              {localizedSuccess}
            </div>
          )}

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
            statusHighlightMode="edit"
            usernameEdited={usernameChanged}
            uploadingAvatar={uploadingAvatar}
          />

          {/* Profile details — label left / field right (matches Nickname & Bio / Create Account) */}
          <div className="form-fields-grid">
            <label className="form-field-label">
              {tr[3]}
            </label>
            <div className="grid min-w-0 grid-cols-1 min-[420px]:grid-cols-3 gap-2">
              <input
                type="text"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value)
                  setFormData((prev) => ({ ...prev, legalName: [e.target.value, middleName, lastName].filter(Boolean).join(' ').trim() }))
                }}
                placeholder={tr[4]}
                required
                className="w-full"
              />
              <input
                type="text"
                value={middleName}
                onChange={(e) => {
                  setMiddleName(e.target.value)
                  setFormData((prev) => ({ ...prev, legalName: [firstName, e.target.value, lastName].filter(Boolean).join(' ').trim() }))
                }}
                placeholder={tr[5]}
                className="w-full"
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value)
                  setFormData((prev) => ({ ...prev, legalName: [firstName, middleName, e.target.value].filter(Boolean).join(' ').trim() }))
                }}
                placeholder={tr[6]}
                required
                className="w-full"
              />
            </div>

            <label htmlFor="edit-location" className="form-field-label">
              {tr[24]}
            </label>
            <select
              id="edit-location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              required
              className="min-w-0 w-full"
            >
              <option value="">{tr[25]}</option>
              {COUNTRY_NAMES.map((value, index) => (
                <option key={value} value={value}>
                  {countryLabels[index]}
                </option>
              ))}
            </select>

            <label className="form-field-label">
              {tr[7]}
            </label>
            <div className="min-w-0">
              <BirthdayInput
                name="birthday"
                value={formData.birthday}
                onChange={(value) => setFormData({ ...formData, birthday: value })}
                location={formData.location}
                max={maxBirthdayIsoForMinAge(authSettings.ageRequirement)}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Must be {authSettings.ageRequirement}+ years old (Admin age requirement)
              </p>
              {formData.birthday.trim() &&
              parseBirthdayToIso(formData.birthday, {
                preferDayFirst: preferDayFirstFromLocation(formData.location),
              }) &&
              !isBirthdayAtLeastAge(formData.birthday, authSettings.ageRequirement, {
                preferDayFirst: preferDayFirstFromLocation(formData.location),
              }) ? (
                <p className="text-xs text-red-400 mt-1" role="alert">
                  You must be at least {authSettings.ageRequirement} years old
                </p>
              ) : null}
            </div>

            <label htmlFor="edit-email" className="form-field-label">
              {tr[8]}
            </label>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1 basis-[12rem]">
                  <input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    placeholder={tr[9]}
                    className={`w-full ${
                      emailChanged && emailVerificationState.codeVerified
                        ? 'border-green-500 bg-green-500/10'
                        : emailChanged
                        ? 'border-yellow-500 focus:border-yellow-500'
                        : ''
                    }`}
                    required
                  />
                </div>
                {authSettings.emailVerificationEnabled && emailChanged && !emailVerificationState.codeVerified ? (
                  <button
                    type="button"
                    onClick={sendVerificationCode}
                    disabled={!formData.email || formData.email.length < 5 || emailVerificationState.sending}
                    className="flex-shrink-0 px-4 py-2.5 bg-tank-accent text-tank-black rounded-xl text-sm font-semibold hover:bg-tank-accent/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
                  >
                    {emailVerificationState.sending ? (
                      <span className="flex items-center">
                        <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {tr[10]}
                      </span>
                    ) : emailVerificationState.codeSent ? (
                      tr[11]
                    ) : (
                      tr[12]
                    )}
                  </button>
                ) : authSettings.emailVerificationEnabled && emailChanged && emailVerificationState.codeVerified ? (
                  <div className="flex items-center px-4 py-2 bg-green-500/20 text-green-400 rounded-xl text-sm font-medium whitespace-nowrap border border-green-500/50">
                    <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {tr[13]}
                  </div>
                ) : authSettings.emailVerificationEnabled && formData.emailVerified ? (
                  <div className="flex items-center px-3 py-2 text-green-400 text-sm">
                    <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {tr[13]}
                  </div>
                ) : !authSettings.emailVerificationEnabled ? (
                  <div className="flex items-center px-3 py-2 text-gray-400 text-sm whitespace-nowrap">
                    {tr[14]}
                  </div>
                ) : null}
              </div>
              {authSettings.emailVerificationEnabled && emailChanged && !emailVerificationState.codeVerified && (
                <p className="text-xs text-yellow-400 mt-1">
                  {tr[15]}
                </p>
              )}
              {emailVerificationState.error && (
                <p className="text-xs text-red-400 mt-1">{localizedEmailVerificationError}</p>
              )}
            </div>

            <label htmlFor="edit-mobile" className="form-field-label">
              {tr[16]}
            </label>
            <div className="min-w-0">
              <input
                id="edit-mobile"
                type="tel"
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value })
                  setPhoneVerificationState((prev) => ({ ...prev, codeSent: false, code: '', error: '', codeInMessage: false }))
                }}
                placeholder={tr[17]}
                className="w-full"
              />
              <SmsOptInDisclosure from="profile" className="mt-2" />
              {authSettings.phoneVerificationEnabled && phoneChangedAndValid && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-yellow-400">{tr[18]}</p>
                  {!phoneVerificationState.codeSent ? (
                    <button
                      type="button"
                      onClick={sendPhoneCode}
                      disabled={phoneVerificationState.sending}
                      className="text-sm px-3 py-1.5 rounded-lg bg-tank-accent/20 text-tank-accent hover:bg-tank-accent/30 border border-tank-accent/50"
                    >
                      {phoneVerificationState.sending ? tr[10] : tr[19]}
                    </button>
                  ) : (
                    <div className="space-y-1">
                      {phoneVerificationState.codeInMessage && (
                        <p className="text-xs text-yellow-400">{tr[20]}</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">{tr[21]}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder={tr[22]}
                          value={phoneVerificationState.code}
                          onChange={(e) =>
                            setPhoneVerificationState((prev) => ({
                              ...prev,
                              code: e.target.value.replace(/\D/g, '').slice(0, 6),
                            }))
                          }
                          className="w-28 px-2 py-1.5 rounded bg-tank-dark border border-tank-light text-center font-mono text-lg text-white"
                        />
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
                    <p className="text-xs text-red-400">{localizedPhoneVerificationError}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Password Section */}
          <div className="border-t border-tank-light pt-4">
            <h3 className="text-lg font-semibold mb-0">{tr[26]}</h3>
            <p className="text-sm text-gray-400 mb-2">{tr[27]}</p>

            <div className="form-fields-grid">
              <label htmlFor="edit-password" className="form-field-label">
                {tr[28]}
              </label>
              <div className="min-w-0">
                <PasswordField
                  id="edit-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  minLength={6}
                  autoComplete="new-password"
                  className={`w-full ${
                    formData.password.length > 0 && formData.password.length < 6
                      ? 'border-yellow-500 focus:border-yellow-500'
                      : ''
                  }`}
                />
                {formData.password.length > 0 && formData.password.length < 6 && (
                  <p className="text-xs text-yellow-400 mt-1">{tr[30]}</p>
                )}
              </div>

              <label htmlFor="edit-confirm-password" className="form-field-label">
                {tr[29]}
              </label>
              <div className="min-w-0">
                <PasswordField
                  id="edit-confirm-password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
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
                        {tr[31]}
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        {tr[32]}
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>

          {isAdminAccount && (
            <div className="border-t border-tank-light pt-4 space-y-3">
              <div>
                <h3 className="text-lg font-semibold mb-0">Admin Panel password</h3>
                <p className="text-sm text-gray-400 mb-1">
                  Passphrase for Admin Panel access and elevated admin features across the app. Separate from your
                  account login password above (admins sign in like other users). Enter the current Admin Panel
                  password to set a new one. You can also change it under Admin → Authentication.
                </p>
              </div>

              <div className="form-fields-grid">
                <label className="form-field-label">Current Admin Panel password</label>
                <div className="min-w-0">
                  <PasswordField
                    value={panelCurrentPassword}
                    onChange={(e) => setPanelCurrentPassword(e.target.value)}
                    placeholder="Current Admin Panel password"
                    autoComplete="off"
                    disabled={panelPasswordSaving}
                    className="w-full"
                  />
                </div>

                <label className="form-field-label">New Admin Panel password</label>
                <div className="min-w-0">
                  <PasswordField
                    value={panelNewPassword}
                    onChange={(e) => setPanelNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    disabled={panelPasswordSaving}
                    className="w-full"
                  />
                </div>

                <label className="form-field-label">Confirm new password</label>
                <div className="min-w-0">
                  <PasswordField
                    value={panelConfirmPassword}
                    onChange={(e) => setPanelConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={panelPasswordSaving}
                    className="w-full"
                  />
                </div>
              </div>

              {panelPasswordError && <p className="text-sm text-red-400">{panelPasswordError}</p>}
              {panelPasswordMessage && <p className="text-sm text-green-400">{panelPasswordMessage}</p>}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveAdminPanelAccessPasswordFromProfile()}
                  disabled={
                    panelPasswordSaving ||
                    !panelCurrentPassword ||
                    !panelNewPassword ||
                    !panelConfirmPassword
                  }
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {panelPasswordSaving ? 'Saving…' : 'Set Admin Panel password'}
                </button>
              </div>
            </div>
          )}

          {/* Membership Selection */}
          <div className="border-t border-tank-light pt-6">
            <div className="form-fields-grid">
              <label htmlFor="edit-membership" className="form-field-label">
                {tr[E.membershipHeading]}
              </label>
              <div className="min-w-0">
                <select
                  id="edit-membership"
                  name="membership"
                  value={selectedMembership}
                  onChange={(e) => void handleMembershipChange(e.target.value)}
                  disabled={Boolean(membershipCheckoutLoading)}
                  className="w-full"
                  aria-label={tr[E.membershipPlanLabel]}
                  title={tr[E.membershipPlanLabel]}
                >
                  <option value="viewer">{tr[E.membershipViewer]}</option>
                  <option value="basic">{tr[E.membershipBasic]}</option>
                  <option value="advanced">{tr[E.membershipAdvanced]}</option>
                  <option value="premium">{tr[E.membershipPremium]}</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  {selectedMembership === originalMembership
                    ? tr[E.membershipCurrentHint]
                    : selectedMembership === 'viewer'
                      ? tr[E.membershipCurrentHint]
                      : tr[E.membershipChangeHint]}
                </p>
              </div>
            </div>
          </div>

          {/* Actions: Deactivate | Cancel | Save — single row; radius ~70% less than rounded-xl */}
          <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-2 pt-0 sm:gap-3">
            {authSettings.selfServiceDeactivateAccountEnabled && (
              <button
                type="button"
                onClick={() => {
                  setDeactivateIntroOpen(true)
                }}
                className="inline-flex w-[5.5rem] shrink-0 flex-col items-center justify-center gap-0 rounded-[0.225rem] border border-red-500/80 bg-red-600/90 p-0 text-center text-xs font-semibold leading-tight text-white transition-colors hover:bg-red-600"
              >
                <span className="block w-full leading-tight">{tr[33]}</span>
                <span className="block w-full leading-tight">{tr[34]}</span>
              </button>
            )}
            <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-4 sm:gap-6">
              <button
                type="button"
                onClick={() => router.back()}
                className="box-border inline-flex h-10 items-center justify-center rounded-[0.225rem] border border-tank-light bg-tank-dark px-3 text-sm font-semibold leading-none text-white transition-colors hover:bg-tank-light"
              >
                {tr[35]}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="box-border inline-flex h-10 items-center justify-center rounded-[0.225rem] border border-transparent bg-tank-accent px-3 text-sm font-semibold leading-none text-tank-black transition-colors hover:bg-tank-accent/90 hover:shadow-lg hover:shadow-tank-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? tr[36] : tr[37]}
              </button>
            </div>
          </div>
        </form>
      </div>

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
              <h3 className="text-xl font-bold">{tr[E.chooseBillingPeriod]}</h3>
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
              {tr[E.youSelected]}{' '}
              <span className="font-bold text-tank-accent">
                {tr[pendingMembershipPlan.labelIndex]}
              </span>
            </p>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => void handleMembershipSubscribe('month')}
                className="group h-20 w-full cursor-pointer rounded-xl border-2 border-gray-400 bg-gray-600 p-4 transition-all hover:border-tank-accent hover:bg-gray-500"
              >
                <div className="flex h-full items-center justify-between">
                  <div className="text-left">
                    <p className="text-lg font-semibold text-white transition-colors group-hover:text-tank-accent">
                      {tr[E.monthly]}
                    </p>
                    <p className="text-sm text-gray-300">{tr[E.billedMonthly]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${pendingMembershipPlan.price}</p>
                    <p className="text-sm text-gray-300">{tr[E.perMonth]}</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void handleMembershipSubscribe('year')}
                className="group h-20 w-full cursor-pointer rounded-xl border-2 border-gray-400 bg-gray-600 p-4 transition-all hover:border-tank-accent hover:bg-gray-500"
              >
                <div className="flex h-full items-center justify-between">
                  <div className="text-left">
                    <p className="text-lg font-semibold text-white transition-colors group-hover:text-tank-accent">
                      {tr[E.yearly]}
                    </p>
                    <p className="text-sm text-gray-300">{tr[E.billedAnnually]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${pendingMembershipPlan.yearlyPrice}</p>
                    <p className="text-sm text-gray-300">{tr[E.perYear]}</p>
                  </div>
                </div>
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-gray-400">{tr[E.billingCancelNote]}</p>
          </div>
        </div>
      )}

      {deactivateIntroOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDeactivateIntroOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-tank-light bg-tank-dark p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-intro-title"
          >
            <h3 id="deactivate-intro-title" className="mb-2 text-xl font-bold text-red-400">
              {tr[38]}
            </h3>
            <p className="mb-4 text-sm text-gray-400">
              {tr[39]}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeactivateIntroOpen(false)}
                className="rounded-lg bg-tank-gray px-4 py-2 text-gray-300 transition-colors hover:bg-tank-light"
              >
                {tr[35]}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeactivateIntroOpen(false)
                  setCancelRegUsername('')
                  setCancelRegPassword('')
                  setCancelRegError('')
                  setCancelRegOpen(true)
                }}
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-500"
              >
                {tr[40]}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelRegOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            if (!cancelRegLoading) {
              setCancelRegOpen(false)
              setCancelRegError('')
            }
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-tank-light bg-tank-dark p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-reg-edit-title"
          >
            <h3 id="cancel-reg-edit-title" className="mb-2 text-xl font-bold text-red-400">
              {tr[41]}
            </h3>
            <p className="mb-4 text-sm text-gray-400">
              {tr[42]}
            </p>
            <label className="mb-1 block text-sm text-gray-300" htmlFor="cancel-reg-edit-username">
              {tr[43]}{' '}
              <span className="font-mono text-tank-accent">@{accountUsernameForDelete}</span> {tr[44]}
            </label>
            <input
              id="cancel-reg-edit-username"
              name="cancel-reg-edit-username"
              type="text"
              autoComplete="username"
              value={cancelRegUsername}
              onChange={(e) => {
                setCancelRegUsername(e.target.value)
                if (cancelRegError) setCancelRegError('')
              }}
              className="mb-4 w-full rounded-lg border border-tank-light bg-tank-gray px-3 py-2 text-sm text-white"
              disabled={cancelRegLoading}
            />
            <label className="mb-1 block text-sm text-gray-300" htmlFor="cancel-reg-edit-password">
              {tr[45]}
            </label>
            <div className="mb-4">
              <PasswordField
                id="cancel-reg-edit-password"
                name="cancel-reg-edit-password"
                autoComplete="current-password"
                value={cancelRegPassword}
                onChange={(e) => {
                  setCancelRegPassword(e.target.value)
                  if (cancelRegError) setCancelRegError('')
                }}
                className="w-full rounded-lg border border-tank-light bg-tank-gray px-3 py-2 text-sm text-white"
                disabled={cancelRegLoading}
                aria-invalid={Boolean(cancelRegError)}
                aria-describedby={cancelRegError ? 'cancel-reg-edit-error' : undefined}
              />
            </div>
            {cancelRegError && (
              <div
                id="cancel-reg-edit-error"
                role="alert"
                className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
              >
                {localizedCancelRegError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={cancelRegLoading}
                onClick={() => {
                  setCancelRegOpen(false)
                  setCancelRegError('')
                }}
                className="rounded-lg bg-tank-gray px-4 py-2 text-gray-300 transition-colors hover:bg-tank-light"
              >
                {tr[46]}
              </button>
              <button
                type="button"
                disabled={cancelRegLoading || !cancelRegUsername.trim()}
                onClick={() => void handleConfirmAccountDeactivation()}
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelRegLoading ? tr[47] : tr[34]}
              </button>
            </div>
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
              <h3 className="text-xl font-bold mb-2">{tr[48]}</h3>
              <p className="text-gray-400 text-sm">
                {tr[49]}<br />
                <strong className="text-white">{formData.email}</strong>
              </p>
            </div>

            {/* Dev mode: show code */}
            {generatedCode && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <p className="text-yellow-400 text-xs font-semibold mb-1">{tr[50]}</p>
                <p className="text-2xl font-mono font-bold text-center text-yellow-400">{generatedCode}</p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tr[51]}
              </label>
              <input
                type="text"
                value={emailVerificationState.code}
                onChange={(e) => setEmailVerificationState(prev => ({ 
                  ...prev, 
                  code: e.target.value.replace(/\D/g, '').slice(0, 6),
                  error: '',
                }))}
                placeholder={tr[22]}
                maxLength={6}
                className="text-center text-2xl font-mono tracking-widest"
              />
            </div>

            {emailVerificationState.error && (
              <p className="text-red-400 text-sm text-center mb-4">{localizedEmailVerificationError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="flex-1 px-4 py-3 bg-tank-gray text-white rounded-xl font-medium hover:bg-tank-gray/80 transition-colors"
              >
                {tr[35]}
              </button>
              <button
                type="button"
                onClick={verifyCode}
                disabled={emailVerificationState.code.length !== 6 || emailVerificationState.verifying}
                className="flex-1 px-4 py-3 bg-tank-accent text-tank-black rounded-xl font-medium hover:bg-tank-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {emailVerificationState.verifying ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {tr[52]}
                  </span>
                ) : (
                  tr[53]
                )}
              </button>
            </div>

            <p className="text-center text-gray-500 text-xs mt-4">
              {tr[54]}{' '}
              <button
                type="button"
                onClick={sendVerificationCode}
                disabled={emailVerificationState.sending}
                className="text-tank-accent hover:underline"
              >
                {tr[55]}
              </button>
            </p>
          </div>
        </div>
      )}

    </div>
  )
}
