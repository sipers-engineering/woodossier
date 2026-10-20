import {z} from 'zod';
import {date,prepareInput,timelineInput,escalationInput} from './schema.js';
import {prepare,summarise,evaluateEscalation,generateIcs} from './engine.js';

const text=(max:number)=>z.string().trim().min(1).max(max).refine(v=>!/[\x00-\x1f\x7f]/.test(v),'Control characters are not allowed');
const caseInput=z.strictObject({
  id:z.uuid(),title:text(160),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),
  tracking:z.strictObject({
    status:z.enum(['draft','submitted','waiting','decision','closed']),
    reference:text(120).optional(),nextAction:text(500).optional(),nextActionDate:date.optional()
  }),
  request:prepareInput,events:timelineInput.shape.events,planning:escalationInput.optional()
}).superRefine((v,c)=>{
  if(v.updatedAt<v.createdAt)c.addIssue({code:'custom',path:['updatedAt'],message:'Update cannot precede creation'});
});

// Imported output is deliberately discarded and regenerated from validated inputs.
export const dossierInput=z.strictObject({
  product:z.literal('WooDossier'),kind:z.literal('case'),version:z.literal(1),
  case:caseInput,outputs:z.unknown().optional()
});

export function buildDossier(raw:unknown){
  const doc=dossierInput.parse(raw).case;
  return {product:'WooDossier',kind:'case',version:1,case:doc,outputs:{
    request:prepare(doc.request),
    timeline:summarise({...(doc.request.authority?{authority:doc.request.authority}:{}),events:doc.events}),
    planning:doc.planning?evaluateEscalation(doc.planning):null,
    actionCalendarIcs:doc.tracking.nextActionDate?generateIcs([{
      date:doc.tracking.nextActionDate,
      summary:`Eigen actie: ${(doc.tracking.nextAction??doc.title).slice(0,140)}`,
      description:'Door gebruiker gekozen actiedatum; geen vastgestelde wettelijke termijn. '+(doc.tracking.nextAction??'')
    }],'WooDossier eigen acties'):null
  }};
}
