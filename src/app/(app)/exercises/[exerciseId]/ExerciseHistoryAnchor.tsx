'use client'

import { useEffect } from 'react'

export function ExerciseHistoryAnchor() {
  useEffect(() => {
    if (window.location.hash !== '#exercise-history-title') return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('exercise-history-title')?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return null
}
