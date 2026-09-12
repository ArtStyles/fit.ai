import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

// Run against the compiled Android web entry with the fixture backend configured.
// MOBILE_PREVIEW_URL=http://127.0.0.1:4178 node mobile/tests/fitness-card-regression.mjs
// Build env: VITE_SUPABASE_URL=https://fitness-fixture.supabase.co
//            VITE_SUPABASE_ANON_KEY=fakepublictesttoken
const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const backend = process.env.FITNESS_FIXTURE_BACKEND || 'https://fitness-fixture.supabase.co'
const artifacts = '.artifacts/fitness-card'
const now = new Date('2026-09-12T16:00:00Z')
const id = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const companion = { userId:id(2),name:'Marina Pérez',username:'marina_fit',avatarUrl:null }
const passed = [], failures = [], unexpected = []
const longName = 'Astra Entrena Sin Límites Hasta El Último Segundo'
const evidence = () => ({ records:[{exerciseId:id(10),name:'Press de banca',kind:'strength',weightKg:60,reps:8,seconds:null,date:'2026-09-11'}], muscles:[{id:'chest',sessions:1}], totalSessions:1, partialSessions:0, rangeFrom:'2026-06-21',rangeTo:'2026-09-12',updatedAt:now.toISOString() })
const makeCard = owner => ({ owner,artisticName:'',theme:'violet',revision:1,photos:[],evidence:evidence(),updatedAt:now.toISOString() })

