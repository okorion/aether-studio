/* global process, console, HTMLCanvasElement, window, document */
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist']})
const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1})
const errors=[];page.on('pageerror',e=>errors.push(e.message))
await page.addInitScript(()=>{
 const contexts=[]
 const original=HTMLCanvasElement.prototype.getContext
 HTMLCanvasElement.prototype.getContext=function(...args){
  const gl=original.apply(this,args)
  if(args[0]==='webgl2'&&gl&&!contexts.some(c=>c.gl===gl)){
   const record={gl,canvas:this,resources:{program:new Set(),texture:new Set(),buffer:new Set(),framebuffer:new Set(),renderbuffer:new Set()}}
   contexts.push(record)
   this.addEventListener('webglcontextlost',()=>{for(const set of Object.values(record.resources))set.clear()})
   for(const [type,set]of Object.entries(record.resources)){
    const suffix=type[0].toUpperCase()+type.slice(1)
    const create=gl['create'+suffix].bind(gl),remove=gl['delete'+suffix].bind(gl)
    gl['create'+suffix]=(...args)=>{const result=create(...args);if(result)set.add(result);return result}
    gl['delete'+suffix]=(resource)=>{set.delete(resource);return remove(resource)}
   }
  }
  return gl
 }
 window.resourceSnapshot=()=>contexts.map(c=>({lost:c.gl.isContextLost(),connected:c.canvas.isConnected,resources:Object.fromEntries(Object.entries(c.resources).map(([k,s])=>[k,s.size]))}))
})
const cdp=await page.context().newCDPSession(page)
const records=[]
async function snapshot(label){
 await page.waitForTimeout(500)
 await cdp.send('HeapProfiler.collectGarbage')
 const heap=await cdp.send('Runtime.getHeapUsage')
 records.push({label,heap,state:await page.locator('.scene-canvas').evaluate(el=>({...el.dataset})),contexts:await page.evaluate(()=>window.resourceSnapshot())})
}
await page.goto(process.argv[2])
await page.waitForSelector('.experience.is-ready',{timeout:120000})
await snapshot('initial-normal')
for(let i=0;i<4;i++){
 const motion=i%2===0?'reduce':'no-preference'
 const previous=await page.locator('.scene-canvas').elementHandle()
 await page.emulateMedia({reducedMotion:motion})
 await page.waitForFunction(old=>!old.isConnected,previous)
 await previous.dispose()
 await page.waitForFunction(()=>document.querySelector('.scene-canvas')?.dataset.renderState==='ready',{},{timeout:120000})
 await snapshot(`rebuild-${i+1}-${motion}`)
}
// Lose a context while compilation is pending, then rebuild via OS preference.
await page.reload({waitUntil:'domcontentloaded'})
await page.waitForSelector('.scene-canvas',{timeout:120000})
const stateBeforeLoss=await page.evaluate(()=>{
 const canvas=document.querySelector('.scene-canvas')
 if(canvas.dataset.renderState==='ready')throw Error('Context loss missed preparation')
 const extension=document.querySelector('.scene-canvas').getContext('webgl2').getExtension('WEBGL_lose_context')
 window.restoreGL=()=>extension.restoreContext()
 const state={...canvas.dataset}
 extension.loseContext()
 return state
})
await page.waitForFunction(()=>document.querySelector('.experience')?.dataset.loadingState==='unavailable')
records.push({label:'lost-during-preparation',stateBeforeLoss,contexts:await page.evaluate(()=>window.resourceSnapshot())})
await page.evaluate(()=>window.restoreGL())
await page.waitForFunction(()=>document.querySelector('.scene-canvas')?.dataset.renderState==='ready',{},{timeout:120000})
await snapshot('restore-after-loss')
const previousAfterLoss=await page.locator('.scene-canvas').elementHandle()
await page.emulateMedia({reducedMotion:'reduce'})
await page.waitForFunction(old=>!old.isConnected,previousAfterLoss)
await previousAfterLoss.dispose()
await page.waitForFunction(()=>document.querySelector('.scene-canvas')?.dataset.renderState==='ready',{},{timeout:120000})
await snapshot('retry-after-loss')
await writeFile(process.argv[3]??'.qa/loading-20260928/lifecycle.json',JSON.stringify({records,errors},null,2)+'\n')
await browser.close()
if(errors.length)throw Error(JSON.stringify(errors))
console.log(JSON.stringify(records.map(r=>({label:r.label,contexts:r.contexts,heap:r.heap})),null,2))
