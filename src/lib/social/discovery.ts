// Helpers puros para descubrimiento de usuarios.

export const MAX_SEARCH_LENGTH = 100

// Quita caracteres que rompen el filtro .or(...) de PostgREST o permiten inyección en él
// (comas, paréntesis, asteriscos, porcentajes), normaliza espacios y limita la longitud
// (defensa server-side: una query enorme = escaneo ILIKE costoso, no confiamos en el input).
// Devuelve '' si no queda contenido útil. El llamador envuelve el resultado con % para el ILIKE.
export function sanitizeSearch(raw: string, maxLength = MAX_SEARCH_LENGTH): string {
  return raw.replace(/[,()*%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

// Quita duplicados conservando el primer orden de aparición.
export function dedupePreservingOrder(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}
