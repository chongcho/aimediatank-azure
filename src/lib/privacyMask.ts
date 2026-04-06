/**
 * Client-side privacy masking for the standalone crop tool.
 * - Faces: BlazeFace (TensorFlow.js).
 * - License plates: heuristic region on COCO-SSD vehicles (car, truck, bus, motorcycle);
 *   not a dedicated plate detector — best for front/rear vehicle views.
 */

export type PrivacyMaskStyle = 'solid' | 'blur' | 'pixelate'

export type PrivacyMaskRequest = {
  maskFaces: boolean
  maskPlates: boolean
  style: PrivacyMaskStyle
}

export type PrivacyRect = { x: number; y: number; width: number; height: number }

type BlazeFaceModule = typeof import('@tensorflow-models/blazeface')
type CocoSsdModule = typeof import('@tensorflow-models/coco-ssd')

let tfReady = false
let blazeModel: Awaited<ReturnType<BlazeFaceModule['load']>> | null = null
let cocoModel: Awaited<ReturnType<CocoSsdModule['load']>> | null = null

const VEHICLE_CLASSES = new Set(['car', 'truck', 'bus', 'motorcycle'])

async function ensureTfBackend(): Promise<void> {
  if (tfReady) return
  const tf = await import('@tensorflow/tfjs')
  await tf.ready()
  try {
    await tf.setBackend('webgl')
    await tf.ready()
  } catch {
    await tf.setBackend('cpu')
    await tf.ready()
  }
  tfReady = true
}

