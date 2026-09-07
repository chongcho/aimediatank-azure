/**
 * Inject / update JFIF density (DPI) on a JPEG blob produced by canvas.toBlob.
 * Canvas JPEG often omits meaningful density; print apps read JFIF or EXIF DPI.
 */

function findJfifApp0(bytes: Uint8Array): { densityOffset: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let i = 2
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]
    if (marker === 0xd9 || marker === 0xda) break // EOI / SOS
    if (marker === 0x00 || marker === 0xff) {
      i++
      continue
    }

    if (i + 4 >= bytes.length) break
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3]
    if (segLen < 2 || i + 2 + segLen > bytes.length) break

    // APP0 + "JFIF\0"
    if (
      marker === 0xe0 &&
      segLen >= 16 &&
      bytes[i + 4] === 0x4a &&
      bytes[i + 5] === 0x46 &&
      bytes[i + 6] === 0x49 &&
      bytes[i + 7] === 0x46 &&
      bytes[i + 8] === 0x00
    ) {
      // units @ +9 from identifier start (= i+4), dens at +10/+12 → absolute i+14 density unit, i+15 X, i+17 Y
      // Layout: FF E0 | len | JFIF\0 | ver(2) | units(1) | Xdens(2) | Ydens(2) | ...
      return { densityOffset: i + 4 + 7 } // points at units byte
    }

    i += 2 + segLen
  }
  return null
}

function buildJfifApp0(dpi: number): Uint8Array {
  const d = Math.max(1, Math.min(65535, Math.round(dpi)))
  // APP0 length = 16 (includes the 2 length bytes)
  return new Uint8Array([
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00, // JFIF\0
    0x01,
    0x02, // version 1.02
    0x01, // units = dots per inch
    (d >> 8) & 0xff,
    d & 0xff, // Xdensity
    (d >> 8) & 0xff,
    d & 0xff, // Ydensity
    0x00,
    0x00, // no thumbnail
  ])
}

/** Return a JPEG blob with JFIF density set to `dpi` (dots per inch). */
export async function setJpegDpi(blob: Blob, dpi: number): Promise<Blob> {
  const d = Math.max(1, Math.min(65535, Math.round(dpi)))
  const buf = new Uint8Array(await blob.arrayBuffer())
  if (buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return blob
  }

  const found = findJfifApp0(buf)
  if (found) {
    const out = new Uint8Array(buf)
    out[found.densityOffset] = 0x01 // inches
    out[found.densityOffset + 1] = (d >> 8) & 0xff
    out[found.densityOffset + 2] = d & 0xff
    out[found.densityOffset + 3] = (d >> 8) & 0xff
    out[found.densityOffset + 4] = d & 0xff
    return new Blob([out], { type: blob.type || 'image/jpeg' })
  }

  // Insert JFIF APP0 immediately after SOI
  const app0 = buildJfifApp0(d)
  const out = new Uint8Array(2 + app0.length + (buf.length - 2))
  out[0] = 0xff
  out[1] = 0xd8
  out.set(app0, 2)
  out.set(buf.subarray(2), 2 + app0.length)
  return new Blob([out], { type: blob.type || 'image/jpeg' })
}

export const CROP_TOOL_DPI_OPTIONS = [72, 96, 150, 300, 600] as const
export type CropToolDpi = (typeof CROP_TOOL_DPI_OPTIONS)[number]
export const DEFAULT_CROP_TOOL_DPI: CropToolDpi = 72
