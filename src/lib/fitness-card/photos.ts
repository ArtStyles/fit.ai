/** Decode and re-encode chosen images so shared files contain pixels without EXIF metadata. */
export async function prepareFitnessPhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error('Elige una foto JPG, PNG o WebP de hasta 12 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('La resolución de esta foto es demasiado grande.')
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo preparar la foto.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('No se pudo preparar la foto.')), 'image/webp', 0.86))
    if (blob.type !== 'image/webp' || blob.size > 2 * 1024 * 1024) throw new Error('Prueba con una foto más pequeña.')
    return blob
  } finally { URL.revokeObjectURL(url) }
}
