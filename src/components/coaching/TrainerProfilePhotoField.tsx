export type TrainerPhotoFieldProps = { photoUrl: string | null; error?: string; disabled?: boolean; onChange?: (url: string | null) => void; onBusyChange?: (busy: boolean) => void }
export function TrainerProfilePhotoField({ photoUrl, error, disabled, onChange }: TrainerPhotoFieldProps) {
  return <label htmlFor="professionalPhotoUrl" className="block text-sm font-semibold text-foreground">
    Foto profesional
    <input id="professionalPhotoUrl" name="professionalPhotoUrl" type="url" defaultValue={photoUrl ?? ''} disabled={disabled} onChange={event => onChange?.(event.target.value || null)} placeholder="https://…" aria-invalid={Boolean(error)} aria-describedby={error ? 'professionalPhotoUrl-error' : undefined} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
    {error && <p id="professionalPhotoUrl-error" role="alert" className="mt-1 text-sm text-red-300">{error}</p>}
  </label>
}
