import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser } from '@playwright/test'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { warmupFixture } from '@/test/browser/warmupFixture'

describe('person-based relationship management', () => {
  let browser: Browser
  let server: any
  let url=''
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
  const output=path.join(root,'.superpowers/sdd/2026-09-08-coaching-catalog-management/screenshots')
  beforeAll(async()=>{
    const { createServer }=await import(pathToFileURL(path.join(root,'node_modules/.pnpm/node_modules/vite/dist/node/index.js')).href)
    const fixture=path.join(root,'src/components/coaching/__tests__/fixtures')
    server=await createServer({configFile:false,root,appType:'spa',cacheDir:path.join(root,'node_modules/.vite-relationship-management'),oxc:{jsx:{runtime:'automatic'}},resolve:{dedupe:['react','react-dom'],alias:[
      {find:'next/navigation',replacement:path.join(fixture,'relationshipManagementActions.fixture.ts')},
      {find:'next/link',replacement:path.join(fixture,'nextLink.fixture.tsx')},
      {find:'@/app/actions/coachingRelationships',replacement:path.join(fixture,'relationshipManagementActions.fixture.ts')},
      {find:'@/lib/analytics/events',replacement:path.join(fixture,'relationshipManagementActions.fixture.ts')},
      {find:'@',replacement:path.join(root,'src')},
    ]},server:{host:'127.0.0.1',port:0,hmr:false}})
    await server.listen()
    url=`http://127.0.0.1:${server.httpServer.address().port}/src/components/coaching/__tests__/fixtures/relationshipManagement.html`
    browser=await chromium.launch({headless:true});mkdirSync(output,{recursive:true})
    await warmupFixture(browser,url,'managementReady')
  },90000)
  afterAll(async()=>{await browser?.close();await server?.close()})
  it.each([390,1280])('names each person/service, protects evidence and isolates cancellation/retry at %ipx',async width=>{
    const page=await browser.newPage({viewport:{width,height:900}})
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
    try {
      await page.goto(url);await page.waitForFunction(()=>Boolean((window as any).managementReady))
      const rows=page.locator('li')
      await pwExpect(rows).toHaveCount(3)
      await pwExpect(rows.nth(0).locator('span[aria-hidden="true"]')).toHaveText('MA')
      await pwExpect(rows.nth(1).locator('span[aria-hidden="true"]')).toHaveText('MA')
      await pwExpect(rows.nth(2).locator('svg.lucide-users-round[aria-hidden="true"]')).toHaveCount(1)
      await pwExpect(rows.nth(1).getByRole('link')).toHaveCount(0)
      await pwExpect(rows.nth(2).getByRole('link')).toHaveCount(0)
      await pwExpect(rows.nth(2).getByRole('button')).toBeDisabled()
      expect(await rows.nth(0).getByRole('link',{name:'Asignar rutina'}).getAttribute('href')).toBe('/coach/programs?clientId=client-first')
      await page.keyboard.press('Tab')
      expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe('A')
      expect(await page.evaluate(()=>getComputedStyle(document.activeElement!).boxShadow)).not.toBe('none')
      await rows.nth(1).getByRole('button').click()
      await pwExpect(rows.nth(1).getByRole('group')).toContainText('María Alejandra de los Ángeles Fernández Rodríguez en Movilidad personalizada')
      await rows.nth(1).getByRole('button',{name:'Cancelar',exact:true}).click()
      expect(await page.evaluate(()=>(window as any).managementState.calls)).toEqual([])
      await rows.nth(1).getByRole('button').click()
      await rows.nth(1).getByRole('button',{name:'Confirmar finalización'}).click()
      await pwExpect(rows.nth(0).getByRole('button')).toBeEnabled()
      await pwExpect(rows.nth(1).getByRole('alert')).toContainText('No se pudo finalizar')
      const measurements=await page.locator('button,a').evaluateAll(elements=>elements.map(e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})))
      expect(measurements.every(size=>size.height>=44 && size.width>=44)).toBe(true)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await rows.nth(1).scrollIntoViewIfNeeded()
      await page.screenshot({path:path.join(output,`final-fix-management-confirmation-${width}.png`)})
      await page.evaluate(()=>{document.body.scrollTop=0;window.scrollTo(0,0)})
      await page.screenshot({path:path.join(output,`final-fix-management-${width}.png`)})
      await rows.nth(1).getByRole('button',{name:'Confirmar finalización'}).click()
      await pwExpect(rows).toHaveCount(2)
      const calls=await page.evaluate(()=>(window as any).managementState.calls)
      expect(calls.map((call:any)=>call.relationshipId)).toEqual(['relation-second','relation-second'])
      expect(calls[0].key).toBe(calls[1].key)
      const active=page.locator('dl > div').filter({hasText:'Acompañamientos activos'})
      await pwExpect(active.locator('dd')).toHaveText('1')
      await page.getByRole('button',{name:'Con atención (1)'}).click()
      await pwExpect(rows).toHaveCount(1)
      expect(errors).toEqual([])
    } finally {await page.close()}
  })
  it('keeps management visible when the protected summary is unavailable',async()=>{
    const page=await browser.newPage()
    try {await page.goto(url+'?summary-failure');await page.waitForFunction(()=>Boolean((window as any).managementReady));await pwExpect(page.locator('li')).toHaveCount(3);await pwExpect(page.getByText('No se pudo cargar el seguimiento.',{exact:false}).first()).toBeVisible();expect(await page.getByText('sesiones prescritas',{exact:false}).count()).toBe(0)}finally{await page.close()}
  })
})
