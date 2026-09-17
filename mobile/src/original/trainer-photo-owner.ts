// Ownership is verified only by the authenticated server API. This defensive
// adapter rejects any accidental attempt to validate a professional URL locally.
export async function isOwnedTrainerPhoto(_owner: string, _photo: string): Promise<boolean> { return false }
