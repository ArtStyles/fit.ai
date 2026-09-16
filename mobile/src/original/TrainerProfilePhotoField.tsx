import { WebHandoffCard } from './WebHandoffScreen'
export function TrainerProfilePhotoField({ photoUrl, error }: { photoUrl: string | null; error?: string }) {
  return <div className="space-y-2"><input type="hidden" name="professionalPhotoUrl" value={photoUrl ?? ''} /><WebHandoffCard destination="/coach/profile" />{error && <p role="alert" className="text-sm text-red-300">{error}</p>}</div>
}
