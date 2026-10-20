import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {prepareInput,timelineInput,escalationInput} from './schema.js';
import {prepare,summarise,evaluateEscalation} from './engine.js';

export const WIDGET_URI='ui://woodossier/review.html';
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
export function createMcpServer(html:string){
  const server=new McpServer({name:'woodossier',version:'0.1.0'});
  server.registerTool('prepare_woo_request',{
    title:'Bereid een Woo-verzoek voor',
    description:'Maak een Nederlandstalige conceptbrief en checklist voor bestaande openbare overheidsdocumenten. Kies personal_data, complaint of appeal voor een passende alternatieve route. Dit verzendt niets en verifieert geen indieningskanaal.',
    inputSchema:prepareInput,annotations,_meta:{ui:{resourceUri:WIDGET_URI},'openai/outputTemplate':WIDGET_URI}
  },async input=>{try{const result=prepare(input);return{content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result};}catch{return{isError:true,content:[{type:'text' as const,text:'Ongeldige of te grote invoer voor WooDossier.'}]};}});
  server.registerTool('summarise_woo_dossier',{
    title:'Vat Woo-dossier samen',
    description:'Orden handmatig opgegeven ontvangst-, verduidelijkings-, verlengings-, opschortings- en besluitgebeurtenissen. Berekent geen definitieve wettelijke termijn.',
    inputSchema:timelineInput,annotations,_meta:{ui:{resourceUri:WIDGET_URI},'openai/outputTemplate':WIDGET_URI}
  },async input=>{try{const result=summarise(input);return{content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result};}catch{return{isError:true,content:[{type:'text' as const,text:'Ongeldige of te grote dossierinvoer.'}]};}});
  server.registerTool('evaluate_statutory_escalation',{
    title:'Verken een planning voor Woo of Awb',
    description:'Maak een expliciet planningsmodel met vaste kalenderdagen, opgegeven of aangenomen ontvangst en een illustratieve rekenstaffel. Bepaalt geen werkelijke wettelijke termijn, dwangsom of beroepsrecht. Geeft alleen zo nodig een te controleren invulconcept en gemarkeerde modeldata in iCalendar; verstuurt niets.',
    inputSchema:escalationInput,annotations
  },async input=>{try{const result=evaluateEscalation(input);return{content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result};}catch{return{isError:true,content:[{type:'text' as const,text:'Ongeldige invoer voor escalatie-evaluatie.'}]};}});
  server.registerResource('woodossier-review',WIDGET_URI,{title:'WooDossier concept en tijdlijn',mimeType:'text/html;profile=mcp-app'},
    async uri=>({contents:[{uri:uri.href,mimeType:'text/html;profile=mcp-app',text:html}]}));
  return server;
}

