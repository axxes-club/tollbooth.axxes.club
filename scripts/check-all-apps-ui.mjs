import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core')
const browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})
const products=Array.from({length:35},(_,i)=>({key:`app${i}`,name:`App ${String(i).padStart(2,'0')}`,description:i===31?'Unique Needle description':'Long useful description for a suite product',tagline:'Product tagline',url:`https://app${i}.axxes.club`,color:'#888',status:'live',workspaceLaunch:true}))
try {
for(const viewport of [{width:1366,height:900},{width:390,height:844},{width:390,height:360}]) {
 const page=await browser.newPage({viewport,...(process.argv[3]?{storageState:process.argv[3]}:{})})
 await page.route('**/api/axxes/products',route=>route.fulfill({json:{products},headers:{'Access-Control-Allow-Origin':'*'}}))
 await page.goto(process.argv[2]);await page.addStyleTag({content:'nextjs-portal{display:none!important}'})
 const trigger=()=>page.locator('button[aria-label="All apps"]:visible').first()
 if(!await trigger().count()) await page.getByRole('button',{name:/^(Open menu|Menu)$/}).first().click()
 if(viewport.width>1024 && await page.getByRole('button',{name:'Collapse sidebar',exact:true}).count()) {await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await page.waitForTimeout(350)}
 await trigger().click()
 const dialog=page.getByRole('dialog',{name:'All apps',exact:true})
 await dialog.getByRole('link',{name:/App 00/}).waitFor()
 const box=await dialog.boundingBox();assert.ok(box.x>=7&&box.y>=7);assert.ok(box.x+box.width<=viewport.width-7);assert.ok(box.y+box.height<=viewport.height-7)
 const input=dialog.getByRole('textbox',{name:'Search apps'})
 await input.fill('nEeDlE');assert.equal(await dialog.getByRole('link').count(),1);assert.match(await dialog.getByRole('link').innerText(),/App 31/)
 await input.fill('');assert.equal(await dialog.getByRole('link').count(),35)
 const list=dialog.getByRole('list',{name:'Apps'})
 const dimensions=await list.evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight}));assert.ok(dimensions.scroll>dimensions.client)
 const searchBox=await input.boundingBox()
 await list.evaluate(el=>{el.scrollTop=el.scrollHeight})
 const last=await dialog.getByRole('link',{name:/App 34/}).boundingBox();const listBox=await list.boundingBox();assert.ok(last.y>=listBox.y);assert.ok(last.y+last.height<=listBox.y+listBox.height+1)
 assert.equal((await input.boundingBox()).y,searchBox.y)
 await list.evaluate(el=>{el.scrollTop=0});const first=await dialog.getByRole('link',{name:/App 00/}).boundingBox();assert.ok(first.y>=listBox.y&&first.y+first.height<=listBox.y+listBox.height)
 const href=await dialog.getByRole('link',{name:/App 00/}).getAttribute('href');assert.ok(href.startsWith('https://app0.axxes.club/'))
 await input.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await trigger().evaluate(el=>el===document.activeElement),true)
 console.log(JSON.stringify({viewport,box,searchDescription:true,scrollToFirstAndLast:true,searchFixed:true,escapeRestoresFocus:true}))
 await page.close()
}
} finally {await browser.close()}
