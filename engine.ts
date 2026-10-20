import {prepareInput,timelineInput,escalationInput,type PrepareInput,type EscalationInput} from './schema.js';

const checked='2026-10-16';
export const sources=[
  {title:'Rijksoverheid · Woo-verzoek indienen',url:'https://www.rijksoverheid.nl/vraag-en-antwoord/wet-open-overheid-woo/hoe-dien-ik-een-woo-verzoek-in',checked},
  {title:'Officiële Woo-index',url:'https://organisaties.overheid.nl/woo',checked},
  {title:'Rijksoverheid · Na een Woo-verzoek',url:'https://www.rijksoverheid.nl/vraag-en-antwoord/wet-open-overheid-woo/wat-gebeurt-er-nadat-ik-een-woo-verzoek-heb-ingediend',checked},
  {title:'Autoriteit Persoonsgegevens · Recht op inzage',url:'https://autoriteitpersoonsgegevens.nl/nl/zelf-doen/privacyrechten/recht-op-inzage',checked},
  {title:'Rijksoverheid · Bezwaar tegen overheidsbesluit',url:'https://www.rijksoverheid.nl/vraag-en-antwoord/bezwaar-en-beroep/bezwaar-tegen-beslissing-overheid',checked},
  {title:'Wet open overheid · Art. 4.4 & 8.4 (geen Awb-dwangsom)',url:'https://wetten.overheid.nl/BWBR0045754',checked},
  {title:'Algemene wet bestuursrecht · Art. 4:17 (bestuurlijke dwangsom)',url:'https://wetten.overheid.nl/BWBR0005537/Afdeling4.1.3',checked},
  {title:'Algemene wet bestuursrecht · Art. 6:12 & 8:55d (beroep niet tijdig beslissen)',url:'https://wetten.overheid.nl/BWBR0005537',checked},
  {title:'Rijksoverheid · Te late beslissing en afwijkende termijnen',url:'https://www.rijksoverheid.nl/themas/overheid-en-democratie/bezwaar-en-beroep/vraag-en-antwoord/bezwaar-en-beroep/beslissing-aanvraag-bezwaar-te-laat',checked:'2026-10-17'},
  {title:'Rijksoverheid · Woo-instructie, versie 2024',url:'https://www.rijksoverheid.nl/site/binaries/site-content/collections/documents/2022/04/01/rijksbrede-instructie-voor-het-behandelen-van-woo-verzoeken/woo-instructie.pdf',checked:'2026-10-17'}
] as const;
const lines=(items:string[])=>items.map(v=>`- ${v}`).join('\n');

export function addDays(isoDate:string,days:number):string{
  const [y,m,d]=isoDate.split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1,d+days));
  return dt.toISOString().slice(0,10);
}

export function diffDays(dateA:string,dateB:string):number{
  const [y1,m1,d1]=dateA.split('-').map(Number);
  const [y2,m2,d2]=dateB.split('-').map(Number);
  const utcA=Date.UTC(y1,m1-1,d1);
  const utcB=Date.UTC(y2,m2-1,d2);
  return Math.round((utcA-utcB)/(24*60*60*1000));
}

function escapeIcsText(str:string):string{
  return str.replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
}

function hashString(str:string):number{
  let h=0;
  for(let i=0;i<str.length;i++)h=(Math.imul(31,h)+str.charCodeAt(i))|0;
  return Math.abs(h);
}

