import {describe,it,expect} from 'vitest';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {handleRequest} from '../http.js';
import {createLocalServer} from '../server.js';

// Labeled synthetic case; never customer, filing or revenue evidence.
const fixture=()=>({product:'WooDossier',kind:'case',version:1,case:{
  id:'d5a82aad-975e-4709-a4c6-220b7c39013a',title:'TEST — pleinvergroening',
  createdAt:'2026-10-01T10:00:00.000Z',updatedAt:'2026-10-19T10:00:00.000Z',
  tracking:{status:'waiting',reference:'TEST-42',nextAction:'Ontvangstbewijs controleren',nextActionDate:'2026-10-20'},
  request:{intent:'public_documents',authority:'Gemeente Voorbeeld',topic:'TEST pleinvergroening',contact:{email:'test@example.test'}},
  events:[{type:'submission',date:'2026-10-01',note:'TEST zelf geregistreerd'},{type:'receipt',date:'2026-10-02'}],
  planning:{regime:'woo',authority:'Gemeente Voorbeeld',topic:'TEST pleinvergroening',requestDate:'2026-10-01',receiptDate:'2026-10-02',currentDate:'2026-10-19'}
}});
const post=(value:unknown)=>handleRequest(new Request('http://127.0.0.1:4320/api/dossier',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)
}),'');

describe('portable retained cases',()=>{
  it('rebuilds request, events and model from validated case inputs, never imported output',async()=>{
    const response=await post({...fixture(),outputs:{request:{letter:'UNTRUSTED LETTER'},planning:{timeline:{deadlineDate:'2026-10-30'}}}});
    expect(response.status).toBe(200);
    const dossier=await response.json();
    expect(dossier.case.tracking).toMatchObject({status:'waiting',nextActionDate:'2026-10-20'});
    expect(dossier.outputs.request.letter).toContain('TEST pleinvergroening');
    expect(dossier.outputs.request.letter).not.toContain('UNTRUSTED');
    expect(dossier.outputs.timeline.events).toHaveLength(2);
    expect(dossier.outputs.timeline.deadline).toBeNull();
    expect(dossier.outputs.planning.timeline.deadlineDate).toBeNull();
    expect(dossier.outputs.planning.timeline.model.deadlineDate).toBe('2026-10-30');
    expect(dossier.outputs.actionCalendarIcs).toContain('DTSTART;VALUE=DATE:20261020');
    expect(dossier.outputs.actionCalendarIcs).toContain('Eigen actie: Ontvangstbewijs controleren');
  });

  it('rejects unknown versions, injected fields, impossible dates and wrong dossier shape',async()=>{
    for(const value of [
      {...fixture(),version:2},
      {...fixture(),case:{...fixture().case,request:{...fixture().case.request,submit:true}}},
      {...fixture(),case:{...fixture().case,tracking:{status:'submitted',nextActionDate:'2026-02-30'}}},
      {...fixture(),case:{...fixture().case,planning:{...fixture().case.planning,receiptDate:'2026-09-30'}}},
      {...fixture(),case:{...fixture().case,tracking:{status:'government_verified'}}},
      {product:'WooDossier',status:'draft',letter:'not a reopenable case'}
    ])expect((await post(value)).status).toBe(400);
  });
});

