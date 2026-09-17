'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { createPasswordRecovery } from '@/lib/auth/passwordRecovery'
import { authInputClassName, authLabelClassName, authSubmitClassName } from './authStyles'

const messages: Record<string, [string, string]> = {
  recovery_email: ['Escribe un correo válido.', 'Enter a valid email.'],
  recovery_offline: ['Conecta a internet para recuperar tu contraseña.', 'Connect to the internet to recover your password.'],
  recovery_unconfigured: ['La conexión de cuenta no está configurada en esta versión.', 'Account connection is not configured in this version.'],
  recovery_code: ['El código no es válido o ha caducado. Solicita otro e inténtalo de nuevo.', 'The code is invalid or expired. Request another and try again.'],
  recovery_identity: ['No se pudo verificar esa cuenta. Solicita otro código.', 'This account could not be verified. Request another code.'],
  recovery_required: ['Vuelve a verificar el código antes de cambiar tu contraseña.', 'Verify your code again before changing your password.'],
  password_mismatch: ['Las contraseñas no coinciden.', 'The passwords do not match.'],
  password_length: ['Usa al menos 8 caracteres.', 'Use at least 8 characters.'],
  recovery_request: ['No se pudo enviar la solicitud. Espera un momento y vuelve a intentarlo.', 'The request could not be sent. Wait a moment and try again.'],
  recovery_update: ['No se pudo cambiar la contraseña. Prueba una contraseña nueva de al menos 8 caracteres y vuelve a intentarlo.', 'The password could not be changed. Try a new password with at least 8 characters and try again.'],
}

export function PasswordRecoveryForm({ url, publicKey }: { url?: string; publicKey?: string }) {
  const { language } = useI18n(), en = language === 'en'
  const copy = (es: string, english: string) => en ? english : es
  const [flow] = useState(() => createPasswordRecovery(url && publicKey ? createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'vekira-password-recovery-ephemeral' } }) : null, () => navigator.onLine))
  const [step, setStep] = useState<'request' | 'code' | 'password' | 'done'>('request')
  const [email, setEmail] = useState(''), [code, setCode] = useState('')
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [cooldown, setCooldown] = useState(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; flow.cancel() } }, [flow])
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => value - 1), 1000); return () => clearTimeout(timer) }, [cooldown])
  async function run(operation: () => Promise<void>, next: typeof step) {
    if (busy) return
    setBusy(true); setError('')
    try { await operation(); if (mounted.current) { setStep(next); if (next === 'done') { setPassword(''); setConfirmation('') } } }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'recovery_request') }
    finally { if (mounted.current) setBusy(false) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step === 'request') await run(async () => { await flow.request(email); setCooldown(45) }, 'code')
    else if (step === 'code') await run(() => flow.verify(email, code), 'password')
    else await run(() => flow.update(password, confirmation), 'done')
  }
  if (step === 'done') return <div className="space-y-5"><p role="status">{copy('Contraseña actualizada. Abre la app e inicia sesión con tu nueva contraseña.', 'Password updated. Open the app and sign in with your new password.')}</p><PendingLink href={en ? '/en#descargar' : '/es#descargar'} className={authSubmitClassName}>{copy('Ir a la descarga', 'Go to download')}</PendingLink></div>
  const errorText = error && (messages[error] ?? messages.recovery_request)[en ? 1 : 0]
  return <form onSubmit={submit} className="space-y-5">
    {errorText && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorText}</p>}
    {step === 'request' && <><p className="text-sm leading-6 text-muted-foreground">{copy('Si existe una cuenta con ese correo, recibirás un código para restablecer tu contraseña.', 'If an account exists for that email, you will receive a code to reset your password.')}</p><label className={`block space-y-2 ${authLabelClassName}`}><span>{copy('Correo electrónico', 'Email')}</span><input className={authInputClassName} type="email" autoComplete="email" autoCapitalize="none" required disabled={busy} value={email} onChange={event => setEmail(event.target.value)} /></label></>}
    {step === 'code' && <><p role="status" className="text-sm leading-6 text-muted-foreground">{copy('Revisa tu correo e introduce el código de recuperación.', 'Check your email and enter the recovery code.')} <strong>{email}</strong></p><label className={`block space-y-2 ${authLabelClassName}`}><span>{copy('Código de recuperación', 'Recovery code')}</span><input className={authInputClassName} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" minLength={6} maxLength={8} required disabled={busy} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /></label></>}
    {step === 'password' && <><label className={`block space-y-2 ${authLabelClassName}`}><span>{copy('Nueva contraseña', 'New password')}</span><input className={authInputClassName} type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /></label><label className={`block space-y-2 ${authLabelClassName}`}><span>{copy('Repite la nueva contraseña', 'Repeat new password')}</span><input className={authInputClassName} type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label></>}
    <button type="submit" disabled={busy} className={authSubmitClassName}>{busy ? copy('Espera…', 'Please wait…') : step === 'request' ? copy('Enviar código de recuperación', 'Send recovery code') : step === 'code' ? copy('Verificar código', 'Verify code') : copy('Guardar nueva contraseña', 'Save new password')}</button>
    {step === 'request' && <button type="button" disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} className="min-h-11 w-full rounded-lg text-sm text-violet-300 underline focus-visible:ring-2" onClick={() => { setError(''); setStep('code') }}>{copy('Ya tengo un código', 'I already have a code')}</button>}
    {step === 'code' && <button type="button" disabled={busy || cooldown > 0} className="min-h-11 w-full rounded-lg text-sm text-violet-300 underline focus-visible:ring-2" onClick={() => void run(async () => { await flow.request(email); setCooldown(45) }, 'code')}>{cooldown ? copy(`Reenviar en ${cooldown} s`, `Resend in ${cooldown} s`) : copy('Reenviar código', 'Resend code')}</button>}
    {step !== 'request' && <button type="button" disabled={busy} className="min-h-11 w-full rounded-lg text-sm underline focus-visible:ring-2" onClick={() => { flow.cancel(); setCode(''); setPassword(''); setConfirmation(''); setError(''); setStep('request') }}>{copy('Usar otro correo', 'Use another email')}</button>}
    <PendingLink href={en ? '/en#descargar' : '/es#descargar'} className="flex min-h-11 items-center justify-center rounded-lg text-sm underline focus-visible:ring-2">{copy('Ir a la descarga', 'Go to download')}</PendingLink>
  </form>
}
