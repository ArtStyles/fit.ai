export function parsePsqlScalar(output, label) {
  const values = output
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)

  if (values.length !== 1) {
    throw new Error(`${label} did not return exactly one scalar value`)
  }

  return values[0]
}