export function generateIcs(events:Array<{date:string;summary:string;description?:string}>,calendarTitle='WooDossier Termijnen'):string{
  const dtstamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
  const calendarLines=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Dark Store//WooDossier//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarTitle)}`
  ];
  for(let i=0;i<events.length;i++){
    const ev=events[i];
    const dateFormatted=ev.date.replace(/-/g,'');
    const nextDayFormatted=addDays(ev.date,1).replace(/-/g,'');
    const uid=`woodossier-${ev.date}-${i}-${hashString(ev.summary)}@woodossier.local`;
    calendarLines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dateFormatted}`,
      `DTEND;VALUE=DATE:${nextDayFormatted}`,
      `SUMMARY:${escapeIcsText(ev.summary)}`,
      ev.description?`DESCRIPTION:${escapeIcsText(ev.description)}`:'DESCRIPTION:',
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
  }
  calendarLines.push('END:VCALENDAR');
  return calendarLines.join('\r\n')+'\r\n';
}

export function prepare(raw:unknown){
  const input=prepareInput.parse(raw);
  if(input.intent!=='public_documents'){
    const alternative=input.intent==='personal_data'
      ? {title:'Vraag inzage in uw eigen persoonsgegevens',description:'Informatie die via de Woo openbaar wordt gemaakt, is in beginsel voor iedereen toegankelijk. Voor inzage in uw eigen persoonsgegevens gebruikt u het inzagerecht bij de organisatie die uw gegevens verwerkt.',source:sources[3]}
      : input.intent==='appeal'
      ? {title:'Gebruik de bezwaar- of beroepsroute',description:'Wilt u een besluit aanvechten, volg dan de rechtsmiddelen en aanwijzingen bij dat besluit. Controleer de geldende termijn en het juiste kanaal bij de beslissende organisatie.',source:sources[4]}
      : {title:'Gebruik de klachtenprocedure',description:'Gaat het om behandeling of gedrag van een organisatie, controleer dan haar officiële klachtenkanaal. Dit is geen Woo-verzoek.',source:sources[0]};
    return {product:'WooDossier',status:'alternative_route',intent:input.intent,input,alternative,letter:null,checklist:['Controleer de officiële route en het juiste kanaal bij de betrokken organisatie.','Verstuur geen BSN, identiteitskopie of DigiD-gegevens via deze app.'],sources};
  }
  const authority=input.authority!; const topic=input.topic!; const docs=input.documentTypes??[];
  const period=input.dateFrom&&input.dateTo?`van ${input.dateFrom} tot en met ${input.dateTo}`:input.dateFrom?`vanaf ${input.dateFrom}`:input.dateTo?`tot en met ${input.dateTo}`:'geen periode opgegeven';
  const contact=[input.contact?.name,input.contact?.postalAddress,input.contact?.email,input.contact?.phone].filter(Boolean).join('\n');
  const letter=[
    `Aan: ${authority}`,'Betreft: verzoek op grond van de Wet open overheid',
    '',`Geachte heer/mevrouw,`,'',
    `Hierbij verzoek ik op grond van de Wet open overheid om openbaarmaking van bestaande documenten over: ${topic}.`,
    ...(docs.length?['',`Ik zoek in het bijzonder de volgende soorten documenten:\n${lines(docs)}`]:[]),
    ...(input.dateFrom||input.dateTo?[`Periode: ${period}.`]:[]),
    ...(input.keywords?.length?[`Zoektermen ter afbakening: ${input.keywords.join(', ')}.`]:[]),
    '',`Als mijn omschrijving verduidelijking vraagt, neem dan contact met mij op. Ik ontvang graag een ontvangstbevestiging en uw besluit.`,
    '',`Met vriendelijke groet,`,...(contact?[contact]:['[Naam of contactgegevens naar keuze invullen vóór verzending]'])
  ].join('\n');
  const checklist=[
    'Controleer in de officiële Woo-index of de gekozen organisatie de documenten waarschijnlijk heeft en welk indieningskanaal zij aangeeft.',
    'Beschrijf het onderwerp zo concreet mogelijk. Documentsoorten, periode en zoektermen kunnen helpen bij de afbakening, maar zijn geen algemene verplichte velden.',
    'Controleer of deze informatie al openbaar is; een Woo-verzoek is bedoeld voor openbare overheidsinformatie.',
    'Lees de brief en voeg zelf de voor het gekozen kanaal nodige contactgegevens toe.',
    'Dien het verzoek zelf in via het door de organisatie aangegeven kanaal; WooDossier verstuurt niets.'
  ];
  return {product:'WooDossier',status:'draft',intent:input.intent,input,authorityStatus:'door gebruiker opgegeven; indieningskanaal niet geverifieerd',letter,period,checklist,sources};
}

export function summarise(raw:unknown){
  const input=timelineInput.parse(raw);
  const events=[...input.events].sort((a,b)=>a.date.localeCompare(b.date));
  const last=events.at(-1);
  const hasReceipt=events.some(e=>e.type==='receipt');
  const suspended=last?events.reduce((s,e)=>e.type==='suspension'?true:e.type==='resumption'?false:s,false):false;
  const decided=events.some(e=>e.type==='decision');
  const status=decided?'besluit opgegeven':suspended?'opschorting opgegeven':hasReceipt?'ontvangst opgegeven':'ontvangstdatum onbekend';
  return {product:'WooDossier',kind:'timeline',status,authority:input.authority??null,events,deadline:null,
    deadlineNote:'Geen definitieve wettelijke einddatum berekend. Controleer ontvangst, verlenging, opschorting en andere omstandigheden bij de organisatie.',
    procedure:'Volgens Rijksoverheid beslist de overheid in het algemeen binnen 4 weken; bij een ingewikkeld of groot verzoek kan dit met 2 weken worden verlengd. De werkelijke termijn kan door bijzondere omstandigheden afwijken.',
    sources:[sources[2]]};
}

export function evaluateEscalation(raw:unknown){
  const input=escalationInput.parse(raw);
  const evalDate=input.currentDate??new Date().toISOString().slice(0,10);
  const isWoo=input.regime==='woo';
  const baseDays=isWoo?28:56;
  const verdagingDays=input.extensionDays??0;
  const opschortingDays=input.suspensionDays??0;
  const totalDays=baseDays+verdagingDays+opschortingDays;
  const modelReceiptDate=input.receiptDate??input.requestDate;
  const deadlineDate=addDays(modelReceiptDate,totalDays);

  const hasDecision=Boolean(input.decisionDate);
  const referenceDate=hasDecision?input.decisionDate!:evalDate;
  const isOverdue=referenceDate>deadlineDate;
  const daysOverdue=isOverdue?diffDays(referenceDate,deadlineDate):0;

  const hasIngebrekestelling=Boolean(input.ingebrekestellingDate);
  const modelNoticeReceiptDate=input.ingebrekestellingReceiptDate??input.ingebrekestellingDate;
  const noticeAfterModelDeadline=Boolean(modelNoticeReceiptDate&&modelNoticeReceiptDate>deadlineDate);
  const gracePeriodEndDate=hasIngebrekestelling?addDays(modelNoticeReceiptDate!,14):null;
  const gracePeriodExpired=Boolean(gracePeriodEndDate&&referenceDate>gracePeriodEndDate);
  const daysPastGracePeriod=gracePeriodExpired?diffDays(referenceDate,gracePeriodEndDate!):0;

  let penalty:{
    applicable:boolean;
    legalBasis:string;
    accruedAmount:number;
    maxStatutoryAmount:number;
    penaltyDays:number;
    breakdown?:{
      tier1:{days:number;ratePerDay:number;max:number;amount:number};
      tier2:{days:number;ratePerDay:number;max:number;amount:number};
      tier3:{days:number;ratePerDay:number;max:number;amount:number};
      totalAccrued:number;
      maxStatutory:number;
    };
    note:string;
  };

  if(isWoo){
    penalty={
      applicable:false,
      legalBasis:'Art. 8.4 Woo sluit afdeling 4.1.3 Awb (art. 4:17 Awb) uit',
      accruedAmount:0,
      maxStatutoryAmount:0,
      penaltyDays:0,
      note:'Op grond van artikel 8.4 van de Wet open overheid is de bestuurlijke dwangsom van artikel 4:17 Awb niet van toepassing op Woo-verzoeken. Er verbeurt géén automatische administratieve dwangsom.'
    };
  }else{
    if(hasIngebrekestelling&&noticeAfterModelDeadline&&gracePeriodExpired){
      const cappedDays=Math.min(daysPastGracePeriod,42);
      const t1Days=Math.min(cappedDays,14);
      const t1Amount=t1Days*23;
      const t2Days=Math.max(0,Math.min(cappedDays-14,14));
      const t2Amount=t2Days*35;
      const t3Days=Math.max(0,Math.min(cappedDays-28,14));
      const t3Amount=t3Days*45;
      const totalAccrued=t1Amount+t2Amount+t3Amount;
      penalty={
        applicable:true,
        legalBasis:'Art. 4:17 Awb (wettelijke dwangsom bij niet tijdig beslissen)',
        accruedAmount:totalAccrued,
        maxStatutoryAmount:1442,
        penaltyDays:cappedDays,
        breakdown:{
          tier1:{days:t1Days,ratePerDay:23,max:322,amount:t1Amount},
          tier2:{days:t2Days,ratePerDay:35,max:490,amount:t2Amount},
          tier3:{days:t3Days,ratePerDay:45,max:630,amount:t3Amount},
          totalAccrued,
          maxStatutory:1442
        },
        note:`Illustratieve rekenstaffel: ${cappedDays} dagen, maximaal 42 dagen en € 1.442. Dit stelt geen verbeurde dwangsom of aanspraak vast.`
      };
    }else if(hasIngebrekestelling&&!gracePeriodExpired){
      const daysRemaining=diffDays(gracePeriodEndDate!,referenceDate);
      penalty={
        applicable:true,
        legalBasis:'Art. 4:17 Awb',
        accruedAmount:0,
        maxStatutoryAmount:1442,
        penaltyDays:0,
        note:`Rekenmodel: ${daysRemaining} dagen tot de veronderstelde hersteltermijn. Ontvangst, geldigheid en werkelijke gevolgen zijn niet vastgesteld.`
      };
    }else{
      penalty={
        applicable:true,
        legalBasis:'Art. 4:17 Awb',
        accruedAmount:0,
        maxStatutoryAmount:1442,
        penaltyDays:0,
        note:'Geen modelbedrag: geen ingebrekestelling na de modeltermijn. Werkelijke termijn, geldigheid, ontvangst en eventuele uitzonderingen moeten afzonderlijk worden gecontroleerd.'
      };
    }
  }

  const judicialAppeal={
    eligible:null,
    modelConditionsMet:Boolean(hasIngebrekestelling&&noticeAfterModelDeadline&&gracePeriodExpired&&!hasDecision),
    earliestFilingDate:null,
    modelEarliestFilingDate:hasIngebrekestelling&&noticeAfterModelDeadline&&!hasDecision?addDays(modelNoticeReceiptDate!,15):null,
    legalBasis:isWoo?'Art. 6:12 lid 2 Awb juncto art. 8:55d Awb':'Art. 6:12 Awb',
    courtPenaltyAvailable:null,
    procedure:isWoo
      ? 'Controleer de werkelijke termijn, geldige ingebrekestelling, ontvangst en toepasselijke voorwaarden vóór een beroep. Een rechterlijke dwangsom wordt door de rechter beoordeeld; het model stelt geen recht daarop vast.'
      : 'Controleer de specifieke beslistermijn, geldige ingebrekestelling, ontvangst en uitzonderingen vóór een beroep of aanspraak. De modelvoorwaarden stellen geen juridische ontvankelijkheid vast.'
  };

  const contactText=[input.contact?.name,input.contact?.postalAddress,input.contact?.email,input.contact?.phone].filter(Boolean).join('\n')
    || '[Naam en contactgegevens invullen vóór verzending]';

  const refLine=input.reference?`Kenmerk: ${input.reference}`:'Kenmerk: [Uw referentie / zaaknummer]';

  const noticeStatus=hasDecision?'decision_reported':hasIngebrekestelling?'notice_already_reported':!isOverdue?'model_deadline_not_passed':'review_template';
  const noticeDraft=noticeStatus==='review_template'?[
    'CONCEPT — controleer ontvangst, de werkelijke beslistermijn en alle invulvelden vóór gebruik.',
    `Aan: ${input.authority}`,
    `Datum: ${evalDate}`,
    `Betreft: concept ingebrekestelling — ${isWoo?'Woo-verzoek':'aanvraag'}`,
    refLine,
    '',
    'Geachte heer/mevrouw,',
    '',
    `Op ${input.requestDate} heb ik een ${isWoo?'Woo-verzoek':'aanvraag'} ingediend over: ${input.topic}.`,
    'Dit is ontvangen op [bevestigde ontvangstdatum invullen].',
    'De toepasselijke beslistermijn is [wettelijke grondslag en gecontroleerde einddatum invullen, inclusief geldige verlenging, opschorting en termijncorrecties].',
    '[Controleer vóór verzending dat die termijn is verstreken en dat nog geen besluit is ontvangen.]',
    '',
    'Als deze feiten juist zijn, stel ik uw bestuursorgaan hierbij in gebreke wegens niet tijdig beslissen en verzoek ik u alsnog te beslissen.',
    'Ik behoud mij de rechtsmiddelen voor die in deze zaak van toepassing zijn.',
    '',
    'Met vriendelijke groet,',
    contactText
  ].join('\n'):null;

  const calendarEvents:Array<{date:string;summary:string;description:string}>=[
    {
      date:input.requestDate,
      summary:`Opgegeven indiening ${isWoo?'Woo-verzoek':'Awb-aanvraag'}`,
      description:`Door gebruiker opgegeven: ${input.authority}, ${input.topic}`
    },
    {
      date:deadlineDate,
      summary:`Modeldatum — controleer werkelijke beslistermijn (${isWoo?'Woo':'Awb'})`,
      description:`Rekenaanname: ${totalDays} kalenderdagen (${baseDays} basis + ${verdagingDays} verlenging + ${opschortingDays} opschorting) vanaf ${modelReceiptDate}. Geen vastgestelde wettelijke einddatum; feestdagen, ontvangst en bijzondere regels controleren.`
    }
  ];

  if(input.receiptDate)calendarEvents.push({date:input.receiptDate,summary:'Opgegeven ontvangst aanvraag',description:'Door gebruiker opgegeven ontvangstdatum; bewijs niet geverifieerd.'});
  if(hasIngebrekestelling){
    calendarEvents.push({
      date:input.ingebrekestellingDate!,
      summary:'Opgegeven verzending ingebrekestelling',
      description:`Opgegeven verzending aan ${input.authority}; geen bewijs van ontvangst of geldigheid.`
    });
    if(input.ingebrekestellingReceiptDate)calendarEvents.push({date:input.ingebrekestellingReceiptDate,summary:'Opgegeven ontvangst ingebrekestelling',description:'Door gebruiker opgegeven; bewijs niet geverifieerd.'});
  }
  if(hasIngebrekestelling&&noticeAfterModelDeadline&&!hasDecision){
    calendarEvents.push({
      date:gracePeriodEndDate!,
      summary:'Modeldatum — einde veronderstelde hersteltermijn',
      description:'14 kalenderdagen vanaf opgegeven of aangenomen ontvangst; geen juridische vaststelling.'
    });
    calendarEvents.push({
      date:addDays(modelNoticeReceiptDate!,15),
      summary:'Modeldatum — voorwaarden eventuele vervolgstap controleren',
      description:'Geen vaststelling van ontvankelijkheid, aanspraak of betalingsplicht; controleer de specifieke zaak en actuele officiële instructies.'
    });
    if(!isWoo){
      calendarEvents.push({
        date:addDays(gracePeriodEndDate!,42),
        summary:'Modeldatum — einde rekenstaffel van 42 dagen',
        description:'Illustratieve staffel tot € 1.442; geen vastgesteld verschuldigd bedrag.'
      });
    }
  }

  const calendarIcs=generateIcs(calendarEvents,`Planningsmodel ${isWoo?'Woo':'Awb'} - ${input.authority}`);

  return {
    product:'WooDossier',
    action:'statutory_escalation',
    status:'planning_model_not_legal_determination',
    regime:input.regime,
    authority:input.authority,
    topic:input.topic,
    reference:input.reference??null,
    evaluatedAt:evalDate,
    qualification:{
      statutoryDeadlineDetermined:false,
      legalEntitlementDetermined:false,
      receiptsVerified:false,
      receiptDateSource:input.receiptDate?'user_supplied':'assumed_same_as_submission',
      noticeReceiptDateSource:input.ingebrekestellingReceiptDate?'user_supplied':hasIngebrekestelling?'assumed_same_as_submission':'not_supplied',
      assumptions:{wooBaseCalendarDays:28,awbFallbackCalendarDays:56,noticeGraceCalendarDays:14},
      limitations:['Geen algemeen geldende Awb-termijn van acht weken; de specifieke wettelijke termijn is niet vastgesteld.','Weekenden, feestdagen, bijzondere wetten, bezwaartermijnen, geldigheid van verlenging/opschorting en uitsluitingen zijn niet gekwalificeerd.','De invoer en ontvangstbewijzen zijn niet geverifieerd. Modeldata en staffelbedragen bewijzen geen verzuim, dwangsom of beroepsmogelijkheid.']
    },
    timeline:{
      requestDate:input.requestDate,
      receiptDate:input.receiptDate??null,
      totalStatutoryDays:null,
      deadlineDate:null,
      isOverdue:null,
      daysOverdue:null,
      decisionDate:input.decisionDate??null,
      hasDecision,
      decisionOnTime:null,
      ingebrekestellingDate:input.ingebrekestellingDate??null,
      hasIngebrekestelling,
      ingebrekestellingReceiptDate:input.ingebrekestellingReceiptDate??null,
      gracePeriodEndDate:null,
      gracePeriodExpired:null,
      daysPastGracePeriod:null,
      model:{baseDays,extensionDays:verdagingDays,suspensionDays:opschortingDays,totalDays,receiptDate:modelReceiptDate,deadlineDate,isOverdue,daysOverdue,decisionOnTime:hasDecision?!isOverdue:null,noticeReceiptDate:modelNoticeReceiptDate??null,noticeAfterModelDeadline,gracePeriodEndDate,gracePeriodExpired,daysPastGracePeriod}
    },
    statutoryPenalty:{applicable:null,accruedAmount:null,model:penalty},
    judicialAppeal,
    noticeDraft,
    noticeStatus,
    calendarEvents,
    calendarIcs,
    sources:[sources[5],sources[6],sources[7],sources[8],sources[9]]
  };
}