export async function preloadPrivacyModels(request: PrivacyMaskRequest): Promise<void> {
  await ensureTfBackend()
  if (request.maskFaces && !blazeModel) {
    const blazeface = (await import('@tensorflow-models/blazeface')) as BlazeFaceModule
    blazeModel = await blazeface.load()
  }
  if (request.maskPlates && !cocoModel) {
    const coco = (await import('@tensorflow-models/coco-ssd')) as CocoSsdModule
    cocoModel = await coco.load({ base: 'lite_mobilenet_v2' })
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function expandRect(r: PrivacyRect, scale: number, maxW: number, maxH: number): PrivacyRect {
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  const w = r.width * scale
  const h = r.height * scale
  let x = cx - w / 2
  let y = cy - h / 2
  x = clamp(x, 0, Math.max(0, maxW - w))
  y = clamp(y, 0, Math.max(0, maxH - h))
  return { x, y, width: w, height: h }
}

/** Approximate plate band: bottom-center of a vehicle bounding box (video pixel space). */
function plateBandFromVehicleBBox(bx: number, by: number, bw: number, bh: number): PrivacyRect {
  const bandW = bw * 0.58
  const bandH = bh * 0.22
  const x = bx + (bw - bandW) / 2
  const y = by + bh * 0.72
  return {
    x: clamp(x, bx, bx + bw - bandW),
    y: clamp(y, by, by + bh - bandH),
    width: bandW,
    height: bandH,
  }
}

export function mapVideoRectToOutputSpace(
  rect: PrivacyRect,
  crop: { x: number; y: number; width: number; height: number },
  outW: number,
  outH: number
): PrivacyRect | null {
  const x1 = Math.max(rect.x, crop.x)
  const y1 = Math.max(rect.y, crop.y)
  const x2 = Math.min(rect.x + rect.width, crop.x + crop.width)
  const y2 = Math.min(rect.y + rect.height, crop.y + crop.height)
  if (x2 - x1 < 4 || y2 - y1 < 4) return null

  const ox = ((x1 - crop.x) / crop.width) * outW
  const oy = ((y1 - crop.y) / crop.height) * outH
  const ow = ((x2 - x1) / crop.width) * outW
  const oh = ((y2 - y1) / crop.height) * outH
  return { x: ox, y: oy, width: ow, height: oh }
}

export async function collectPrivacyRectsNative(
  source: HTMLVideoElement | HTMLImageElement,
  opts: { maskFaces: boolean; maskPlates: boolean }
): Promise<{ faces: PrivacyRect[]; plates: PrivacyRect[] }> {
  const faces: PrivacyRect[] = []
  const plates: PrivacyRect[] = []

  const w =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : (source as HTMLImageElement).naturalWidth
  const h =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : (source as HTMLImageElement).naturalHeight

  if (!w || !h) return { faces: [], plates: [] }

  if (opts.maskFaces) {
    await ensureTfBackend()
    if (!blazeModel) {
      const blazeface = (await import('@tensorflow-models/blazeface')) as BlazeFaceModule
      blazeModel = await blazeface.load()
    }
    const preds = await blazeModel.estimateFaces(source, false)
    for (const p of preds) {
      const tl = p.topLeft as [number, number]
      const br = p.bottomRight as [number, number]
      const raw: PrivacyRect = {
        x: tl[0],
        y: tl[1],
        width: Math.max(4, br[0] - tl[0]),
        height: Math.max(4, br[1] - tl[1]),
      }
      faces.push(expandRect(raw, 1.18, w, h))
    }
  }

  if (opts.maskPlates) {
    await ensureTfBackend()
    if (!cocoModel) {
      const coco = (await import('@tensorflow-models/coco-ssd')) as CocoSsdModule
      cocoModel = await coco.load({ base: 'lite_mobilenet_v2' })
    }
    const preds = await cocoModel.detect(source, 12, 0.34)
    for (const pred of preds) {
      if (!VEHICLE_CLASSES.has(pred.class)) continue
      const [bx, by, bw, bh] = pred.bbox
      plates.push(plateBandFromVehicleBBox(bx, by, bw, bh))
    }
  }

  return { faces, plates }
}

export async function getCroppedOutputMaskRects(
  source: HTMLVideoElement | HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
  outputWidth: number,
  outputHeight: number,
  opts: { maskFaces: boolean; maskPlates: boolean }
): Promise<PrivacyRect[]> {
  const { faces, plates } = await collectPrivacyRectsNative(source, opts)
  const out: PrivacyRect[] = []
  for (const r of faces) {
    const m = mapVideoRectToOutputSpace(r, crop, outputWidth, outputHeight)
    if (m) out.push(m)
  }
  for (const r of plates) {
    const m = mapVideoRectToOutputSpace(r, crop, outputWidth, outputHeight)
    if (m) out.push(m)
  }
  return out
}

function blurRegion(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  strength: number
) {
  const pad = Math.round(12 + strength)
  const sx = Math.max(0, Math.floor(x - pad))
  const sy = Math.max(0, Math.floor(y - pad))
  const sw = Math.min(canvas.width - sx, Math.ceil(w + 2 * pad))
  const sh = Math.min(canvas.height - sy, Math.ceil(h + 2 * pad))
  if (sw < 2 || sh < 2) return

  const off = document.createElement('canvas')
  off.width = sw
  off.height = sh
  const octx = off.getContext('2d')
  if (!octx) return
  octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)

  ctx.save()
  ctx.filter = `blur(${strength}px)`
  ctx.drawImage(off, 0, 0, sw, sh, sx, sy, sw, sh)
  ctx.restore()
  ctx.filter = 'none'
}

function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  blocks = 10
) {
  const sx = Math.max(0, Math.floor(x))
  const sy = Math.max(0, Math.floor(y))
  const sw = Math.min(canvas.width - sx, Math.ceil(w))
  const sh = Math.min(canvas.height - sy, Math.ceil(h))
  if (sw < 2 || sh < 2) return

  const tw = Math.max(2, Math.floor(sw / blocks))
  const th = Math.max(2, Math.floor(sh / blocks))
  const off = document.createElement('canvas')
  off.width = tw
  off.height = th
  const octx = off.getContext('2d')
  if (!octx) return
  octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tw, th)

  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(off, 0, 0, tw, th, sx, sy, sw, sh)
  ctx.restore()
}

export function applyPrivacyMasksAfterDraw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rects: PrivacyRect[],
  style: PrivacyMaskStyle
) {
  for (const r of rects) {
    const x = Math.floor(r.x)
    const y = Math.floor(r.y)
    const w = Math.ceil(r.width)
    const h = Math.ceil(r.height)
    if (w < 2 || h < 2) continue
    if (x >= canvas.width || y >= canvas.height) continue

    if (style === 'solid') {
      ctx.fillStyle = '#000000'
      ctx.fillRect(x, y, w, h)
    } else if (style === 'blur') {
      blurRegion(ctx, canvas, x, y, w, h, 14)
    } else {
      pixelateRegion(ctx, canvas, x, y, w, h, 12)
    }
  }
}
