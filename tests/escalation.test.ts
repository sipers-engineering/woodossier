import {describe,it,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {evaluateEscalation,generateIcs,addDays,diffDays} from '../engine.js';
import {createLocalServer} from '../server.js';

describe('WooDossier explicit planning model',()=>{
  it('retains fixed Woo calendar arithmetic and the model exclusion without determining a legal deadline',()=>{
    const res=evaluateEscalation({
      regime:'woo',
      authority:'Ministerie van Algemene Zaken',
      topic:'Besluitvorming klimaatfonds',
      requestDate:'2026-05-01',
      extensionDays:14,
      suspensionDays:7,
      currentDate:'2026-06-25' // 28 + 14 + 7 = 49 days -> deadline is 2026-06-19
    });

    expect(res.timeline.model.baseDays).toBe(28);
    expect(res.timeline.model.extensionDays).toBe(14);
    expect(res.timeline.model.suspensionDays).toBe(7);
    expect(res.timeline.model.totalDays).toBe(49);
    expect(res.timeline.model.deadlineDate).toBe('2026-06-19');
    expect(res.timeline.model.isOverdue).toBe(true);
    expect(res.timeline.model.daysOverdue).toBe(6);

    // Art. 8.4 Woo excludes Art. 4:17 Awb dwangsom
    expect(res.statutoryPenalty.model.applicable).toBe(false);
    expect(res.statutoryPenalty.model.accruedAmount).toBe(0);
    expect(res.statutoryPenalty.model.maxStatutoryAmount).toBe(0);
    expect(res.statutoryPenalty.model.legalBasis).toContain('Art. 8.4 Woo');

    // A model date must never become a verified factual assertion in a letter.
    expect(res.timeline.deadlineDate).toBeNull();
    expect(res.statutoryPenalty.accruedAmount).toBeNull();
    expect(res.noticeStatus).toBe('review_template');
    expect(res.noticeDraft).toContain('[bevestigde ontvangstdatum invullen]');
    expect(res.noticeDraft).not.toContain('2026-06-19');

  });

  it('separates model follow-up conditions from actual appeal eligibility',()=>{
    // Not yet 14 days after ingebrekestelling
    const pending=evaluateEscalation({
      regime:'woo',
      authority:'Gemeente Amsterdam',
      topic:'Dossier grachtenherstel',
      requestDate:'2026-01-01',
      ingebrekestellingDate:'2026-02-15',
      currentDate:'2026-02-25' // 10 days after ingebrekestelling
    });
    expect(pending.timeline.model.gracePeriodExpired).toBe(false);
    expect(pending.judicialAppeal.modelConditionsMet).toBe(false);

    // Fifteen model days do not establish actual legal eligibility.
    const mature=evaluateEscalation({
      regime:'woo',
      authority:'Gemeente Amsterdam',
      topic:'Dossier grachtenherstel',
      requestDate:'2026-01-01',
      ingebrekestellingDate:'2026-02-15',
      currentDate:'2026-03-02' // 15 days after ingebrekestelling
    });
    expect(mature.timeline.model.gracePeriodExpired).toBe(true);
    expect(mature.judicialAppeal.modelConditionsMet).toBe(true);
    expect(mature.judicialAppeal.eligible).toBeNull();
    expect(mature.judicialAppeal.earliestFilingDate).toBeNull();
    expect(mature.judicialAppeal.modelEarliestFilingDate).toBe('2026-03-02');
    expect(mature.judicialAppeal.legalBasis).toContain('Art. 6:12 lid 2 Awb juncto art. 8:55d Awb');
    expect(mature.judicialAppeal.procedure).toContain('door de rechter beoordeeld');
  });

  it('preserves the illustrative sliding-scale arithmetic without reporting an actual debt',()=>{
    // Scenario 1: Grace period active (days 1-14 after ingebrekestelling) -> €0 accrued
    const grace=evaluateEscalation({
      regime:'awb_beschikking',
      authority:'Omgevingsdienst Noord-Holland',
      topic:'Omgevingsvergunning zonnepark',
      requestDate:'2026-01-01',
      ingebrekestellingDate:'2026-03-01',
      currentDate:'2026-03-10'
    });
    expect(grace.statutoryPenalty.model.applicable).toBe(true);
    expect(grace.statutoryPenalty.model.accruedAmount).toBe(0);
    expect(grace.statutoryPenalty.model.penaltyDays).toBe(0);

    // Scenario 2: Tier 1: 10 days past grace period -> 10 * €23 = €230
    const tier1=evaluateEscalation({
      regime:'awb_beschikking',
      authority:'Omgevingsdienst Noord-Holland',
      topic:'Omgevingsvergunning zonnepark',
      requestDate:'2026-01-01',
      ingebrekestellingDate:'2026-03-01', // grace period ends 2026-03-15
      currentDate:'2026-03-25' // 10 days past grace period
    });
    expect(tier1.statutoryPenalty.model.accruedAmount).toBe(230);
    expect(tier1.statutoryPenalty.model.penaltyDays).toBe(10);
    expect(tier1.statutoryPenalty.model.breakdown?.tier1.amount).toBe(230);
    expect(tier1.statutoryPenalty.model.breakdown?.tier2.amount).toBe(0);

    // Scenario 3: Tier 2: 20 days past grace period -> 14 * €23 + 6 * €35 = €322 + €210 = €532
    const tier2=evaluateEscalation({
      regime:'awb_beschikking',
      authority:'Omgevingsdienst Noord-Holland',
      topic:'Omgevingsvergunning zonnepark',
      requestDate:'2026-01-01',
      ingebrekestellingDate:'2026-03-01',
      currentDate:'2026-04-04' // 20 days past grace period
    });
    expect(tier2.statutoryPenalty.model.accruedAmount).toBe(532);
    expect(tier2.statutoryPenalty.model.breakdown?.tier1.amount).toBe(322);
    expect(tier2.statutoryPenalty.model.breakdown?.tier2.amount).toBe(210);
    expect(tier2.statutoryPenalty.model.breakdown?.tier3.amount).toBe(0);

    // Scenario 4: Tier 3: 35 days past grace period -> 14 * €23 + 14 * €35 + 7 * €45 = €322 + €490 + €315 = €1,127
    const tier3=evaluateEscalation({
      regime:'awb_beschikking',
      authority:'Omgevingsdienst Noord-Holland',
      topic:'Omgevingsvergunning zonnepark',
      requestDate:'2026-01-01',
      ingebrekestellingDate:'2026-03-01',
      currentDate:'2026-04-19' // 35 days past grace period
    });
    expect(tier3.statutoryPenalty.model.accruedAmount).toBe(1127);
    expect(tier3.statutoryPenalty.model.breakdown?.tier1.amount).toBe(322);
    expect(tier3.statutoryPenalty.model.breakdown?.tier2.amount).toBe(490);
    expect(tier3.statutoryPenalty.model.breakdown?.tier3.amount).toBe(315);

    // Scenario 5: Full 42 days reached -> statutory cap €1,442
    const capped=evaluateEscalation({
      regime:'awb_beschikking',
      authority:'Omgevingsdienst Noord-Holland',
      topic:'Omgevingsvergunning zonnepark',
      requestDate:'2026-01-01',
      ingebrekestellingDate:'2026-03-01',
      currentDate:'2026-05-15' // > 42 days past grace period
    });
    expect(capped.statutoryPenalty.model.accruedAmount).toBe(1442);
    expect(capped.statutoryPenalty.model.penaltyDays).toBe(42);
    expect(capped.statutoryPenalty.model.breakdown?.totalAccrued).toBe(1442);
    expect(capped.statutoryPenalty.model.note).toContain('maximaal 42 dagen en € 1.442');

    // The existing notice prevents a duplicate; model arithmetic is not a debt.
    expect(capped.noticeDraft).toBeNull();
    expect(capped.noticeStatus).toBe('notice_already_reported');
    expect(capped.statutoryPenalty.applicable).toBeNull();
    expect(capped.statutoryPenalty.accruedAmount).toBeNull();

  });

  it('exports iCalendar dates with the expected VCALENDAR structure', ()=>{
    const ics=generateIcs([
      {date:'2026-05-01',summary:'Indiening Woo-verzoek',description:'Onderwerp: subsidiebeleid'},
      {date:'2026-05-29',summary:'Wettelijke termijn verstreken'}
    ],'Test Kalender');

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//The Dark Store//WooDossier//NL');
    expect(ics).toContain('X-WR-CALNAME:Test Kalender');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260501');
    expect(ics).toContain('SUMMARY:Indiening Woo-verzoek');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('\r\n');
  });

  it('provides helpers addDays and diffDays with leap year and edge case safety',()=>{
    expect(addDays('2024-02-28',1)).toBe('2024-02-29');
    expect(addDays('2024-02-29',1)).toBe('2024-03-01');
    expect(diffDays('2026-03-15','2026-03-01')).toBe(14);
    expect(diffDays('2026-03-01','2026-03-15')).toBe(-14);
  });

  it('uses separately supplied receipts and marks model-only dates in exported calendars',()=>{
    const result=evaluateEscalation({regime:'awb_beschikking',authority:'Gemeente',topic:'Aanvraag',requestDate:'2026-01-01',receiptDate:'2026-01-05',ingebrekestellingDate:'2026-03-10',ingebrekestellingReceiptDate:'2026-03-13',currentDate:'2026-03-29'});
    expect(result.timeline.model.deadlineDate).toBe('2026-03-02');
    expect(result.timeline.model.gracePeriodEndDate).toBe('2026-03-27');
    expect(result.statutoryPenalty.model.accruedAmount).toBe(46);
    expect(result.statutoryPenalty.accruedAmount).toBeNull();
    expect(result.qualification.receiptDateSource).toBe('user_supplied');
    expect(result.qualification.receiptsVerified).toBe(false);
    expect(result.calendarIcs).toContain('Modeldatum');
    expect(result.calendarIcs).not.toContain('SUMMARY:Vroegste datum direct beroep');
  });

  it.each([
    {currentDate:'2026-01-20',expected:'model_deadline_not_passed'},
    {currentDate:'2026-03-01',decisionDate:'2026-02-10',expected:'decision_reported'},
    {currentDate:'2026-03-01',ingebrekestellingDate:'2026-02-10',expected:'notice_already_reported'}
  ])('withholds a new notice for $expected',({expected,...dates})=>{
    const result=evaluateEscalation({regime:'woo',authority:'Gemeente',topic:'Documenten',requestDate:'2026-01-01',...dates});
    expect(result.noticeDraft).toBeNull();
    expect(result.noticeStatus).toBe(expected);
    expect(result.timeline.isOverdue).toBeNull();
    expect(result.judicialAppeal.eligible).toBeNull();
  });

  it('does not turn a premature notice into a penalty or an appeal model',()=>{
    const result=evaluateEscalation({regime:'awb_beschikking',authority:'Gemeente',topic:'Aanvraag',requestDate:'2026-01-01',ingebrekestellingDate:'2026-01-10',currentDate:'2026-04-01'});
    expect(result.timeline.model.noticeAfterModelDeadline).toBe(false);
    expect(result.statutoryPenalty.model.accruedAmount).toBe(0);
    expect(result.judicialAppeal.modelConditionsMet).toBe(false);
    expect(result.judicialAppeal.modelEarliestFilingDate).toBeNull();
    expect(result.calendarEvents.some(event=>event.summary.includes('vervolgstap'))).toBe(false);
  });

  it('rejects impossible receipts and an unsupported Woo extension',()=>{
    const base={regime:'woo',authority:'Gemeente',topic:'Documenten',requestDate:'2026-01-05'};
    expect(()=>evaluateEscalation({...base,extensionDays:15})).toThrow();
    expect(()=>evaluateEscalation({...base,receiptDate:'2026-01-04'})).toThrow();
    expect(()=>evaluateEscalation({...base,ingebrekestellingDate:'2026-02-10',ingebrekestellingReceiptDate:'2026-02-09'})).toThrow();
    expect(()=>evaluateEscalation({...base,ingebrekestellingReceiptDate:'2026-02-10'})).toThrow();
  });
});

describe('WooDossier HTTP endpoints and MCP integration',()=>{
  it('serves GET /api/health with status ok and uptimeSec',async()=>{
    const server=await createLocalServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const addr=server.address();if(!addr||typeof addr==='string')throw Error('No port');
    const base=`http://127.0.0.1:${addr.port}`;
    try{
      const res=await fetch(`${base}/api/health`);
      expect(res.status).toBe(200);
      const data=await res.json();
      expect(data.status).toBe('ok');
      expect(data.service).toBe('woodossier');
      expect(typeof data.uptimeSec).toBe('number');
    }finally{
      await new Promise<void>(resolve=>server.close(()=>resolve()));
    }
  });

  it('serves POST /api/escalation and POST /api/calendar with valid outputs',async()=>{
    const server=await createLocalServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const addr=server.address();if(!addr||typeof addr==='string')throw Error('No port');
    const base=`http://127.0.0.1:${addr.port}`;
    try{
      const payload={
        regime:'woo' as const,
        authority:'Gemeente Rotterdam',
        topic:'Veiligheid op straat',
        requestDate:'2026-03-01',
        ingebrekestellingDate:'2026-04-01',
        currentDate:'2026-04-20'
      };

      const resEsc=await fetch(`${base}/api/escalation`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(payload)
      });
      expect(resEsc.status).toBe(200);
      const dataEsc=await resEsc.json();
      expect(dataEsc.product).toBe('WooDossier');
      expect(dataEsc.action).toBe('statutory_escalation');
      expect(dataEsc.calendarIcs).toContain('BEGIN:VCALENDAR');
      expect(dataEsc.judicialAppeal.modelConditionsMet).toBe(true);
      expect(dataEsc.judicialAppeal.eligible).toBeNull();
      expect(dataEsc.qualification.legalEntitlementDetermined).toBe(false);

      // POST /api/calendar as JSON
      const resCalJson=await fetch(`${base}/api/calendar`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(payload)
      });
      expect(resCalJson.status).toBe(200);
      const dataCal=await resCalJson.json();
      expect(dataCal.ok).toBe(true);
      expect(dataCal.ics).toContain('BEGIN:VCALENDAR');

      // POST /api/calendar with Accept: text/calendar
      const resCalText=await fetch(`${base}/api/calendar`,{
        method:'POST',
        headers:{'content-type':'application/json','accept':'text/calendar'},
        body:JSON.stringify(payload)
      });
      expect(resCalText.status).toBe(200);
      expect(resCalText.headers.get('content-type')).toContain('text/calendar');
      const text=await resCalText.text();
      expect(text).toContain('BEGIN:VCALENDAR');
    }finally{
      await new Promise<void>(resolve=>server.close(()=>resolve()));
    }
  });

  it('registers evaluate_statutory_escalation MCP tool with exact parity',async()=>{
    const server=await createLocalServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const addr=server.address();if(!addr||typeof addr==='string')throw Error('No port');
    const base=`http://127.0.0.1:${addr.port}`;
    const client=new Client({name:'woodossier-escalation-test',version:'1.0.0'});
    try{
      await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
      const tools=await client.listTools();
      expect(tools.tools.map(t=>t.name)).toContain('evaluate_statutory_escalation');
      expect(tools.tools.find(t=>t.name==='prepare_woo_request')?._meta?.['openai/outputTemplate']).toBe('ui://woodossier/review.html');
      expect(tools.tools.find(t=>t.name==='evaluate_statutory_escalation')?._meta).toBeUndefined();

      const payload={
        regime:'awb_beschikking' as const,
        authority:'Belastingdienst',
        topic:'Aanvraag kwijtschelding',
        requestDate:'2026-01-10',
        ingebrekestellingDate:'2026-03-15',
        currentDate:'2026-04-10'
      };

      const mcpRes=await client.callTool({name:'evaluate_statutory_escalation',arguments:payload});
      expect(mcpRes.isError).not.toBe(true);
      const apiRes=await fetch(`${base}/api/escalation`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(payload)
      });
      const apiData=await apiRes.json();
      expect(mcpRes.structuredContent).toEqual(apiData);
    }finally{
      await client.close();
      await new Promise<void>(resolve=>server.close(()=>resolve()));
    }
  });
});
