'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguageModeList, useLanguageModeText } from '@/hooks/useLanguageModeText'
import { USERNAME_MAX_LENGTH } from '@/lib/usernameValidation'

export type UsernameAvailabilityState = {
  checking: boolean
  valid: boolean | null
  available: boolean | null
  message: string
}

type StatusHighlightMode = 'register' | 'edit'

type Props = {
  avatarPreviewUrl: string | null
  username: string
  onUsernameChange: (value: string) => void
  bio: string
  onBioChange: (value: string) => void
  /** Called with the chosen image file (gallery or live camera capture). */
  onAvatarFile: (file: File) => void
  usernameStatus: UsernameAvailabilityState
  statusHighlightMode: StatusHighlightMode
  /** When mode is `edit`, only show validation styling after the user edits the nickname */
  usernameEdited?: boolean
  uploadingAvatar?: boolean
  /** Increment to clear hidden file inputs (e.g. after avatar removed) */
  resetFileInputsSignal?: number
}

const AVATAR_BLOCK_STRINGS = [
  'Choose avatar image from files',
  'Avatar preview',
  'Choose from file',
  'Take photo',
  'Nickname',
  'Type unique name to show up this platform',
  'Bio',
  'Tell others about yourself ...',
  'Cancel',
  'Use photo',
  'Camera is not supported in this browser. Use "Choose from file".',
  'Camera access was denied. Allow camera for this site in your browser address bar or site settings, or use "Choose from file".',
  'No usable camera was found. Use "Choose from file".',
  'The browser blocked camera access (use HTTPS / localhost, or the site may restrict camera). Use "Choose from file".',
  'Could not open the camera. Check permissions or use "Choose from file".',
  '3–30 characters; letters, numbers, underscores, or hyphens only',
] as const

function usernameInputClass(
  mode: StatusHighlightMode,
  edited: boolean | undefined,
  status: UsernameAvailabilityState
): string {
  const base = 'w-full'
  if (mode === 'edit' && !edited) return base
  if (status.valid === false || status.available === false) {
    return `${base} border-red-500 focus:border-red-500 focus:ring-red-500/20`
  }
  if (status.valid && status.available) {
    return `${base} border-green-500 focus:border-green-500 focus:ring-green-500/20`
  }
  return base
}

function cameraFailureMessage(err: unknown): string {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as DOMException).name) : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return AVATAR_BLOCK_STRINGS[11]
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return AVATAR_BLOCK_STRINGS[12]
  }
  if (name === 'SecurityError' || name === 'NotSupportedError') {
    return AVATAR_BLOCK_STRINGS[13]
  }
  return AVATAR_BLOCK_STRINGS[14]
}

async function openCameraStream(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { ideal: 'user' } }, audio: false },
    { video: { facingMode: 'user' }, audio: false },
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: true },
  ]
  let lastErr: unknown
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

