// Helpers para la foto de avatar.
// Puros y testeables: validateAvatarFile, computeSquareCrop, avatarStoragePath.
// resizeImageToSquare usa <canvas> y solo se ejecuta en el cliente (no se testea).

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB

export type AvatarValidation = { ok: true } | { ok: false; error: string }

export function validateAvatarFile(
  type: string,
  size: number,
  maxBytes = MAX_AVATAR_BYTES,
): AvatarValidation {
  if (!type.startsWith('image/')) return { ok: false, error: 'El archivo debe ser una imagen.' }
  if (size <= 0) return { ok: false, error: 'El archivo está vacío.' }
  if (size > maxBytes) return { ok: false, error: 'La imagen supera el tamaño máximo (5 MB).' }
  return { ok: true }
}

// Rectángulo cuadrado centrado para recortar una imagen de width×height.
export function computeSquareCrop(
  width: number,
  height: number,
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height)
  const sx = Math.floor((width - size) / 2)
  const sy = Math.floor((height - size) / 2)
  return { sx, sy, size }
}

// Ruta estable en el bucket; el upsert sobreescribe y evita huérfanos.
export function avatarStoragePath(userId: string): string {
  return `${userId}/avatar.webp`
}

// Carga la imagen, recorta al cuadrado centrado y reescala a size×size.
// Exporta webp; si el WebView no lo soporta, cae a jpeg. Solo cliente.
export async function resizeImageToSquare(
  file: File,
  size = 512,
  quality = 0.85,
): Promise<{ blob: Blob; contentType: string }> {
  const bitmap = await createImageBitmap(file)
  const { sx, sy, size: cropSize } = computeSquareCrop(bitmap.width, bitmap.height)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el contexto de canvas.')
  ctx.drawImage(bitmap, sx, sy, cropSize, cropSize, 0, 0, size, size)
  bitmap.close?.()

  const toBlob = (mime: string) =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality))

  let contentType = 'image/webp'
  let blob = await toBlob(contentType)
  if (!blob) {
    contentType = 'image/jpeg'
    blob = await toBlob(contentType)
  }
  if (!blob) throw new Error('No se pudo procesar la imagen.')
  return { blob, contentType }
}
