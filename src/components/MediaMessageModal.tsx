'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface MediaMessageModalProps {
  isOpen: boolean
  onClose: () => void
  defaultRecipient?: string
  myContentsHref?: string
}

export default function MediaMessageModal({
  isOpen,
  onClose,
  defaultRecipient = '@aidog',
  myContentsHref = '/profile/me',
}: MediaMessageModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const [recipient, setRecipient] = useState(defaultRecipient)
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<'crop' | 'trim' | 'filter' | 'text' | 'audio'>('crop')
  const [cropEnabled, setCropEnabled] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 100, height: 100 })
  const [cropRatio, setCropRatio] = useState<'free' | '16:9' | '4:3' | '1:1'>('free')
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(8)
  const [filter, setFilter] = useState({ brightness: 100, contrast: 100, saturate: 100 })
  const [overlayText, setOverlayText] = useState('')
  const [overlayPosition, setOverlayPosition] = useState<'top-left' | 'center' | 'bottom-right'>('center')
  const [audioVolume, setAudioVolume] = useState(100)
  const [ttsText, setTtsText] = useState('')
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (isOpen) {
      setRecipient(defaultRecipient)
      setMessage('')
      setFile(null)
      setActiveTool('crop')
      setCropEnabled(false)
      setCrop({ x: 0, y: 0, width: 100, height: 100 })
      setCropRatio('free')
      setTrimStart(0)
      setTrimEnd(8)
      setFilter({ brightness: 100, contrast: 100, saturate: 100 })
      setOverlayText('')
      setOverlayPosition('center')
      setAudioVolume(100)
      setTtsText('')
      setTtsEnabled(false)
      setIsSpeaking(false)
    }
  }, [isOpen, defaultRecipient])

  useEffect(() => {
    if (!isOpen && typeof window !== 'undefined') {
      window.speechSynthesis?.cancel()
      setIsSpeaking(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (videoRef.current) {
      const volume = ttsEnabled ? 0 : Math.max(0, Math.min(1, audioVolume / 100))
      videoRef.current.volume = volume
    }
  }, [audioVolume, ttsEnabled])

  const playTts = () => {
    if (typeof window === 'undefined' || !ttsText.trim()) {
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(ttsText.trim())
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    ttsUtteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }

  const stopTts = () => {
    if (typeof window === 'undefined') {
      return
    }
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  if (!isOpen) {
    return null
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null)
  }

  const applyCropRatio = (ratio: 'free' | '16:9' | '4:3' | '1:1') => {
    setCropRatio(ratio)
    if (ratio === 'free') {
      return
    }
    const ratioValue = ratio === '16:9' ? 16 / 9 : ratio === '4:3' ? 4 / 3 : 1
    const maxWidth = 100 - crop.x
    const maxHeight = 100 - crop.y
    let nextWidth = crop.width
    let nextHeight = Math.round(nextWidth / ratioValue)

    if (nextHeight > maxHeight) {
      nextHeight = maxHeight
      nextWidth = Math.round(nextHeight * ratioValue)
    }
    if (nextWidth > maxWidth) {
      nextWidth = maxWidth
      nextHeight = Math.round(nextWidth / ratioValue)
    }
    setCrop((prev) => ({
      ...prev,
      width: Math.max(10, Math.min(maxWidth, nextWidth)),
      height: Math.max(10, Math.min(maxHeight, nextHeight)),
    }))
  }

  const filterStyle = {
    filter: `brightness(${filter.brightness}%) contrast(${filter.contrast}%) saturate(${filter.saturate}%)`,
  }

  const cropStyle = cropEnabled
    ? { clipPath: `inset(${crop.y}% ${100 - (crop.x + crop.width)}% ${100 - (crop.y + crop.height)}% ${crop.x}%)` }
    : {}

  const overlayClass =
    overlayPosition === 'top-left'
      ? 'top-4 left-4'
      : overlayPosition === 'bottom-right'
      ? 'bottom-4 right-4'
      : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-24">
      <div className="relative w-full max-w-5xl rounded-2xl border border-white/10 bg-[#165d73] text-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg border border-white/30 text-white/80 hover:text-white"
          aria-label="Close media message"
        >
          ✕
        </button>

        <div className="space-y-4 p-6 md:p-8">
          <div className="space-y-2">
            <label className="text-lg font-semibold">
              Send to:{' '}
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="bg-transparent text-white/90 underline decoration-white/40 placeholder:text-white/50 focus:outline-none"
                placeholder="@username"
              />
            </label>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:border-white/40 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-6 md:flex-row">
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Select media in My Contents</span>
                <Link
                  href={myContentsHref}
                  className="rounded-md border border-white/30 px-3 py-1 text-xs hover:bg-white/10"
                  onClick={onClose}
                >
                  Browse My Contents
                </Link>
              </div>

              <div className="min-h-[240px] rounded-xl border border-white/20 bg-black/20 p-3">
                {previewUrl ? (
                  file?.type.startsWith('video/') ? (
                    <div className="relative">
                      <video
                        ref={videoRef}
                        src={previewUrl}
                        controls
                        className="max-h-80 w-full rounded-lg"
                        style={{ ...filterStyle, ...cropStyle }}
                      />
                      {overlayText && (
                        <div className={`pointer-events-none absolute ${overlayClass} rounded bg-black/50 px-2 py-1 text-sm`}>
                          {overlayText}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative">
                      <img
                        src={previewUrl}
                        alt="Selected media"
                        className="max-h-80 w-full rounded-lg object-contain"
                        style={{ ...filterStyle, ...cropStyle }}
                      />
                      {overlayText && (
                        <div className={`pointer-events-none absolute ${overlayClass} rounded bg-black/50 px-2 py-1 text-sm`}>
                          {overlayText}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-white/60">
                    No media selected yet
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-white/40 px-4 py-2 text-sm hover:bg-white/10"
                >
                  Change file
                </button>
                <button
                  type="button"
                  disabled={!file}
                  className="rounded-lg border border-white/40 px-4 py-2 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Review-Confirm-Send
                </button>
                <button
                  type="button"
                  disabled={!file}
                  className="rounded-lg border border-white/40 px-4 py-2 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Original-Confirm-Send
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <div className="w-full md:w-64 space-y-4">
              <div className="space-y-3 rounded-xl border border-white/20 bg-white/5 p-4 text-sm">
                <button
                  type="button"
                  onClick={() => setActiveTool('crop')}
                  className={`w-full rounded-lg border px-3 py-2 text-left font-semibold transition-all ${
                    activeTool === 'crop' ? 'border-white bg-white/10' : 'border-white/10 hover:bg-white/10'
                  }`}
                >
                  Crop features
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTool('trim')}
                  className={`w-full rounded-lg border px-3 py-2 text-left font-semibold transition-all ${
                    activeTool === 'trim' ? 'border-white bg-white/10' : 'border-white/10 hover:bg-white/10'
                  }`}
                >
                  Trim features
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTool('filter')}
                  className={`w-full rounded-lg border px-3 py-2 text-left font-semibold transition-all ${
                    activeTool === 'filter' ? 'border-white bg-white/10' : 'border-white/10 hover:bg-white/10'
                  }`}
                >
                  Filter features
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTool('text')}
                  className={`w-full rounded-lg border px-3 py-2 text-left font-semibold transition-all ${
                    activeTool === 'text' ? 'border-white bg-white/10' : 'border-white/10 hover:bg-white/10'
                  }`}
                >
                  Text Overlay features
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTool('audio')}
                  className={`w-full rounded-lg border px-3 py-2 text-left font-semibold transition-all ${
                    activeTool === 'audio' ? 'border-white bg-white/10' : 'border-white/10 hover:bg-white/10'
                  }`}
                >
                  Audio Edit features
                </button>
              </div>

              <div className="rounded-xl border border-white/20 bg-white/5 p-4 text-sm">
                {activeTool === 'crop' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Crop</span>
                      <button
                        type="button"
                        onClick={() => setCropEnabled((prev) => !prev)}
                        className={`rounded-md border px-2 py-1 text-xs ${
                          cropEnabled ? 'border-white bg-white/10' : 'border-white/20'
                        }`}
                      >
                        {cropEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {(['free', '16:9', '4:3', '1:1'] as const).map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => applyCropRatio(ratio)}
                          className={`rounded-md border px-2 py-1 ${
                            cropRatio === ratio ? 'border-white bg-white/10' : 'border-white/20'
                          }`}
                        >
                          {ratio === 'free' ? 'Free' : ratio}
                        </button>
                      ))}
                    </div>
                    <label className="space-y-1">
                      <span className="text-xs">Left: {crop.x}%</span>
                      <input
                        type="range"
                        min={0}
                        max={100 - crop.width}
                        value={crop.x}
                        onChange={(e) => setCrop((prev) => ({ ...prev, x: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs">Top: {crop.y}%</span>
                      <input
                        type="range"
                        min={0}
                        max={100 - crop.height}
                        value={crop.y}
                        onChange={(e) => setCrop((prev) => ({ ...prev, y: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs">Width: {crop.width}%</span>
                      <input
                        type="range"
                        min={10}
                        max={100 - crop.x}
                        value={crop.width}
                        onChange={(e) => setCrop((prev) => ({ ...prev, width: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs">Height: {crop.height}%</span>
                      <input
                        type="range"
                        min={10}
                        max={100 - crop.y}
                        value={crop.height}
                        onChange={(e) => setCrop((prev) => ({ ...prev, height: Number(e.target.value) }))}
                      />
                    </label>
                  </div>
                )}

                {activeTool === 'trim' && (
                  <div className="space-y-3">
                    <p className="text-xs text-white/70">Trim applies to video selections.</p>
                    <label className="space-y-1">
                      <span className="text-xs">Start (sec): {trimStart}</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(trimEnd - 1, 1)}
                        value={trimStart}
                        onChange={(e) => setTrimStart(Number(e.target.value))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs">End (sec): {trimEnd}</span>
                      <input
                        type="range"
                        min={Math.max(trimStart + 1, 1)}
                        max={60}
                        value={trimEnd}
                        onChange={(e) => setTrimEnd(Number(e.target.value))}
                      />
                    </label>
                    <p className="text-[11px] text-white/60">Preview trimming is a UI placeholder.</p>
                  </div>
                )}

                {activeTool === 'filter' && (
                  <div className="space-y-3">
                    <label className="space-y-1">
                      <span className="text-xs">Brightness: {filter.brightness}%</span>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        value={filter.brightness}
                        onChange={(e) => setFilter((prev) => ({ ...prev, brightness: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs">Contrast: {filter.contrast}%</span>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        value={filter.contrast}
                        onChange={(e) => setFilter((prev) => ({ ...prev, contrast: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs">Saturation: {filter.saturate}%</span>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        value={filter.saturate}
                        onChange={(e) => setFilter((prev) => ({ ...prev, saturate: Number(e.target.value) }))}
                      />
                    </label>
                  </div>
                )}

                {activeTool === 'text' && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={overlayText}
                      onChange={(e) => setOverlayText(e.target.value)}
                      placeholder="Overlay text"
                      className="w-full rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/60"
                    />
                    <select
                      value={overlayPosition}
                      onChange={(e) => setOverlayPosition(e.target.value as typeof overlayPosition)}
                      className="w-full rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white"
                    >
                      <option value="top-left">Top left</option>
                      <option value="center">Center</option>
                      <option value="bottom-right">Bottom right</option>
                    </select>
                  </div>
                )}

                {activeTool === 'audio' && (
                  <div className="space-y-3">
                    <label className="space-y-1">
                      <span className="text-xs">Volume: {audioVolume}%</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={audioVolume}
                        onChange={(e) => setAudioVolume(Number(e.target.value))}
                      />
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={ttsEnabled}
                          onChange={(e) => setTtsEnabled(e.target.checked)}
                        />
                        Text-to-speech (mute existing audio)
                      </label>
                      {ttsEnabled && (
                        <>
                          <textarea
                            rows={3}
                            value={ttsText}
                            onChange={(e) => setTtsText(e.target.value)}
                            placeholder="Type text to speak with the media..."
                            className="w-full rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/60"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={playTts}
                              disabled={!ttsText.trim()}
                              className="rounded-md border border-white/30 px-2 py-1 text-xs hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSpeaking ? 'Speaking...' : 'Play TTS'}
                            </button>
                            <button
                              type="button"
                              onClick={stopTts}
                              className="rounded-md border border-white/30 px-2 py-1 text-xs hover:bg-white/10"
                            >
                              Stop
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-white/60">Audio tools apply to videos only.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
