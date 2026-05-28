'use client'

import * as ToastPrimitive from '@radix-ui/react-toast'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error' | 'info'

export type ToastOptions = {
  title: string
  description?: string
  variant?: ToastVariant
}

type ToastItem = Required<ToastOptions> & {
  id: string
  open: boolean
}

type ToastContextValue = {
  showToast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function iconFor(variant: ToastVariant) {
  if (variant === 'success') return <CheckCircle2 className="h-4 w-4 text-green-400" />
  if (variant === 'error') return <XCircle className="h-4 w-4 text-red-400" />
  return <Info className="h-4 w-4 text-violet-300" />
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((options: ToastOptions) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts(current => [
      ...current,
      {
        id,
        title: options.title,
        description: options.description ?? '',
        variant: options.variant ?? 'info',
        open: true,
      },
    ])
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={3600}>
        {children}

        {toasts.map(toast => (
          <ToastPrimitive.Root
            key={toast.id}
            open={toast.open}
            onOpenChange={(open) => {
              if (open) return
              setToasts(current => current.filter(item => item.id !== toast.id))
            }}
            className={cn(
              'grid grid-cols-[auto,1fr,auto] items-start gap-3 rounded-xl border bg-background/95 p-4 text-foreground shadow-lg shadow-black/30 backdrop-blur-md',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:fade-in-0',
              'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:fade-out-0',
              toast.variant === 'success' && 'border-green-500/30',
              toast.variant === 'error' && 'border-red-500/30',
              toast.variant === 'info' && 'border-violet-500/30',
            )}
          >
            <div className="mt-0.5">{iconFor(toast.variant)}</div>
            <div className="min-w-0">
              <ToastPrimitive.Title className="text-sm font-semibold leading-none">
                {toast.title}
              </ToastPrimitive.Title>
              {toast.description && (
                <ToastPrimitive.Description className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {toast.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Cerrar notificacion"
              className="rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}

        <ToastPrimitive.Viewport className="fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
