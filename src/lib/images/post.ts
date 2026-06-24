// Helpers para fotos de publicaciones. validate/path son puros (testeables);
// resizePostImage usa <canvas> (solo cliente, no se testea).

export const MAX_POST_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB
export const MAX_POST_IMAGES = 4

export type PostImageValidation = { ok: true } | { ok: false; error: string }

export function validatePostImage(
  type: string,
  size: number,
  maxBytes = MAX_POST_IMAGE_BYTES,
): PostImageValidation {
  if (!type.startsWith('image/')) return { ok: false, error: 'El archivo debe ser una imagen.' }
  if (size <= 0) return { ok: false, error: 'El archivo está vacío.' }
  if (size > maxBytes) return { ok: false, error: 'La imagen supera el tamaño máximo (8 MB).' }
  return { ok: true }
}

export function postStoragePath(userId: string, postId: string, index: number): string {
  return `${userId}/${postId}/${index}.webp`
}

// Reescala manteniendo proporción a un ancho máximo y exporta webp (o jpeg). Solo cliente.
export async function resizePostImage(
  file: File,
  maxWidth = 1080,
  quality = 0.85,
): Promise<{ blob: Blob; contentType: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el contexto de canvas.')
  ctx.drawImage(bitmap, 0, 0, w, h)
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
