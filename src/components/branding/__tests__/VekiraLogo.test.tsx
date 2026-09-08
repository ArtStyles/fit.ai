import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VekiraMark } from '../VekiraLogo'

describe('VekiraMark', () => {
  it('keeps each mark paint independent of other, potentially hidden marks', () => {
    const html = renderToStaticMarkup(<><div hidden><VekiraMark /></div><VekiraMark /></>)
    const marks = Array.from(html.matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/g))
    const ids = marks.map(mark => mark[1].match(/<linearGradient id="([^"]+)"/)?.[1])

    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    marks.forEach((mark, index) => {
      const paints = Array.from(mark[1].matchAll(/fill="url\(#([^)]+)\)"/g))
      expect(paints).toHaveLength(2)
      expect(paints.map(paint => paint[1])).toEqual([ids[index], ids[index]])
    })
  })
})
