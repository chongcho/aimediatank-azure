'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
  onAvatarInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  usernameStatus: UsernameAvailabilityState
  statusHighlightMode: StatusHighlightMode
  /** When mode is `edit`, only show validation styling after the user edits the nickname */
  usernameEdited?: boolean
  uploadingAvatar?: boolean
  /** Increment to clear hidden file inputs (e.g. after avatar removed) */
  resetFileInputsSignal?: number
}

const NICKNAME_PLACEHOLDER = 'Type unique name to show up this platform'
const BIO_PLACEHOLDER = 'Tell others about yourself ...'

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

export default function AvatarNicknameBioBlock({
  avatarPreviewUrl,
  username,
  onUsernameChange,
  bio,
  onBioChange,
  onAvatarInputChange,
  usernameStatus,
  statusHighlightMode,
  usernameEdited = false,
  uploadingAvatar = false,
  resetFileInputsSignal = 0,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const closeMenu = useCallback(() => setMenuOpen(false), [])

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
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }, [resetFileInputsSignal])

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAvatarInputChange(e)
    e.target.value = ''
    closeMenu()
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
    <div className="flex items-start gap-4">
      <div className="relative shrink-0" ref={menuRef}>
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Choose avatar image from files"
          onChange={onFilePicked}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Take a photo for avatar"
          onChange={onFilePicked}
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
                alt="Avatar preview"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                <CameraIcon className="h-7 w-7 drop-shadow" />
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
              Choose from file
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-tank-light/60"
              onClick={() => {
                closeMenu()
                window.requestAnimationFrame(() => cameraInputRef.current?.click())
              }}
            >
              Take photo
            </button>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">
            Nickname <span className="text-gray-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              name="username"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              placeholder={NICKNAME_PLACEHOLDER}
              required
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
          </div>
          {showMessageRow && (
            <p
              className={`mt-1 text-xs ${
                usernameStatus.valid && usernameStatus.available ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {usernameStatus.message}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">Bio</label>
          <textarea
            name="bio"
            value={bio}
            onChange={(e) => onBioChange(e.target.value)}
            placeholder={BIO_PLACEHOLDER}
            rows={2}
            className="w-full resize-none rounded-lg border border-tank-light bg-tank-gray p-2 text-sm"
          />
        </div>
      </div>
    </div>
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
