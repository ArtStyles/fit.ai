'use client'

import { AdminRouteError } from '@/components/admin/AdminRouteError'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <AdminRouteError reset={reset} title="No se pudieron cargar los usuarios" />
  )
}
