'use client'

import { useEffect, useRef, useState } from 'react'
import type { CompanionResult, CompanionSnapshot } from '@/lib/companions/types'
import { companionErrorMessage } from './CompanionPresentation'

export type CompanionTask = <T>(operation: () => Promise<CompanionResult<T>>, success: (value: T) => void, fallback: string, options?: { ignoreErrors?: readonly string[] }) => Promise<void>

export function useCompanionTask(onChange: (value: CompanionResult<CompanionSnapshot>) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const run: CompanionTask = async (operation, success, fallback, options) => {
    if (busyRef.current || !mounted.current) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      const result = await operation()
      if (!mounted.current) return
      if (result.ok) success(result.value)
      else {
        if (options?.ignoreErrors?.includes(result.code)) return
        setError(companionErrorMessage(result.code, fallback))
        if (result.code === 'unauthenticated') onChange(result)
      }
    } catch {
      if (mounted.current) setError(fallback)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return { run, busy, error, clearError: () => setError('') }
}