function authSession(state) {
  const user={id:state.accountId,aud:'authenticated',role:'authenticated',email:state.email,email_confirmed_at:now.toISOString(),created_at:now.toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[]}
  const expiresAt=Math.floor(now.getTime()/1000)+3600
  const encode=value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,aud:'authenticated',role:'authenticated',exp:expiresAt,iat:expiresAt-3600})}.fixture-signature`,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:expiresAt,user}
}

async function account(linked,language) {
  const state=await newTestAccount({linked})
  Object.assign(state.tables.profiles[0],{full_name:'Alex Rivera',username:'alex_rivera',onboarding_done:true,readiness_status:'cleared',timezone:'UTC',language,last_check_in_at:now.toISOString()})
  state.tables.exercises=[{...state.tables.exercises[0],id:id(10),name:'Bench press',name_es:'Press de banca',muscle_groups:['chest'],muscle_groups_es:['pecho']}]
  state.tables.progress_logs=[{id:id(11),user_id:state.accountId,workout_id:null,completed_at:'2026-09-11T16:00:00Z',duration_minutes:30}]
  state.tables.exercise_logs=[{id:id(12),progress_log_id:id(11),exercise_id:id(10),sets_completed:1,weights_kg:[60],reps_completed:[8],rpe_values:[],duration_seconds:null}]
  state.tables.workout_plans=[]; state.tables.workouts=[]; state.tables.workout_exercises=[]
  state.remoteRevision=id(500); state.lastSyncedRevision=state.revision
  return state
}

await mkdir(artifacts,{recursive:true})
const browser=await chromium.launch({headless:true})

async function scenario(name,width,{linked=true,language='es'}={}) {
  const state=await account(linked,language)
  const owner={userId:state.accountId,name:'Alex Rivera',username:'alex_rivera',avatarUrl:null}
  const model={state,owner,session:authSession(state),own:null,other:makeCard(companion),access:[],allowOther:false,uploads:[],blobs:new Map(),requests:[],saveDelay:0}
  const hub=() => ({viewerId:owner.userId,own:model.own,received:model.allowOther ? [model.other] : [],access:model.access})
  const context=await browser.newContext({viewport:{width,height:width===1440?1000:900},reducedMotion:'reduce',isMobile:width<600,hasTouch:width<600})
  await context.addInitScript(linked => {
    window.fixtureOnline=linked
    Object.defineProperty(navigator,'onLine',{get:() => window.fixtureOnline})
  },linked)
  await context.route('**/*',async route => {
    const request=route.request(),url=new URL(request.url())
    if (url.origin===origin && url.pathname==='/__fitness-fixture-seed') return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fitness fixture setup</title>'})
    if (url.origin===origin) return route.continue()
    if (url.origin!==backend) { unexpected.push({name,url:request.url(),reason:'External request blocked'}); return route.abort() }
    const headers={'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-expose-headers':'content-range'}
    const reply=(body,status=200,extra={}) => route.fulfill({status,contentType:'application/json',headers:{...headers,...extra},body:JSON.stringify(body)})
    if(request.method()==='OPTIONS') return reply(null)
    const args=request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : null
    model.requests.push({path:url.pathname,method:request.method(),args})
    if(url.pathname==='/auth/v1/user') return reply(model.session.user)
    if(url.pathname==='/auth/v1/token') return reply(model.session)
    if(url.pathname.startsWith('/storage/v1/object/')) {
      if(request.method()==='GET') {
        const key=url.pathname.split('fitness-card-photos/')[1]
        const blob=model.blobs.get(key)
        if(!blob || (!key.startsWith(`${owner.userId}/`) && !model.allowOther)) return reply({message:'not allowed'},403)
        return route.fulfill({status:200,contentType:'image/webp',headers,body:blob})
      }
      if(request.method()==='DELETE') {
        for(const key of args?.prefixes ?? []) { model.blobs.delete(key); model.own.photos=model.own.photos.filter(photo => photo.path!==key) }
        model.own.revision++; return reply([])
      }
      if(['POST','PUT'].includes(request.method())) {
        const key=url.pathname.split('fitness-card-photos/')[1]
        assert.match(key,new RegExp(`^${owner.userId}/[123]\\.webp$`))
        const body=request.postDataBuffer(),start=body.indexOf(Buffer.from('RIFF'))
        assert.ok(start>=0,'Browser upload contains WebP RIFF bytes')
        const webp=body.subarray(start,start+8+body.readUInt32LE(start+4))
        assert.equal(webp.subarray(8,12).toString(),'WEBP')
        assert.ok(webp.length<=2*1024*1024,'Processed image respects storage size')
        assert.ok(request.headers()['content-type']?.includes('image/webp') || body.includes(Buffer.from('image/webp')),'Outgoing upload declares image/webp')
        model.blobs.set(key,webp); model.uploads.push({key,bytes:webp.length})
        const slot=Number(key.split('/')[1][0]); model.own.photos=model.own.photos.filter(photo => photo.slot!==slot).concat({slot,path:key}); model.own.revision++
        return reply({Key:`fitness-card-photos/${key}`})
      }
    }
    const rpc=url.pathname.split('/rest/v1/rpc/')[1]
    if(rpc) {
      if(rpc==='get_fitness_card_state') return reply(hub())
      if(rpc==='get_fitness_card') return args.p_owner_id===owner.userId ? reply(model.own) : model.allowOther ? reply(model.other) : reply({message:'FITNESS_CARD_NOT_ALLOWED'},403)
      if(rpc==='save_fitness_card') {
        if(model.saveDelay) await new Promise(resolve=>setTimeout(resolve,model.saveDelay))
        if(model.own && args.p_expected_revision!==model.own.revision) return reply({message:'FITNESS_CARD_CONFLICT'},409)
        model.own={...(model.own??makeCard(owner)),artisticName:args.p_artistic_name,theme:args.p_theme,revision:(model.own?.revision??0)+1}; return reply(model.own)
      }
      if(rpc==='publish_fitness_card_evidence') {
        if(args.p_expected_revision!==model.own?.revision) return reply({message:'FITNESS_CARD_CONFLICT'},409)
        model.own.evidence=args.p_evidence; model.own.revision++; return reply(model.own)
      }
      if(rpc==='fitness_card_access') {
        const action=args.p_action
        if(action==='share' || action==='request') {
          assert.equal(args.p_handle,'marina_fit')
          model.access.push({id:id(action==='share'?31:32),owner:action==='share'?owner:companion,viewer:action==='share'?companion:owner,status:action==='share'?'accepted':'pending',updatedAt:now.toISOString()})
        } else {
          const access=model.access.find(item=>item.id===args.p_request_id); assert.ok(access,'Action carries exact access ID')
          access.status=action==='accept'?'accepted':action==='reject'?'rejected':'revoked'
          if(access.owner.userId===companion.userId) model.allowOther=access.status==='accepted'
        }
        return reply(hub())
      }
      if(rpc==='original_app_snapshot_read_v1') return reply({revision:id(500),payload:state})
      if(rpc==='original_app_snapshot_write_v1') return reply({revision:id(500)})
      if(rpc==='get_companion_state') return reply({viewerId:owner.userId,status:'none',relationship:null,self:{completedSessions:0,goal:3,weekStart:'2026-09-07',weekEnd:'2026-09-13',timeZone:'UTC',updatedAt:now.toISOString()},partner:null,greeting:null,nextGreetingAt:null,fetchedAt:now.toISOString()})
      unexpected.push({name,rpc,args}); return reply({message:'Unconfigured fixture RPC'},418)
    }
    if(url.pathname.startsWith('/rest/v1/') && ['GET','HEAD'].includes(request.method())) {
      const table=url.pathname.slice('/rest/v1/'.length)
      let rows=state.tables[table]??[]
      for(const field of ['id','user_id','progress_log_id','exercise_id']) { const filter=url.searchParams.get(field); if(filter?.startsWith('eq.')) rows=rows.filter(row=>String(row[field])===filter.slice(3)); if(filter?.startsWith('in.(')) rows=rows.filter(row=>filter.slice(4,-1).split(',').includes(String(row[field]))) }
      return reply(request.method()==='HEAD'?null:request.headers().accept?.includes('vnd.pgrst.object')?(rows[0]??null):rows,200,{'content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`})
    }
    unexpected.push({name,path:url.pathname}); return reply({message:'Unconfigured fixture request'},418)
  })
  const page=await context.newPage(); page.setDefaultTimeout(15000)
  page.on('pageerror',error=>failures.push({name,error:error.message}))
  await page.clock.setFixedTime(now)
  await page.goto(`${origin}/__fitness-fixture-seed`)
  await installAccountFixture(page,state)
  if(linked) await page.evaluate(session=>localStorage.setItem('vekira-original-auth',JSON.stringify(session)),model.session)
  await page.goto(`${origin}/fitness-card`)
  return {page,context,model}
}

