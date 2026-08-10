const unexpected = async () => ({ ok: false as const, error: 'Unexpected Server Action call in DOM fixture.' })

export const saveTrainerApplicationDraft = unexpected
export const submitTrainerApplication = unexpected
export const uploadTrainerCredential = unexpected
export const removeTrainerCredential = unexpected
