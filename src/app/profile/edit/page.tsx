'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { compressImage } from '@/lib/mediaCompression'

interface ProfileData {
  name: string
  legalName: string
  username: string
  email: string
  phone: string
  location: string
  ageRange: string
  bio: string
  password: string
  confirmPassword: string
  emailVerified: boolean
  avatar: string | null
}

export default function EditProfilePage() {
  const { data: session, status } = useSession()
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
    ageRange: '',
    bio: '',
    password: '',
    confirmPassword: '',
    emailVerified: false,
    avatar: null,
  })
  const [originalEmail, setOriginalEmail] = useState('')
  const [originalUsername, setOriginalUsername] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
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

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchProfile()
    }
  }, [status])

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/user/profile')
      const data = await res.json()

      if (data.user) {
        setFormData({
          name: data.user.name || '',
          legalName: data.user.legalName || '',
          username: data.user.username || '',
          email: data.user.email || '',
          phone: data.user.phone || '',
          location: data.user.location || '',
          ageRange: data.user.ageRange || '',
          bio: data.user.bio || '',
          password: '',
          confirmPassword: '',
          emailVerified: data.user.emailVerified || false,
          avatar: data.user.avatar || null,
        })
        setOriginalEmail(data.user.email || '')
        setOriginalUsername(data.user.username || '')
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

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
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

      // Get SAS token for upload
      const sasResponse = await fetch('/api/upload/sas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: `avatar-${Date.now()}.jpg`,
          contentType: 'image/jpeg',
          fileType: 'IMAGE',
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

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true)
    try {
      // Save null avatar to database immediately
      const saveResponse = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: null }),
      })

      if (!saveResponse.ok) {
        throw new Error('Failed to remove avatar')
      }

      setAvatarPreview(null)
      setFormData(prev => ({ ...prev, avatar: null }))
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setSuccess('Avatar removed successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Remove avatar error:', err)
      setError('Failed to remove avatar. Please try again.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Check if username changed and is available
    if (usernameChanged && (!usernameStatus.valid || !usernameStatus.available)) {
      setError('Please choose an available User ID')
      return
    }

    // Check if email changed and needs verification
    if (emailChanged && !emailVerificationState.codeVerified) {
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

    setSaving(true)

    try {
      const updateData: any = {
        name: formData.name,
        legalName: formData.legalName,
        username: formData.username,
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        ageRange: formData.ageRange,
        bio: formData.bio,
        avatar: formData.avatar,
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
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Edit Profile</h1>
        <p className="text-gray-400">Update your account information</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
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

          {/* Avatar Upload with Editable Name */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-tank-light">
                  {avatarPreview ? (
                    <img 
                      src={avatarPreview} 
                      alt="Avatar" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center text-3xl font-bold">
                      {formData.name?.[0]?.toUpperCase() || formData.username?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  
                  {/* Loading overlay */}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              
              {/* Edit Avatar button */}
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={uploadingAvatar}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-tank-gray hover:bg-tank-light border border-tank-light rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {uploadingAvatar ? 'Uploading...' : 'Edit Avatar'}
              </button>
            </div>
            
            {/* Editable Name section */}
            <div className="text-left space-y-2">
              <div>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your Name"
                  className="text-2xl font-bold bg-transparent border-b-2 border-transparent hover:border-tank-light focus:border-tank-accent transition-colors outline-none w-full"
                />
              </div>
              <p className="text-sm text-gray-400">Nickname</p>
            </div>
          </div>

          {/* User Name (Legal Name) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              User Name (Legal Name)
            </label>
            <input
              type="text"
              value={formData.legalName}
              onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
              placeholder="Your full legal name"
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">Your legal name for account records</p>
          </div>

          {/* User ID */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              User ID *
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="username"
                required
                className={`w-full ${
                  usernameChanged && (usernameStatus.valid === false || usernameStatus.available === false)
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                    : usernameChanged && usernameStatus.valid && usernameStatus.available
                    ? 'border-green-500 focus:border-green-500 focus:ring-green-500/20'
                    : ''
                }`}
              />
              {/* Status indicator */}
              {usernameStatus.checking && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
              {!usernameStatus.checking && usernameChanged && usernameStatus.valid && usernameStatus.available && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {!usernameStatus.checking && usernameChanged && (usernameStatus.valid === false || usernameStatus.available === false) && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
            </div>
            {/* Status message */}
            {usernameChanged && usernameStatus.message && (
              <p className={`text-xs mt-1 ${
                usernameStatus.valid && usernameStatus.available ? 'text-green-400' : 'text-red-400'
              }`}>
                {usernameStatus.message}
              </p>
            )}
            {(!usernameChanged || !usernameStatus.message) && (
              <p className="text-xs text-gray-500 mt-1">Used for login and your profile URL</p>
            )}
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
              {emailChanged && !emailVerificationState.codeVerified ? (
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
              ) : emailChanged && emailVerificationState.codeVerified ? (
                <div className="flex items-center px-4 py-2 bg-green-500/20 text-green-400 rounded-xl text-sm font-medium whitespace-nowrap border border-green-500/50">
                  <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Verified
                </div>
              ) : formData.emailVerified ? (
                <div className="flex items-center px-3 py-2 text-green-400 text-sm">
                  <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Verified
                </div>
              ) : null}
            </div>
            {emailChanged && !emailVerificationState.codeVerified && (
              <p className="text-xs text-yellow-400 mt-1">
                Email changed - verification required
              </p>
            )}
            {emailVerificationState.error && (
              <p className="text-xs text-red-400 mt-1">{emailVerificationState.error}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
              className="w-full"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Location
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="City, Country"
              className="w-full"
            />
          </div>

          {/* Age Range */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Age Range *
            </label>
            <select
              value={formData.ageRange}
              onChange={(e) => setFormData({ ...formData, ageRange: e.target.value })}
              className="w-full"
              required
            >
              <option value="">Select your age range</option>
              <option value="UNDER_18">Under 18</option>
              <option value="18_PLUS">18 and over</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Required for content filtering</p>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Bio
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Tell others about yourself..."
              rows={3}
              className="w-full resize-none"
            />
          </div>

          {/* Password Section */}
          <div className="border-t border-tank-light pt-6">
            <h3 className="text-lg font-semibold mb-4">Change Password</h3>
            <p className="text-sm text-gray-400 mb-4">Leave blank to keep current password</p>

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
                  className="w-full"
                  minLength={6}
                />
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
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 bg-tank-gray border border-tank-light rounded-xl hover:bg-tank-light transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 btn-primary"
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