async function capture(page,name) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),`${name}: document horizontal overflow`)
  const overflowing=await page.getByRole('dialog').evaluateAll(nodes=>nodes.some(node=>node.scrollWidth-node.clientWidth>1))
  assert.equal(overflowing,false,`${name}: dialog horizontal overflow`)
  await page.screenshot({path:`${artifacts}/${name}.png`,fullPage:true})
}
async function captureCover(scope,name) {
  const cover=scope.locator('[data-fitness-card-cover]')
  await expect(cover).toHaveCount(1)
  await expect(cover).toBeVisible()
  await cover.screenshot({path:`${artifacts}/${name}.png`})
}
async function accentByKeyboard(page,editor,current,next,key) {
  const accent=editor.getByLabel('Color de acento',{exact:true})
  await accent.focus(); await page.keyboard.press('Space')
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('option',{name:current,exact:true})).toBeFocused()
  await page.keyboard.press(key)
  await expect(page.getByRole('option',{name:next,exact:true})).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(accent).toContainText(next)
}
const refresh=page=>page.getByRole('button',{name:'Actualizar tarjetas',exact:true}).click()
const online=(page,value)=>page.evaluate(value=>{window.fixtureOnline=value;window.dispatchEvent(new Event(value?'online':'offline'))},value)

try {
  for(const width of [320,390,1440]) {
    const {page,context,model}=await scenario(`owner-${width}`,width)
    try {
      await expect(page.getByRole('tab',{name:'Mi tarjeta',exact:true})).toBeVisible()
      await page.getByRole('button',{name:'Crear mi Fitness Card',exact:true}).click()
      await expect(page.getByRole('button',{name:'Editar tarjeta',exact:true})).toBeVisible()
      assert.equal(model.own.owner.avatarUrl,null,'Cover fixture exercises the no-avatar fallback')
      await captureCover(page.locator('[data-fitness-card-hub]'),`cover-normal-no-avatar-${width}`)
      await page.getByRole('tab',{name:'Mapa',exact:true}).click()
      const chest=page.getByRole('button',{name:'Pecho: 1 sesiones',exact:true})
      await expect(chest).toBeVisible(); await chest.click(); await expect(chest).toHaveAttribute('aria-pressed','true')
      await capture(page,`owner-map-${width}`)
      await page.getByRole('tab',{name:'Marcas',exact:true}).click()
      await expect(page.getByText('Press de banca',{exact:true})).toBeVisible()
      await page.getByRole('button',{name:'Editar tarjeta',exact:true}).click()
      const editor=page.getByRole('dialog',{name:'Hazla tuya.',exact:true})
      await captureCover(editor,`editor-violet-normal-no-avatar-${width}`)
      await editor.getByLabel('Nombre artístico (opcional)',{exact:true}).fill(longName)
      await captureCover(editor,`editor-violet-long-${width}`)
      await accentByKeyboard(page,editor,'Violet · Violeta','Ember · Cobre','ArrowDown')
      await captureCover(editor,`editor-ember-long-${width}`)
      await editor.getByLabel('Nombre artístico (opcional)',{exact:true}).fill('Astra')
      await captureCover(editor,`editor-ember-normal-${width}`)
      await accentByKeyboard(page,editor,'Ember · Cobre','Ice · Cian','ArrowDown')
      await captureCover(editor,`editor-ice-normal-${width}`)
      await editor.getByLabel('Nombre artístico (opcional)',{exact:true}).fill(longName)
      await captureCover(editor,`editor-ice-long-${width}`)
      await accentByKeyboard(page,editor,'Ice · Cian','Ember · Cobre','ArrowUp')
      await capture(page,`editor-${width}`)
      await editor.getByRole('button',{name:'Guardar estilo',exact:true}).click()
      await expect(editor).not.toBeVisible(); assert.equal(model.own.artisticName,longName); assert.equal(model.own.theme,'ember')
      await expect(page.getByText(longName,{exact:true})).toBeVisible()
      await captureCover(page.locator('[data-fitness-card-hub]'),`cover-long-${width}`)
      await capture(page,`owner-cover-${width}`)
      if(width===390) {
        await page.getByRole('button',{name:'Editar tarjeta',exact:true}).click()
        const png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#8b5cf6';ctx.fillRect(0,0,32,32);ctx.fillStyle='#fbbf24';ctx.fillRect(8,8,16,16);return canvas.toDataURL('image/png').split(',')[1]}),'base64')
        for(const slot of [1,2,3,1]) {
          const before=model.uploads.length
          await editor.locator('input[type=file]').nth(slot-1).setInputFiles({name:`photo-${slot}.png`,mimeType:'image/png',buffer:png})
          await expect(editor.getByText(`Vista previa de la foto ${slot}. Confirma para guardarla.`,{exact:true})).toBeVisible()
          await editor.getByRole('button',{name:'Subir foto',exact:true}).click()
          await expect.poll(()=>model.uploads.length).toBe(before+1)
          await expect(editor.getByRole('button',{name:'Subir foto',exact:true})).not.toBeVisible()
        }
        assert.equal(model.own.photos.length,3)
        await capture(page,'editor-three-photos')
        await editor.getByRole('button',{name:'Eliminar',exact:true}).nth(1).click()
        await expect.poll(()=>model.own.photos.map(photo=>photo.slot).sort()).toEqual([1,3])
        await editor.getByLabel('Nombre artístico (opcional)',{exact:true}).fill('Astra')
        model.saveDelay=700
        await editor.getByRole('button',{name:'Guardar estilo',exact:true}).click()
        await page.keyboard.press('Escape'); await expect(editor).toBeVisible()
        await expect(editor).not.toBeVisible(); model.saveDelay=0
        await page.getByRole('button',{name:'Editar tarjeta',exact:true}).click()
        const editingRevision=model.own.revision
        await editor.getByLabel('Nombre artístico (opcional)',{exact:true}).fill('Mi cambio local pendiente')
        const hubReads=model.requests.filter(request=>request.path.endsWith('/get_fitness_card_state')).length
        model.own={...model.own,artisticName:'Cambio remoto conservado',theme:'ice',revision:model.own.revision+1}
        await expect.poll(()=>model.requests.filter(request=>request.path.endsWith('/get_fitness_card_state')).length,{timeout:20000}).toBeGreaterThan(hubReads)
        await expect(editor.getByLabel('Nombre artístico (opcional)',{exact:true})).toHaveValue('Mi cambio local pendiente')
        // A photo changes the revision but must not authorize overwriting a
        // concurrently changed style. Earlier photo-only uploads allow saving.
        const beforeConflictUpload=model.uploads.length
        await editor.locator('input[type=file]').nth(0).setInputFiles({name:'after-remote-edit.png',mimeType:'image/png',buffer:png})
        await editor.getByRole('button',{name:'Subir foto',exact:true}).click()
        await expect.poll(()=>model.uploads.length).toBe(beforeConflictUpload+1)
        await expect(editor.getByRole('button',{name:'Subir foto',exact:true})).not.toBeVisible()
        await editor.getByRole('button',{name:'Guardar estilo',exact:true}).click()
        await expect(editor.getByRole('alert')).toBeVisible()
        await expect(editor).toBeVisible()
        assert.equal(model.own.artisticName,'Cambio remoto conservado','Concurrent remote style was preserved')
        assert.equal(model.requests.filter(request=>request.path.endsWith('/save_fitness_card')).at(-1).args.p_expected_revision,editingRevision,'Draft saves against its opening revision after a conflicting remote style update')
        await capture(page,'editor-concurrent-style-conflict')
        await page.keyboard.press('Escape')
        await page.getByRole('tab',{name:'Fotos',exact:true}).click()
        await page.getByRole('button',{name:'Ampliar foto 1',exact:true}).click()
        await expect(page.getByRole('dialog',{name:'Foto 1',exact:true})).toBeVisible()
        await page.keyboard.press('Escape')
        await page.getByRole('tab',{name:'Accesos',exact:true}).click()
        await page.getByLabel('@usuario de tu compañero',{exact:true}).fill('@marina_fit')
        await page.getByRole('button',{name:'Compartir la mía',exact:true}).click()
        await expect(page.getByRole('button',{name:'Retirar acceso',exact:true})).toBeVisible()
        await page.getByRole('button',{name:'Retirar acceso',exact:true}).click()
        await expect(page.getByRole('button',{name:'Retirar acceso',exact:true})).not.toBeVisible()
        model.access=[{id:id(40),owner:model.owner,viewer:companion,status:'pending',updatedAt:now.toISOString()}]
        await refresh(page); await page.getByRole('button',{name:'Aceptar',exact:true}).click()
        await expect.poll(()=>model.access[0].status).toBe('accepted')
        await capture(page,'accepted-access')
        await page.getByRole('button',{name:'Retirar acceso',exact:true}).click()
        await page.getByLabel('@usuario de tu compañero',{exact:true}).fill('@marina_fit')
        await page.getByRole('button',{name:'Solicitar la suya',exact:true}).click()
        await expect(page.getByRole('button',{name:'Cancelar solicitud',exact:true})).toBeVisible()
        model.allowOther=true
        model.access.find(item=>item.owner.userId===companion.userId).status='accepted'
        await refresh(page)
        await page.getByRole('tab',{name:'Colección',exact:true}).click()
        await page.getByRole('button',{name:'Abrir tarjeta de Marina Pérez',exact:true}).click()
        const viewer=page.getByRole('dialog',{name:'Fitness Card',exact:true})
        await expect(viewer.getByText('Marina Pérez',{exact:true})).toBeVisible()
        await capture(page,'received-card')
        model.other={...model.other,artisticName:'Marina en movimiento',theme:'ice',revision:model.other.revision+1}
        await expect(viewer.getByText('Marina en movimiento',{exact:true})).toBeVisible({timeout:20000})
        await capture(page,'received-card-updated')
        await online(page,false)
        await expect(viewer.getByText('Marina Pérez',{exact:true})).not.toBeVisible({timeout:1500})
        await page.keyboard.press('Escape')
        await online(page,true); await refresh(page)
        await page.getByRole('tab',{name:'Colección',exact:true}).click()
        await page.getByRole('button',{name:'Abrir tarjeta de Marina Pérez',exact:true}).click()
        await expect(viewer.getByText('Marina Pérez',{exact:true})).toBeVisible()
        model.allowOther=false
        model.access.find(item=>item.owner.userId===companion.userId).status='revoked'
        await expect(viewer.getByText('Marina Pérez',{exact:true})).not.toBeVisible({timeout:20000})
        const saved=await storedAccountSnapshot(page)
        assert.ok(!JSON.stringify(saved).includes('Marina Pérez'),'Received card was not persisted into account SQLite')
      }
      passed.push({name:`owner-${width}`,passed:true})
    } catch(error) { await capture(page,`failure-${width}`).catch(()=>{}); throw error } finally { await context.close() }
  }
  const {page,context}=await scenario('english-offline',390,{linked:false,language:'en'})
  try {
    await expect(page.getByRole('tab',{name:'Records',exact:true})).toBeVisible()
    await page.getByRole('tab',{name:'Map',exact:true}).click()
    await expect(page.getByRole('button',{name:'Chest: 1 sessions',exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'Edit card',exact:true})).toHaveCount(0)
    await capture(page,'english-offline'); passed.push({name:'english-offline',passed:true})
  } finally { await context.close() }
  assert.deepEqual(failures,[],'No browser runtime errors')
  assert.deepEqual(unexpected,[],'All remote traffic is explicitly mocked')
  console.log(JSON.stringify({passed,failures,unexpected},null,2))
} finally {
  await writeFile(`${artifacts}/results.json`,JSON.stringify({passed,failures,unexpected},null,2))
  await browser.close()
}
