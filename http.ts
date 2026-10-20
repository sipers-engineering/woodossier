import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {prepareInput,timelineInput,escalationInput,calendarInput} from './schema.js';
import {prepare,summarise,evaluateEscalation,generateIcs} from './engine.js';
import {createMcpServer} from './mcp.js';
import {dossierInput,buildDossier} from './dossier.js';

const MAX_BYTES=64*1024;
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
async function readJson(request:Request):Promise<unknown>{
  if(Number(request.headers.get('content-length'))>MAX_BYTES)throw Error('Request exceeds 64 KiB');
  const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let length=0;
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BYTES){await reader.cancel().catch(()=>{});throw Error('Request exceeds 64 KiB');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('Malformed JSON');}
}
export async function handleRequest(request:Request,html:string):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return json({error:'Origin not allowed'},403);
  if(path==='/healthz')return request.method==='GET'?json({ok:true,product:'WooDossier'}):json({error:'Method not allowed'},405);
  if(path==='/api/health')return request.method==='GET'?json({status:'ok',service:'woodossier',uptimeSec:Math.floor(process.uptime())}):json({error:'Method not allowed'},405);
  if(path==='/'||path==='/widget.html')return request.method==='GET'?new Response(html,{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}}):json({error:'Method not allowed'},405);
  if(!['/api/prepare','/api/timeline','/api/escalation','/api/calendar','/api/dossier','/mcp'].includes(path))return json({error:'Not found'},404);
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return json({error:'Expected application/json'},415);
  let body:unknown;try{body=await readJson(request);}catch(error){return json({error:error instanceof Error?error.message:'Invalid request'},400);}
  if(path==='/api/dossier'){
    const parsed=dossierInput.safeParse(body);
    if(!parsed.success)return json({error:'Invalid dossier',issues:parsed.error.issues.map(i=>({path:i.path,message:i.message}))},400);
    return json(buildDossier(parsed.data));
  }
  if(path==='/api/prepare'){
    const parsed=prepareInput.safeParse(body);
    if(!parsed.success)return json({error:'Invalid input',issues:parsed.error.issues.map(i=>({path:i.path,message:i.message}))},400);
    return json(prepare(parsed.data));
  }
  if(path==='/api/timeline'){
    const parsed=timelineInput.safeParse(body);
    if(!parsed.success)return json({error:'Invalid input',issues:parsed.error.issues.map(i=>({path:i.path,message:i.message}))},400);
    return json(summarise(parsed.data));
  }
  if(path==='/api/escalation'){
    const parsed=escalationInput.safeParse(body);
    if(!parsed.success)return json({error:'Invalid input',issues:parsed.error.issues.map(i=>({path:i.path,message:i.message}))},400);
    return json(evaluateEscalation(parsed.data));
  }
  if(path==='/api/calendar'){
    const calParsed=calendarInput.safeParse(body);
    if(calParsed.success){
      const ics=generateIcs(calParsed.data.events,calParsed.data.title??'WooDossier Termijnen');
      if(request.headers.get('accept')?.includes('text/calendar')){
        return new Response(ics,{headers:{...headers,'content-type':'text/calendar; charset=utf-8','content-disposition':'attachment; filename="woodossier.ics"'}});
      }
      return json({ok:true,ics,filename:'woodossier.ics',events:calParsed.data.events});
    }
    const escParsed=escalationInput.safeParse(body);
    if(escParsed.success){
      const res=evaluateEscalation(escParsed.data);
      if(request.headers.get('accept')?.includes('text/calendar')){
        return new Response(res.calendarIcs,{headers:{...headers,'content-type':'text/calendar; charset=utf-8','content-disposition':`attachment; filename="woodossier-${escParsed.data.regime}.ics"`}});
      }
      return json({ok:true,ics:res.calendarIcs,filename:`woodossier-${escParsed.data.regime}.ics`,events:res.calendarEvents});
    }
    return json({error:'Invalid input',message:'Expected calendar events or escalation parameters'},400);
  }
  const server=createMcpServer(html);
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:MAX_BYTES});
  await server.connect(transport);
  try{return await transport.handleRequest(request,{parsedBody:body});}finally{await server.close();}
}