it('retains a user-entered case, reopens all inputs and exports a portable dossier into a fresh browser',async()=>{
  const server=await createLocalServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('No port');
  const browser=await chromium.launch({headless:true});const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(`http://127.0.0.1:${address.port}/`);
    expect(await page.locator('#saveCase').count()).toBe(1);
    await page.locator('#caseTitle').fill('TEST — eigen dossier');
    await page.locator('#authority').fill('Gemeente Voorbeeld');await page.locator('#topic').fill('TEST pleinvergroening');
    await page.locator('#requestForm details').evaluate(e=>(e as HTMLDetailsElement).open=true);
    await page.locator('#name').fill('Testpersoon');await page.locator('#email').fill('test@example.test');
    await page.getByRole('button',{name:'Maak concept',exact:true}).click();
    await expect.poll(()=>page.locator('#result').textContent()).toContain('TEST pleinvergroening');
    await page.locator('.eventType').first().selectOption('submission');await page.locator('.eventDate').first().fill('2026-10-01');
    await page.locator('#addEvent').click();await page.locator('.eventDate').nth(1).fill('2026-10-02');
    await page.locator('.eventNote').nth(1).fill('TEST ontvangstbewijs');
    await page.locator('#caseReference').fill('TEST-42');await page.locator('#caseStatus').selectOption('waiting');
    await page.locator('#caseNextAction').fill('Ontvangstbewijs controleren');await page.locator('#caseNextActionDate').fill('2026-10-20');
    await page.locator('#useCaseForPlanning').click();
    expect(await page.locator('#planRequestDate').inputValue()).toBe('2026-10-01');
    expect(await page.locator('#planReceiptDate').inputValue()).toBe('2026-10-02');
    await page.locator('#planCurrentDate').fill('2026-10-19');await page.locator('#makePlanning').click();
    await expect.poll(()=>page.locator('#planningResult').textContent()).toContain('2026-10-30');
    await page.locator('#saveCase').click();
    await expect.poll(()=>page.locator('#caseMessage').textContent()).toContain('bewaard in deze browser');
    await page.reload();
    await page.locator('#savedCases').selectOption({index:1});
    await page.locator('#openCase').click();
    await expect.poll(()=>page.locator('#topic').inputValue()).toBe('TEST pleinvergroening');
    expect(await page.locator('#name').inputValue()).toBe('Testpersoon');
    expect(await page.locator('#caseStatus').inputValue()).toBe('waiting');
    expect(await page.locator('.eventNote').nth(1).inputValue()).toBe('TEST ontvangstbewijs');
    expect(await page.locator('#planningResult').textContent()).toContain('2026-10-30');
    expect(await page.locator('#caseSummary').textContent()).toContain('Door u vastgelegd');
    await page.locator('#importCaseFile').setInputFiles({name:'TEST-invalid.json',mimeType:'application/json',buffer:Buffer.from('{"product":"WooDossier","version":99}')});
    await expect.poll(()=>page.locator('#caseMessage').textContent()).toContain('Controleer uw dossier');
    expect(await page.locator('#topic').inputValue()).toBe('TEST pleinvergroening');
    const downloadEvent=page.waitForEvent('download');await page.locator('#exportCase').click();
    const download=await downloadEvent;const exported=await readFile(await download.path()!,'utf8');
    const dossier=JSON.parse(exported);expect(dossier.case.request.topic).toBe('TEST pleinvergroening');
    expect(dossier.outputs.request.letter).toContain('Testpersoon');
    expect(dossier.outputs.planning.timeline.deadlineDate).toBeNull();
    const actionDownload=page.waitForEvent('download');await page.locator('#exportCaseAction').click();
    expect(await readFile(await (await actionDownload).path()!,'utf8')).toContain('DTSTART;VALUE=DATE:20261020');
    const artifacts=process.env.WOODOSSIER_TEST_ARTIFACT_DIR??'artifacts';await mkdir(artifacts,{recursive:true});
    await page.screenshot({path:join(artifacts,'woodossier-retained-TEST-fixture.png'),fullPage:true});

    const fresh=await browser.newContext({acceptDownloads:true});const other=await fresh.newPage();
    await other.goto(`http://127.0.0.1:${address.port}/`);
    await other.locator('#importCaseFile').setInputFiles({name:'TEST-woodossier.json',mimeType:'application/json',buffer:Buffer.from(exported)});
    await expect.poll(()=>other.locator('#caseMessage').textContent()).toContain('geïmporteerd');
    expect(await other.locator('#topic').inputValue()).toBe('TEST pleinvergroening');
    expect(await other.locator('#planReceiptDate').inputValue()).toBe('2026-10-02');
    await other.locator('#saveCase').click();await expect.poll(()=>other.locator('#caseMessage').textContent()).toContain('bewaard in deze browser');
    await other.locator('#topic').fill('TEST gewijzigd onderwerp');
    expect(await other.locator('#result').isVisible()).toBe(false);
    await other.locator('#saveCase').click();await expect.poll(()=>other.locator('#caseMessage').textContent()).toContain('bewaard in deze browser');
    expect(await other.locator('#result').textContent()).toContain('TEST gewijzigd onderwerp');
    await other.reload();await other.locator('#savedCases').selectOption({index:1});await other.locator('#openCase').click();
    await expect.poll(()=>other.locator('#topic').inputValue()).toBe('TEST gewijzigd onderwerp');
    await other.locator('#newCase').click();expect(await other.locator('#topic').inputValue()).toBe('');
    expect(await other.locator('.eventDate').first().inputValue()).toBe('');
    expect(await other.locator('#planReceiptDate').inputValue()).toBe('');
    expect(await other.locator('#caseStatus').inputValue()).toBe('draft');
    expect(errors).toEqual([]);
    await fresh.close();
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},45000);

it('preserves separate model contact details across import, editing and portable export',async()=>{
  const server=await createLocalServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('No port');
  const browser=await chromium.launch({headless:true});const page=await browser.newPage({acceptDownloads:true});
  try{
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const doc=fixture();Object.assign(doc.case.planning,{contact:{name:'TEST modelcontact',email:'model@example.test',postalAddress:'TEST modeladres',phone:'TEST telefoon'}});
    await page.locator('#importCaseFile').setInputFiles({name:'TEST-model-contact.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
    await expect.poll(()=>page.locator('#caseMessage').textContent()).toContain('geïmporteerd');
    expect(await page.locator('#planName').count()).toBe(1);
    expect(await page.locator('#planName').inputValue()).toBe('TEST modelcontact');
    expect(await page.locator('#email').inputValue()).toBe('test@example.test');
    await page.locator('#planningContactFields').evaluate(e=>(e as HTMLDetailsElement).open=true);
    await page.locator('#planEmail').fill('gewijzigd-model@example.test');
    await page.locator('#saveCase').click();await expect.poll(()=>page.locator('#caseMessage').textContent()).toContain('bewaard in deze browser');
    const downloadEvent=page.waitForEvent('download');await page.locator('#exportCase').click();
    const saved=JSON.parse(await readFile(await (await downloadEvent).path()!,'utf8'));
    expect(saved.case.request.contact.email).toBe('test@example.test');
    expect(saved.case.planning.contact).toEqual({name:'TEST modelcontact',email:'gewijzigd-model@example.test',postalAddress:'TEST modeladres',phone:'TEST telefoon'});
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);
