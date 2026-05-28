export function getWorkoutDisplayName(name: string, focus: string | null): string {
  const legacyMatch = name.match(/^Dia\s+\d+\s*[·.]\s*(.+)$/i)
    ?? name.match(/^Día\s+\d+\s*[·.]\s*(.+)$/i)

  if (!legacyMatch) return name

  const split = legacyMatch[1].trim()
  const splitLabel = split.toLowerCase() === 'legs' ? 'Piernas' : split
  const groups = (focus ?? '')
    .split('·')
    .map(group => group.trim())
    .filter(Boolean)

  if (groups.length === 0) return splitLabel

  const groupLabel = groups.length === 1
    ? groups[0]
    : `${groups[0]} y ${groups[1]}`
  const displayName = `${splitLabel} — ${groupLabel}`

  return displayName.length <= 30 ? displayName : splitLabel
}
