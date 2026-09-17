'use client'

import { useEffect } from 'react'

/** Progressive enhancement: all content is visible before JS and without it. */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-landing]')
    if (!root || !('IntersectionObserver' in window)) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    let observer: IntersectionObserver | undefined
    const configure = () => {
      observer?.disconnect()
      elements.forEach(element => { delete element.dataset.revealState })
      if (preference.matches) return
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return
          const element = entry.target as HTMLElement
          element.dataset.revealState = 'visible'
          observer?.unobserve(entry.target)
        })
      }, { threshold: 0.06, rootMargin: '0px 0px -24px 0px' })
      elements.forEach(element => {
        // Never hide content already on screen, including a direct hash visit.
        if (element.getBoundingClientRect().top > window.innerHeight) {
          element.dataset.revealState = 'pending'
          observer?.observe(element)
        }
      })
    }
    configure()
    preference.addEventListener('change', configure)
    return () => {
      observer?.disconnect()
      preference.removeEventListener('change', configure)
      elements.forEach(element => { delete element.dataset.revealState })
    }
  }, [])
  return null
}
