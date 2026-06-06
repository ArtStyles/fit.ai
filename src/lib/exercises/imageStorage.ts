/** Extensión (sin punto) derivada de la URL de una imagen; 'jpg' por defecto. */
export function extensionFromUrl(url: string): string {
  let pathname = url
  try {
    pathname = new URL(url).pathname
  } catch {
    pathname = url.split('?')[0]
  }
  const match = pathname.match(/\.([a-zA-Z0-9]+)$/)
  return match ? match[1].toLowerCase() : 'jpg'
}

/** Clave del objeto en Storage para la imagen de un ejercicio, p. ej. "3_4_Sit-Up.jpg". */
export function storageObjectKey(id: string, sourceUrl: string): string {
  return `${id}.${extensionFromUrl(sourceUrl)}`
}
