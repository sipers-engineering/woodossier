import {it,expect} from 'vitest';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createLocalServer} from '../server.js';
import {prepare} from '../engine.js';

it('renders a real editable form, exports the reviewed draft, and invalidates stale output',async()=>{
  const server=await createLocalServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const a=server.address();if(!a||typeof a==='string')throw Error('No port');
  const browser=await chromium.launch({headless:true});const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(`http://127.0.0.1:${a.port}/`);
    await page.locator('#authority').fill('Gemeente Voorbeeld');await page.locator('#topic').fill('pleinvergroening');
    await page.locator('#docs').fill('besluiten\nmemo’s');await page.locator('#dateFrom').fill('2024-01-01');
    await page.getByRole('button',{name:'Maak concept'}).click();
    await expect.poll(()=>page.locator('#result').textContent()).toContain('pleinvergroening');
    const txtEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Exporteer brief (.txt)'}).click();
    const txt=await txtEvent;expect(await readFile(await txt.path()!,'utf8')).toContain('vanaf 2024-01-01');
    const jsonEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Exporteer volledig dossier (.json)'}).click();
    const file=await jsonEvent;const dossier=JSON.parse(await readFile(await file.path()!,'utf8'));
    expect(dossier.case.request).toMatchObject({authority:'Gemeente Voorbeeld',topic:'pleinvergroening',dateFrom:'2024-01-01'});
    expect(dossier.outputs.request.authorityStatus).toContain('niet geverifieerd');
    const artifacts=process.env.WOODOSSIER_TEST_ARTIFACT_DIR??'artifacts';
    await mkdir(artifacts,{recursive:true});await page.screenshot({path:join(artifacts,'woodossier-standalone.png'),fullPage:true});
    await page.locator('#topic').fill('ander onderwerp');expect(await page.locator('#result').isVisible()).toBe(false);
    await page.locator('#intent').selectOption('personal_data');await page.getByRole('button',{name:'Maak concept'}).click();
    await expect.poll(()=>page.locator('#result').textContent()).toContain('Vraag inzage in uw eigen persoonsgegevens');
    expect(await page.locator('.letter').count()).toBe(0);
    await page.locator('.eventDate').fill('2026-10-01');await page.getByRole('button',{name:'Voeg gebeurtenis toe'}).click();
    await page.locator('.eventType').nth(1).selectOption('suspension');await page.locator('.eventDate').nth(1).fill('2026-10-05');
    await page.getByRole('button',{name:'Maak tijdlijn'}).click();
    await expect.poll(()=>page.locator('#timelineResult').textContent()).toContain('opschorting opgegeven');
    expect(await page.locator('#timelineResult').textContent()).toContain('Geen definitieve wettelijke einddatum');
    expect(errors).toEqual([]);
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);

it('asks a simulated MCP host to export an inline reviewed letter',async()=>{
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  try{
    await page.setContent('<iframe id="app"></iframe>');
    await page.evaluate(()=>{
      (window as any).requests=[];
      window.addEventListener('message',event=>{
        if(event.source!==(document.querySelector('#app') as HTMLIFrameElement).contentWindow)return;
        const m=event.data;if(m?.method==='ui/initialize')event.source?.postMessage({jsonrpc:'2.0',id:m.id,result:{hostCapabilities:{downloadFile:{},openLinks:{}}}},'*');
        if(m?.method==='ui/download-file'){(window as any).requests.push(m);event.source?.postMessage({jsonrpc:'2.0',id:m.id,result:{}},'*');}
      });
    });
    const html=await readFile('widget.html','utf8');await page.frames()[1].setContent(html);
    const result=prepare({intent:'public_documents',authority:'Gemeente Test',topic:'fietsbeleid'});
    await page.evaluate(value=>(document.querySelector('#app') as HTMLIFrameElement).contentWindow?.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:value}},'*'),result);
    const frame=page.frameLocator('#app');await expect.poll(()=>frame.locator('#result').textContent()).toContain('fietsbeleid');
    await frame.getByRole('button',{name:'Exporteer brief (.txt)'}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).requests.length)).toBe(1);
    const request=await page.evaluate(()=>(window as any).requests[0]);
    expect(request.params.contents[0]).toMatchObject({type:'resource',resource:{uri:'file:///woodossier-verzoek.txt',mimeType:'text/plain'}});
    expect(request.params.contents[0].resource.text).toContain('fietsbeleid');
  }finally{await browser.close()}
},30000);
