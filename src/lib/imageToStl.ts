/**
 * Client-side 2D image → printable STL (heightmap relief / lithophane).
 * Units are millimeters. Binary STL is suitable for slicers (Cura, PrusaSlicer, etc.).
 */

export type ImageToStlMode = 'relief' | 'lithophane'

export type ImageToStlOptions = {
  /** Physical width of the model in mm (depth follows image aspect). */
  widthMm: number
  /** Extra height above the base for the brightest (or darkest) pixels. */
  reliefMm: number
  /** Solid base thickness under the relief (mm). */
  baseMm: number
  /** Max samples along the longest image edge (keeps STL size manageable). */
  maxSamples: number
  mode: ImageToStlMode
  /** When true, flip height mapping (dark = tall for relief). */
  invert: boolean
}

export type HeightmapResult = {
  cols: number
  rows: number
  /** Row-major heights in mm (Z), length cols * rows */
  heights: Float32Array
  widthMm: number
  depthMm: number
  minZ: number
  maxZ: number
}

export type StlBuildResult = {
  blob: Blob
  triangleCount: number
  widthMm: number
  depthMm: number
  heightMm: number
  samplesX: number
  samplesY: number
}

const DEFAULTS: ImageToStlOptions = {
  widthMm: 80,
  reliefMm: 3,
  baseMm: 1.2,
  maxSamples: 180,
  mode: 'relief',
  invert: false,
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/** Luminance 0–1 from sRGB channel bytes. */
function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * Draw image into an offscreen canvas at target sample size and return heightmap (mm).
 */
export function imageToHeightmap(
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: Partial<ImageToStlOptions> = {}
): HeightmapResult {
  const opts = { ...DEFAULTS, ...options }
  const widthMm = clamp(opts.widthMm, 10, 400)
  const reliefMm = clamp(opts.reliefMm, 0.2, 40)
  const baseMm = clamp(opts.baseMm, 0.4, 20)
  const maxSamples = Math.round(clamp(opts.maxSamples, 32, 400))

  const aspect = sourceWidth / Math.max(1, sourceHeight)
  let cols: number
  let rows: number
  if (aspect >= 1) {
    cols = maxSamples
    rows = Math.max(2, Math.round(maxSamples / aspect))
  } else {
    rows = maxSamples
    cols = Math.max(2, Math.round(maxSamples * aspect))
  }

  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.drawImage(image, 0, 0, cols, rows)
  const { data } = ctx.getImageData(0, 0, cols, rows)

  const depthMm = widthMm / aspect
  const heights = new Float32Array(cols * rows)

  let minZ = Infinity
  let maxZ = -Infinity

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4
      let t = luminance(data[i], data[i + 1], data[i + 2])
      if (opts.mode === 'lithophane') {
        // Lithophane: dark areas thicker so light shows the image when backlit.
        t = 1 - t
      }
      if (opts.invert) t = 1 - t
      const z = baseMm + t * reliefMm
      heights[y * cols + x] = z
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }

  return { cols, rows, heights, widthMm, depthMm, minZ, maxZ }
}

function writeFloat32LE(view: DataView, offset: number, value: number) {
  view.setFloat32(offset, value, true)
}

function writeVec3(view: DataView, offset: number, x: number, y: number, z: number) {
  writeFloat32LE(view, offset, x)
  writeFloat32LE(view, offset + 4, y)
  writeFloat32LE(view, offset + 8, z)
}

function normalOf(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): [number, number, number] {
  const ux = bx - ax
  const uy = by - ay
  const uz = bz - az
  const vx = cx - ax
  const vy = cy - ay
  const vz = cz - az
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

type TriWriter = {
  count: number
  push(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number
  ): void
  finish(): Blob
}

function createBinaryStlWriter(triangleCapacity: number): TriWriter {
  const bytes = new ArrayBuffer(84 + triangleCapacity * 50)
  const view = new DataView(bytes)
  const header = 'AI Media Tank 3D Print Tool'
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0)
  }
  let offset = 84
  const writer: TriWriter = {
    count: 0,
    push(ax, ay, az, bx, by, bz, cx, cy, cz) {
      if (writer.count >= triangleCapacity) throw new Error('STL triangle buffer overflow')
      const [nx, ny, nz] = normalOf(ax, ay, az, bx, by, bz, cx, cy, cz)
      writeVec3(view, offset, nx, ny, nz)
      writeVec3(view, offset + 12, ax, ay, az)
      writeVec3(view, offset + 24, bx, by, bz)
      writeVec3(view, offset + 36, cx, cy, cz)
      view.setUint16(offset + 48, 0, true)
      offset += 50
      writer.count++
    },
    finish() {
      view.setUint32(80, writer.count, true)
      return new Blob([bytes.slice(0, 84 + writer.count * 50)], { type: 'model/stl' })
    },
  }
  return writer
}

/**
 * Build a watertight solid: heightmap top, flat bottom at z=0, and side walls.
 */
