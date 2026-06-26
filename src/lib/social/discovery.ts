// Helpers puros para descubrimiento de usuarios.

// Quita caracteres que rompen el filtro .or(...) de PostgREST o permiten inyección en él
// (comas, paréntesis, asteriscos, porcentajes) y normaliza espacios. Devuelve '' si no
// queda contenido útil. El llamador envuelve el resultado con % para el ILIKE.
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*%]/g, ' ').replace(/\s+/g, ' ').trim()
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
