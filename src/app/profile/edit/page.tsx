'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { compressImage } from '@/lib/mediaCompression'
import { buildUploadFileSizeExceededMessage } from '@/lib/uploadPlanConfig'
import { localeTagFromUserLocation } from '@/lib/localeFromLocation'
import AvatarNicknameBioBlock from '@/components/AvatarNicknameBioBlock'

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
  const [authSettings, setAuthSettings] = useState({
    emailVerificationEnabled: true,
    phoneVerificationEnabled: true,
  })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchProfile()
    }
  }, [status])

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
        if (data.user.avatar) {
          setAvatarPreview(data.user.avatar)
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

    if (!formData.birthday) {
      setError('Please enter your birthday')
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
        birthday: formData.birthday || undefined,
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
        setSuccess('Profile updated successfully!')
        setFormData((prev) => ({
          ...prev,
          password: '',
          confirmPassword: '',
        }))
        setOriginalPhone(formData.phone)
        setPhoneVerificationState({ codeSent: false, sending: false, code: '', error: '', codeInMessage: false })
        
        // Update session with new username and locale from saved Location (feed + UI translation)
        await updateSession({
          ...session,
          user: {
            ...session?.user,
            username: data.user.username,
            name: data.user.name,
            locale: localeTagFromUserLocation(data.user.location),
          },
        })
        
        // Trigger navbar refresh
        window.dispatchEvent(new Event('profileUpdated'))
        
        // Redirect to profile after short delay
        setTimeout(() => {
          router.push(`/profile/${data.user.username}`)
        }, 1500)
      }
    } catch (error) {
      setError('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-0 m-0 pb-[500px] pt-[10px]">
      <div className="py-[20px]">
        <div className="flex items-center justify-center relative">
          <h1 className="text-[18px] font-bold">Edit Profile</h1>
          <button
            type="button"
            onClick={() => router.back()}
            className="absolute right-2 w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-gray-400 text-xs text-center">Update your account information</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm">
              {success}
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

          {/* Name (First, Middle, Last) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Name *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value)
                  setFormData((prev) => ({ ...prev, legalName: [e.target.value, middleName, lastName].filter(Boolean).join(' ').trim() }))
                }}
                placeholder="First"
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
                placeholder="Middle"
                className="w-full"
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value)
                  setFormData((prev) => ({ ...prev, legalName: [firstName, middleName, e.target.value].filter(Boolean).join(' ').trim() }))
                }}
                placeholder="Last"
                required
                className="w-full"
              />
            </div>
          </div>

          {/* Birthday */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Birthday *
            </label>
            <input
              type="date"
              value={formData.birthday}
              onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
              required
              className="w-full"
            />
          </div>

          {/* Email with inline verification */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email *
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
            <input
              type="email"
              value={formData.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="your@email.com"
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
              {/* Show verify button only when email changed and not verified */}
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
                      Sending...
                    </span>
                  ) : emailVerificationState.codeSent ? (
                    'Resend Code'
                  ) : (
                    'Verify Email'
                  )}
                </button>
              ) : authSettings.emailVerificationEnabled && emailChanged && emailVerificationState.codeVerified ? (
                <div className="flex items-center px-4 py-2 bg-green-500/20 text-green-400 rounded-xl text-sm font-medium whitespace-nowrap border border-green-500/50">
                  <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Verified
                </div>
              ) : authSettings.emailVerificationEnabled && formData.emailVerified ? (
                <div className="flex items-center px-3 py-2 text-green-400 text-sm">
                  <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Verified
                </div>
              ) : !authSettings.emailVerificationEnabled ? (
                <div className="flex items-center px-3 py-2 text-gray-400 text-sm whitespace-nowrap">
                  Verification OFF
                </div>
              ) : null}
            </div>
            {authSettings.emailVerificationEnabled && emailChanged && !emailVerificationState.codeVerified && (
              <p className="text-xs text-yellow-400 mt-1">
                Email changed - verification required
              </p>
            )}
            {emailVerificationState.error && (
              <p className="text-xs text-red-400 mt-1">{emailVerificationState.error}</p>
            )}
          </div>

          {/* Phone — verify when subscriber adds or changes number (Azure ACS) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Mobile
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => {
                setFormData({ ...formData, phone: e.target.value })
                setPhoneVerificationState((prev) => ({ ...prev, codeSent: false, code: '', error: '', codeInMessage: false }))
              }}
              placeholder="+1 (555) 000-0000"
              className="w-full"
            />
            {authSettings.phoneVerificationEnabled && phoneChangedAndValid && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-yellow-400">Verify this number to save. A code will be sent via SMS (Azure ACS).</p>
                {!phoneVerificationState.codeSent ? (
                  <button
                    type="button"
                    onClick={sendPhoneCode}
                    disabled={phoneVerificationState.sending}
                    className="text-sm px-3 py-1.5 rounded-lg bg-tank-accent/20 text-tank-accent hover:bg-tank-accent/30 border border-tank-accent/50"
                  >
                    {phoneVerificationState.sending ? 'Sending...' : 'Send verification code'}
                  </button>
                ) : (
                  <div className="space-y-1">
                    {phoneVerificationState.codeInMessage && (
                      <p className="text-xs text-yellow-400">SMS not configured or not delivered. Use the code below if you have it.</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400">Enter 6-digit code:</span>
                      <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
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
                      Resend code
                    </button>
                    </div>
                  </div>
                )}
                {phoneVerificationState.error && (
                  <p className="text-xs text-red-400">{phoneVerificationState.error}</p>
                )}
              </div>
            )}
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Location *
            </label>
            <select
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              required
              className="w-full"
            >
              <option value="">Select country</option>
              <option value="United States">United States</option>
              <option value="United Kingdom">United Kingdom</option>
              <option value="Canada">Canada</option>
              <option value="Australia">Australia</option>
              <option value="Germany">Germany</option>
              <option value="France">France</option>
              <option value="Japan">Japan</option>
              <option value="South Korea">South Korea</option>
              <option value="China">China</option>
              <option value="India">India</option>
              <option value="Brazil">Brazil</option>
              <option value="Mexico">Mexico</option>
              <option value="Spain">Spain</option>
              <option value="Italy">Italy</option>
              <option value="Netherlands">Netherlands</option>
              <option value="Sweden">Sweden</option>
              <option value="Norway">Norway</option>
              <option value="Denmark">Denmark</option>
              <option value="Finland">Finland</option>
              <option value="Switzerland">Switzerland</option>
              <option value="Austria">Austria</option>
              <option value="Belgium">Belgium</option>
              <option value="Poland">Poland</option>
              <option value="Ireland">Ireland</option>
              <option value="Portugal">Portugal</option>
              <option value="New Zealand">New Zealand</option>
              <option value="Singapore">Singapore</option>
              <option value="Hong Kong">Hong Kong</option>
              <option value="Taiwan">Taiwan</option>
              <option value="Thailand">Thailand</option>
              <option value="Vietnam">Vietnam</option>
              <option value="Philippines">Philippines</option>
              <option value="Indonesia">Indonesia</option>
              <option value="Malaysia">Malaysia</option>
              <option value="Russia">Russia</option>
              <option value="Ukraine">Ukraine</option>
              <option value="Turkey">Turkey</option>
              <option value="Israel">Israel</option>
              <option value="United Arab Emirates">United Arab Emirates</option>
              <option value="Saudi Arabia">Saudi Arabia</option>
              <option value="South Africa">South Africa</option>
              <option value="Egypt">Egypt</option>
              <option value="Nigeria">Nigeria</option>
              <option value="Argentina">Argentina</option>
              <option value="Chile">Chile</option>
              <option value="Colombia">Colombia</option>
              <option value="Peru">Peru</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Password Section */}
          <div className="border-t border-tank-light pt-4">
            <h3 className="text-lg font-semibold mb-0">Change Password</h3>
            <p className="text-sm text-gray-400 mb-2">Leave blank to keep current password</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  minLength={6}
                  className={`w-full ${
                    formData.password.length > 0 && formData.password.length < 6
                      ? 'border-yellow-500 focus:border-yellow-500'
                      : ''
                  }`}
                />
                {formData.password.length > 0 && formData.password.length < 6 && (
                  <p className="text-xs text-yellow-400 mt-1">Password must be at least 6 characters</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
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
                        Passwords match
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Passwords do not match
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-4 pt-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-8 py-3 bg-tank-gray border border-tank-light rounded-xl hover:bg-tank-light transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-3 btn-primary"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>


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
              <h3 className="text-xl font-bold mb-2">Verify Your New Email</h3>
              <p className="text-gray-400 text-sm">
                We've sent a 6-digit verification code to<br />
                <strong className="text-white">{formData.email}</strong>
              </p>
            </div>

            {/* Dev mode: show code */}
            {generatedCode && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <p className="text-yellow-400 text-xs font-semibold mb-1">🔧 Dev Mode - Your code:</p>
                <p className="text-2xl font-mono font-bold text-center text-yellow-400">{generatedCode}</p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Enter Verification Code
              </label>
              <input
                type="text"
                value={emailVerificationState.code}
                onChange={(e) => setEmailVerificationState(prev => ({ 
                  ...prev, 
                  code: e.target.value.replace(/\D/g, '').slice(0, 6),
                  error: '',
                }))}
                placeholder="000000"
                maxLength={6}
                className="text-center text-2xl font-mono tracking-widest"
              />
            </div>

            {emailVerificationState.error && (
              <p className="text-red-400 text-sm text-center mb-4">{emailVerificationState.error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="flex-1 px-4 py-3 bg-tank-gray text-white rounded-xl font-medium hover:bg-tank-gray/80 transition-colors"
              >
                Cancel
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
                    Verifying...
                  </span>
                ) : (
                  'Verify'
                )}
              </button>
            </div>

            <p className="text-center text-gray-500 text-xs mt-4">
              Didn't receive the code?{' '}
              <button
                type="button"
                onClick={sendVerificationCode}
                disabled={emailVerificationState.sending}
                className="text-tank-accent hover:underline"
              >
                Resend
              </button>
            </p>
          </div>
        </div>
      )}

    </div>
  )
}