export function heightmapToStl(map: HeightmapResult): StlBuildResult {
  const { cols, rows, heights, widthMm, depthMm } = map
  const cellW = widthMm / (cols - 1)
  const cellD = depthMm / (rows - 1)

  // Top quads: (cols-1)*(rows-1)*2
  // Bottom: same
  // Walls: 2*((cols-1)+(rows-1))*2
  const topTris = (cols - 1) * (rows - 1) * 2
  const bottomTris = topTris
  const wallTris = 2 * ((cols - 1) + (rows - 1)) * 2
  const writer = createBinaryStlWriter(topTris + bottomTris + wallTris)

  const xAt = (c: number) => c * cellW
  const yAt = (r: number) => (rows - 1 - r) * cellD // image row 0 at +Y (back)
  const zAt = (c: number, r: number) => heights[r * cols + c]

  // Top surface
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const x0 = xAt(c)
      const x1 = xAt(c + 1)
      const y0 = yAt(r)
      const y1 = yAt(r + 1)
      const z00 = zAt(c, r)
      const z10 = zAt(c + 1, r)
      const z01 = zAt(c, r + 1)
      const z11 = zAt(c + 1, r + 1)
      // CCW when viewed from above (+Z)
      writer.push(x0, y0, z00, x1, y0, z10, x1, y1, z11)
      writer.push(x0, y0, z00, x1, y1, z11, x0, y1, z01)
    }
  }

  // Bottom at z=0 (outward normal -Z → reverse winding)
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const x0 = xAt(c)
      const x1 = xAt(c + 1)
      const y0 = yAt(r)
      const y1 = yAt(r + 1)
      writer.push(x0, y0, 0, x1, y1, 0, x1, y0, 0)
      writer.push(x0, y0, 0, x0, y1, 0, x1, y1, 0)
    }
  }

  // Front edge (r = rows-1, -Y outward)
  for (let c = 0; c < cols - 1; c++) {
    const x0 = xAt(c)
    const x1 = xAt(c + 1)
    const y = yAt(rows - 1)
    const z0 = zAt(c, rows - 1)
    const z1 = zAt(c + 1, rows - 1)
    writer.push(x0, y, 0, x1, y, 0, x1, y, z1)
    writer.push(x0, y, 0, x1, y, z1, x0, y, z0)
  }

  // Back edge (r = 0, +Y outward)
  for (let c = 0; c < cols - 1; c++) {
    const x0 = xAt(c)
    const x1 = xAt(c + 1)
    const y = yAt(0)
    const z0 = zAt(c, 0)
    const z1 = zAt(c + 1, 0)
    writer.push(x0, y, 0, x1, y, z1, x1, y, 0)
    writer.push(x0, y, 0, x0, y, z0, x1, y, z1)
  }

  // Left edge (c = 0, -X outward)
  for (let r = 0; r < rows - 1; r++) {
    const x = xAt(0)
    const y0 = yAt(r)
    const y1 = yAt(r + 1)
    const z0 = zAt(0, r)
    const z1 = zAt(0, r + 1)
    writer.push(x, y0, 0, x, y1, z1, x, y1, 0)
    writer.push(x, y0, 0, x, y0, z0, x, y1, z1)
  }

  // Right edge (c = cols-1, +X outward)
  for (let r = 0; r < rows - 1; r++) {
    const x = xAt(cols - 1)
    const y0 = yAt(r)
    const y1 = yAt(r + 1)
    const z0 = zAt(cols - 1, r)
    const z1 = zAt(cols - 1, r + 1)
    writer.push(x, y0, 0, x, y1, 0, x, y1, z1)
    writer.push(x, y0, 0, x, y1, z1, x, y0, z0)
  }

  const blob = writer.finish()
  return {
    blob,
    triangleCount: writer.count,
    widthMm,
    depthMm,
    heightMm: map.maxZ,
    samplesX: cols,
    samplesY: rows,
  }
}

export function buildStlFromImage(
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: Partial<ImageToStlOptions> = {}
): StlBuildResult {
  const map = imageToHeightmap(image, sourceWidth, sourceHeight, options)
  return heightmapToStl(map)
}

/** Draw a grayscale height preview (taller = lighter) into a canvas. */
export function drawHeightmapPreview(
  canvas: HTMLCanvasElement,
  map: HeightmapResult,
  maxDisplay = 480
) {
  const scale = Math.min(1, maxDisplay / Math.max(map.cols, map.rows))
  const w = Math.max(1, Math.round(map.cols * scale))
  const h = Math.max(1, Math.round(map.rows * scale))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(w, h)
  const range = Math.max(1e-6, map.maxZ - map.minZ)
  for (let y = 0; y < h; y++) {
    const srcY = Math.min(map.rows - 1, Math.floor((y / h) * map.rows))
    for (let x = 0; x < w; x++) {
      const srcX = Math.min(map.cols - 1, Math.floor((x / w) * map.cols))
      const z = map.heights[srcY * map.cols + srcX]
      const g = Math.round(((z - map.minZ) / range) * 255)
      const i = (y * w + x) * 4
      img.data[i] = g
      img.data[i + 1] = g
      img.data[i + 2] = g
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
