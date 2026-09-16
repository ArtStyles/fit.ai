// The existing form keeps its current photo. A forged/new URL is rejected here
// without importing a privileged Storage client; editing the photo opens web.
export async function isOwnedTrainerPhoto(_owner: string, _photo: string): Promise<boolean> { return false }