export default function AvatarNicknameBioBlock({
  avatarPreviewUrl,
  username,
  onUsernameChange,
  bio,
  onBioChange,
  onAvatarFile,
  usernameStatus,
  statusHighlightMode,
  usernameEdited = false,
  uploadingAvatar = false,
  resetFileInputsSignal = 0,
}: Props) {
  const tr = useLanguageModeList(AVATAR_BLOCK_STRINGS)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const translatedUsernameMessage = useLanguageModeText(usernameStatus.message)
  const translatedCameraError = useLanguageModeText(cameraError)
  const [cameraSession, setCameraSession] = useState<MediaStream | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
    cameraStreamRef.current = null
    setCameraSession(null)
    const v = videoRef.current
    if (v) v.srcObject = null
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onDocMouseDown = (ev: MouseEvent) => {
      const el = menuRef.current
      if (!el || el.contains(ev.target as Node)) return
      closeMenu()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [menuOpen, closeMenu])

  useEffect(() => {
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }, [resetFileInputsSignal])

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
      cameraStreamRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!cameraOpen || !cameraSession) return
    const v = videoRef.current
    if (!v) return
    v.srcObject = cameraSession
    v.playsInline = true
    v.muted = true
    void v.play().catch(() => {})
    return () => {
      v.srcObject = null
    }
  }, [cameraOpen, cameraSession])

  const onGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onAvatarFile(file)
    e.target.value = ''
    closeMenu()
  }

  const closeCameraModal = useCallback(() => {
    stopCamera()
    setCameraOpen(false)
    setCameraError('')
  }, [stopCamera])

  useEffect(() => {
    if (!cameraOpen) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closeCameraModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cameraOpen, closeCameraModal])

  const startTakePhoto = async () => {
    closeMenu()
    setCameraError('')
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(AVATAR_BLOCK_STRINGS[10])
      setCameraOpen(true)
      return
    }
    try {
      const stream = await openCameraStream()
      cameraStreamRef.current = stream
      setCameraSession(stream)
      setCameraOpen(true)
    } catch (err) {
      setCameraError(cameraFailureMessage(err))
      setCameraOpen(true)
    }
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video) return

    const drawAndDeliver = () => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) return

      const maxW = 1280
      const scale = Math.min(1, maxW / video.videoWidth)
      const w = Math.round(video.videoWidth * scale)
      const h = Math.round(video.videoHeight * scale)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)

      canvas.toBlob(
        (blob) => {
          if (!blob) return
          const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' })
          onAvatarFile(file)
          closeCameraModal()
        },
        'image/jpeg',
        0.88
      )
    }

    if (video.videoWidth > 0) {
      drawAndDeliver()
      return
    }
    video.addEventListener('loadedmetadata', drawAndDeliver, { once: true })
  }

  const showSpinner = usernameStatus.checking
  const showOk =
    !usernameStatus.checking &&
    usernameStatus.valid &&
    usernameStatus.available &&
    (statusHighlightMode === 'register' || usernameEdited)
  const showErr =
    !usernameStatus.checking &&
    (usernameStatus.valid === false || usernameStatus.available === false) &&
    (statusHighlightMode === 'register' || usernameEdited)

  const showMessageRow =
    statusHighlightMode === 'register'
      ? !!usernameStatus.message
      : usernameEdited && !!usernameStatus.message

  return (
    <>
      <div className="flex flex-col min-[480px]:flex-row items-start gap-3 min-[480px]:gap-4 min-w-0 w-full">
        <div className="relative shrink-0" ref={menuRef}>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label={tr[0]}
            onChange={onGalleryChange}
          />

          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-sky-600 text-white shadow-md ring-1 ring-sky-400/40 transition hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-tank-accent"
          >
            {avatarPreviewUrl ? (
              <>
                <img
                  src={avatarPreviewUrl}
                  alt={tr[1]}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                  <CameraIcon className="h-7 w-7 opacity-40 drop-shadow" />
                </span>
              </>
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <CameraIcon className="h-7 w-7" />
              </span>
            )}
            {uploadingAvatar && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55">
                <span className="h-7 w-7 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </span>
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-[calc(100%+6px)] z-20 min-w-[11rem] rounded-lg border border-tank-light bg-tank-gray py-1 shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-tank-light/60"
                onClick={() => {
                  closeMenu()
                  window.requestAnimationFrame(() => galleryInputRef.current?.click())
                }}
              >
                {tr[2]}
              </button>
              <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-tank-light/60" onClick={startTakePhoto}>
                {tr[3]}
              </button>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 w-full">
          {/* One grid so the label column width matches — Bio field lines up with Nickname input */}
          <div className="form-fields-grid">
            <label htmlFor="avatar-nickname" className="form-field-label">
              {tr[4]} <span className="text-gray-400">*</span>
            </label>
            <div className="relative min-w-0 self-center">
              <input
                id="avatar-nickname"
                type="text"
                name="username"
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
                placeholder={tr[5]}
                required
                minLength={3}
                maxLength={USERNAME_MAX_LENGTH}
                autoComplete="username"
                className={usernameInputClass(statusHighlightMode, usernameEdited, usernameStatus)}
              />
              {showSpinner && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-5 w-5 animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </div>
              )}
              {showOk && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {showErr && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
              {showMessageRow && (
                <p
                  className={`mt-1 text-xs ${
                    usernameStatus.valid && usernameStatus.available ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {translatedUsernameMessage}
                </p>
              )}
              {!showMessageRow && (
                <p className="mt-1 text-xs text-gray-500">{tr[15]}</p>
              )}
            </div>

            <label htmlFor="avatar-bio" className="form-field-label sm:self-start sm:pt-2">
              {tr[6]}
            </label>
            <textarea
              id="avatar-bio"
              name="bio"
              value={bio}
              onChange={(e) => onBioChange(e.target.value)}
              placeholder={tr[7]}
              rows={2}
              className="min-w-0 w-full resize-none"
            />
          </div>
        </div>
      </div>

      {cameraOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
          role="presentation"
          onClick={closeCameraModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-camera-title"
            className="w-full max-w-lg rounded-2xl border border-tank-light bg-tank-gray p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="avatar-camera-title" className="mb-3 text-center text-lg font-semibold text-white">
              {tr[3]}
            </h3>
            {cameraSession ? (
              <video ref={videoRef} className="mx-auto mb-4 aspect-video w-full max-h-[50vh] rounded-lg bg-black object-cover" playsInline muted />
            ) : (
              <p className="mb-4 text-center text-sm text-gray-400">{translatedCameraError}</p>
            )}
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={closeCameraModal}
                className="rounded-xl border border-tank-light bg-tank-dark px-4 py-2.5 text-sm font-medium text-gray-200 hover:bg-tank-light/30"
              >
                {tr[8]}
              </button>
              {cameraSession && (
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="rounded-xl bg-tank-accent px-4 py-2.5 text-sm font-semibold text-tank-black hover:bg-tank-accent/90"
                >
                  {tr[9]}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
