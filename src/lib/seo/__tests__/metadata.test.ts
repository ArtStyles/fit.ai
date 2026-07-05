import { describe, expect, it } from 'vitest'
import { buildLocalizedMetadata } from '../metadata'

describe('localized metadata', () => {
  it('emits canonical and reciprocal language alternates', () => {
    const value = buildLocalizedMetadata({
      locale: 'es',
      paths: {
        es: '/es/entrenamiento-personalizado',
        en: '/en/personalized-workouts',
      },
      title: 'Entrenamiento personalizado',
      description: 'Plan que progresa contigo.',
    })

    expect(value.alternates?.canonical).toBe(
      '/es/entrenamiento-personalizado',
    )
    expect(value.alternates?.languages).toEqual({
      'es-419': '/es/entrenamiento-personalizado',
      en: '/en/personalized-workouts',
      'x-default': '/',
    })
  })

  it('does not advertise a translation that does not exist', () => {
    const value = buildLocalizedMetadata({
      locale: 'en',
      paths: { en: '/en/only-in-english' },
      title: 'English-only page',
      description: 'This page has no Spanish translation.',
    })

    expect(value.alternates?.languages).toEqual({
      en: '/en/only-in-english',
      'x-default': '/',
    })
  })

  it('requires a canonical path for the current locale', () => {
    expect(() =>
      buildLocalizedMetadata({
        locale: 'es',
        paths: { en: '/en/english-page' },
        title: 'Página en español',
        description: 'No se configuró una ruta canónica.',
      }),
    ).toThrowError('Missing canonical path for locale es')
  })

  it('uses localized social metadata and supports noindex pages', () => {
    const value = buildLocalizedMetadata({
      locale: 'es',
      paths: { es: '/es/vista-previa' },
      title: 'Vista previa',
      description: 'Contenido que no debe aparecer en búsquedas.',
      image: '/images/vista-previa.png',
      index: false,
    })

    expect(value.robots).toEqual({ index: false, follow: true })
    expect(value.openGraph).toMatchObject({
      locale: 'es_419',
      url: '/es/vista-previa',
      images: ['/images/vista-previa.png'],
    })
    expect(value.twitter).toMatchObject({ card: 'summary_large_image' })
  })
})
