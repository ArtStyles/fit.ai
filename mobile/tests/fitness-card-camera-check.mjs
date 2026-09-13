import { expect } from '@playwright/test'

/** Uses the real QR scanner and a real browser MediaStream, never a module mock. */
export async function verifyFitnessCardCamera(page) {
  await page.evaluate(() => {
    const devices=navigator.mediaDevices
    const original=Object.getOwnPropertyDescriptor(devices,'getUserMedia')
    const state={mode:'allow',requests:0,stops:0,streams:[],canvases:[],video:null,release:null,restore:()=>{
      if(original) Object.defineProperty(devices,'getUserMedia',original)
      else delete devices.getUserMedia
    }}
    window.__fitnessCameraFixture=state
    const stream=()=>{
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240
      const context=canvas.getContext('2d');context.fillStyle='#222';context.fillRect(0,0,320,240)
      const result=canvas.captureStream(5)
      for(const track of result.getTracks()) {
        const stop=track.stop.bind(track)
        track.stop=()=>{state.stops++;stop()}
      }
      state.canvases.push(canvas);state.streams.push(result)
      return result
    }
    Object.defineProperty(devices,'getUserMedia',{configurable:true,value:async()=>{
      state.requests++
      if(state.mode==='deny') throw new DOMException('Fixture permission denied','NotAllowedError')
      if(state.mode==='defer') return new Promise(resolve=>{state.release=()=>{state.release=null;resolve(stream())}})
      return stream()
    }})
  })
  const dialog=page.getByRole('dialog',{name:'Escanear Fitness Card',exact:true})
  const open=()=>page.getByRole('button',{name:'Escanear QR',exact:true}).click()
  const camera=()=>dialog.getByRole('button',{name:'Usar cámara',exact:true}).click()
  const closedAndReleased=async()=>{
    await expect(dialog).not.toBeVisible()
    await expect.poll(()=>page.evaluate(()=>{
      const state=window.__fitnessCameraFixture
      return state.streams.length>0&&state.streams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))&&(!state.video||state.video.srcObject===null)
    }),{timeout:5000}).toBe(true)
  }
  try {
    await open();await camera()
    await expect.poll(()=>dialog.locator('video').evaluate(video=>{
      window.__fitnessCameraFixture.video=video
      return !!video.srcObject&&video.srcObject.getTracks().some(track=>track.readyState==='live')
    }),{timeout:8000}).toBe(true)
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).click()
    await closedAndReleased()
    expect(await page.evaluate(()=>window.__fitnessCameraFixture.stops)).toBeGreaterThan(0)

    await page.evaluate(()=>{window.__fitnessCameraFixture.mode='deny'})
    await open();await camera()
    await expect(dialog.getByRole('alert')).toContainText('No se pudo usar la cámara',{timeout:8000})
    await expect(dialog.getByText('Elegir imagen del QR',{exact:true})).toBeVisible()
    await expect(dialog.locator('input[type=file]')).toBeEnabled()
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).click()

    await page.evaluate(()=>{window.__fitnessCameraFixture.mode='defer'})
    await open();await camera()
    await expect.poll(()=>page.evaluate(()=>typeof window.__fitnessCameraFixture.release),{timeout:8000}).toBe('function')
    await dialog.locator('video').evaluate(video=>{window.__fitnessCameraFixture.video=video})
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).click()
    await expect(dialog).not.toBeVisible()
    await page.evaluate(()=>window.__fitnessCameraFixture.release())
    await closedAndReleased()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } finally {
    if(await dialog.isVisible()) await page.keyboard.press('Escape')
    await page.evaluate(()=>{
      const state=window.__fitnessCameraFixture
      state?.restore()
      state?.release?.()
      state?.streams.forEach(stream=>stream.getTracks().forEach(track=>track.stop()))
      delete window.__fitnessCameraFixture
    })
  }
}
