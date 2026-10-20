import {describe,it,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {prepare,summarise} from '../engine.js';
import {createLocalServer} from '../server.js';

const draft={intent:'public_documents' as const,authority:'Gemeente Voorbeeld',topic:'besluitvorming over pleinvergroening',documentTypes:['besluiten','memo’s'],keywords:['plein'],contact:{email:'persoon@example.test'}};
describe('WooDossier boundaries',()=>{
  it('preserves optional fields and rejects invalid or reversed supplied dates',()=>{
    const r=prepare(draft);
    expect(r.status).toBe('draft');if(r.status!=='draft')return;
    expect(r.input).toEqual(draft);expect(r.letter).toContain('persoon@example.test');expect(r.letter).not.toContain('Periode:');
    expect(prepare({...draft,dateFrom:'2024-01-01'}).letter).toContain('vanaf 2024-01-01');
    expect(()=>prepare({...draft,dateFrom:'2025-01-01',dateTo:'2024-01-01'})).toThrow();
    expect(()=>prepare({...draft,dateFrom:'2025-02-30'})).toThrow();
    expect(()=>prepare({...draft,unknown:'x'})).toThrow();
    expect(()=>prepare({...draft,topic:'x'.repeat(501)})).toThrow();
  });
  it('routes private data away from a public Woo letter',()=>{
    const r=prepare({intent:'personal_data'});expect(r.status).toBe('alternative_route');expect(r.letter).toBeNull();
    expect(r.alternative?.source.url).toContain('autoriteitpersoonsgegevens.nl');
  });
  it('does not invent a deadline when receipt or suspension is unknown',()=>{
    const unknown=summarise({events:[{type:'acknowledgement',date:'2026-10-04'}]});
    expect(unknown.deadline).toBeNull();expect(unknown.status).toBe('ontvangstdatum onbekend');
    const suspended=summarise({events:[{type:'receipt',date:'2026-10-01'},{type:'suspension',date:'2026-10-05'}]});
    expect(suspended.status).toBe('opschorting opgegeven');expect(suspended.deadline).toBeNull();
  });
});

it('matches real MCP tool and HTTP API, rejects malformed and oversized bodies',async()=>{
  const server=await createLocalServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const a=server.address();if(!a||typeof a==='string')throw Error('No port');const base=`http://127.0.0.1:${a.port}`;
  const client=new Client({name:'woodossier-test',version:'1.0.0'});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
    const tools=await client.listTools();expect(tools.tools.map(x=>x.name)).toEqual(expect.arrayContaining(['prepare_woo_request','summarise_woo_dossier']));
    const prepared=await client.callTool({name:'prepare_woo_request',arguments:draft});
    const api=await fetch(base+'/api/prepare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(draft)});
    expect(prepared.structuredContent).toEqual(await api.json());
    const t={events:[{type:'receipt',date:'2026-10-01'},{type:'extension',date:'2026-10-08'}]};
    const mcpTimeline=await client.callTool({name:'summarise_woo_dossier',arguments:t});
    const apiTimeline=await fetch(base+'/api/timeline',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(t)});
    expect(mcpTimeline.structuredContent).toEqual(await apiTimeline.json());
    const resource=await client.readResource({uri:'ui://woodossier/review.html'});expect(resource.contents[0].mimeType).toBe('text/html;profile=mcp-app');
    expect('text' in resource.contents[0]?resource.contents[0].text:'').toContain('ui/download-file');
    expect((await fetch(base+'/api/prepare',{method:'POST',headers:{'content-type':'application/json'},body:'{'})).status).toBe(400);
    expect((await fetch(base+'/api/prepare',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(65537)})).status).toBe(400);
    expect((await fetch(base+'/api/prepare',{method:'POST',headers:{'content-type':'application/json',origin:'https://outside.test'},body:'{}'})).status).toBe(403);
  }finally{await client.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
