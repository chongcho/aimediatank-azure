/**
 * Meta AI visible badge on generated videos — static corner overlay that appears
 * for the first few seconds then fades out. The standalone crop tool blurs that
 * region only while the badge is still visible in the source.
 */

import { mapVideoRectToOutputSpace, type PrivacyRect } from '@/lib/privacyMask'

export const META_AI_WATERMARK_VISIBLE_SEC_DEFAULT = 3

export type MetaAiWatermarkCorner = 'bottom-left' | 'bottom-right'

/** Meta AI badge region in native video pixel space. */
export function getMetaAiWatermarkRectInVideoSpace(
  videoW: number,
  videoH: number,
  corner: MetaAiWatermarkCorner = 'bottom-left'
): PrivacyRect {
  const widthPct = 0.2
  const heightPct = 0.08
  const marginXPct = 0.012
  const marginYPct = 0.012

  const w = videoW * widthPct
  const h = videoH * heightPct
  const marginX = videoW * marginXPct
  const marginY = videoH * marginYPct

  if (corner === 'bottom-left') {
    return { x: marginX, y: videoH - h - marginY, width: w, height: h }
  }
  return { x: videoW - w - marginX, y: videoH - h - marginY, width: w, height: h }
}

/** Mask rectangle mapped into cropped encoder canvas space. */
export function getMetaAiWatermarkOutputRect(
  crop: { x: number; y: number; width: number; height: number },
  outputWidth: number,
  outputHeight: number,
  videoW: number,
  videoH: number,
  corner: MetaAiWatermarkCorner = 'bottom-left'
): PrivacyRect | null {
  const native = getMetaAiWatermarkRectInVideoSpace(videoW, videoH, corner)
  return mapVideoRectToOutputSpace(native, crop, outputWidth, outputHeight)
}
