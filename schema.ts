import { z } from 'zod';

const field=(max:number)=>z.string().trim().min(1).max(max).refine(v=>!/[\x00-\x1f\x7f]/.test(v),'Control characters are not allowed');
const optional=(max:number)=>field(max).optional();
export const date=z.iso.date().refine(v=>!Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),'Invalid date');
export const prepareInput=z.strictObject({
  intent:z.enum(['public_documents','personal_data','complaint','appeal']),
  authority:optional(160), topic:optional(500), documentTypes:z.array(field(120)).max(8).optional(),
  dateFrom:date.optional(),dateTo:date.optional(),keywords:z.array(field(80)).max(12).optional(),
  contact:z.strictObject({name:optional(120),email:optional(254),postalAddress:optional(400),phone:optional(50)}).optional()
}).superRefine((v,c)=>{
  if(v.dateFrom && v.dateTo && v.dateFrom>v.dateTo)c.addIssue({code:'custom',path:['dateTo'],message:'End date precedes start date'});
  if(v.intent==='public_documents'){
    if(!v.authority)c.addIssue({code:'custom',path:['authority'],message:'Authority is required for a Woo draft'});
    if(!v.topic)c.addIssue({code:'custom',path:['topic'],message:'Topic is required for a Woo draft'});
  }
});
export type PrepareInput=z.infer<typeof prepareInput>;
export const timelineInput=z.strictObject({
  authority:optional(160),
  events:z.array(z.strictObject({type:z.enum(['submission','receipt','acknowledgement','clarification','extension','suspension','resumption','decision']),date:date,note:optional(500)})).max(30)
});
export type TimelineInput=z.infer<typeof timelineInput>;

export const escalationInput=z.strictObject({
  regime:z.enum(['woo','awb_beschikking']),
  authority:field(160),
  topic:field(500),
  reference:optional(120),
  requestDate:date,
  receiptDate:date.optional(),
  extensionDays:z.number().int().min(0).max(100).optional().default(0),
  suspensionDays:z.number().int().min(0).max(365).optional().default(0),
  ingebrekestellingDate:date.optional(),
  ingebrekestellingReceiptDate:date.optional(),
  decisionDate:date.optional(),
  currentDate:date.optional(),
  contact:z.strictObject({
    name:optional(120),
    email:optional(254),
    postalAddress:optional(400),
    phone:optional(50)
  }).optional()
}).superRefine((v,c)=>{
  if(v.regime==='woo' && v.extensionDays>14)c.addIssue({code:'custom',path:['extensionDays'],message:'Woo model extension cannot exceed 14 days'});
  if(v.receiptDate && v.receiptDate<v.requestDate)c.addIssue({code:'custom',path:['receiptDate'],message:'Receipt cannot precede submission'});
  if(v.ingebrekestellingReceiptDate && !v.ingebrekestellingDate)c.addIssue({code:'custom',path:['ingebrekestellingDate'],message:'Notice submission date is required with notice receipt'});
  if(v.ingebrekestellingReceiptDate && v.ingebrekestellingDate && v.ingebrekestellingReceiptDate<v.ingebrekestellingDate)c.addIssue({code:'custom',path:['ingebrekestellingReceiptDate'],message:'Notice receipt cannot precede submission'});
  if(v.decisionDate && v.receiptDate && v.decisionDate<v.receiptDate)c.addIssue({code:'custom',path:['decisionDate'],message:'Decision cannot precede receipt'});
  if(v.currentDate && v.decisionDate && v.decisionDate>v.currentDate)c.addIssue({code:'custom',path:['decisionDate'],message:'A reported decision cannot follow the evaluation date'});
  if(v.decisionDate && v.requestDate && v.decisionDate<v.requestDate){
    c.addIssue({code:'custom',path:['decisionDate'],message:'Decision date cannot precede request date'});
  }
  if(v.ingebrekestellingDate && v.requestDate && v.ingebrekestellingDate<v.requestDate){
    c.addIssue({code:'custom',path:['ingebrekestellingDate'],message:'Ingebrekestelling date cannot precede request date'});
  }
});
export type EscalationInput=z.infer<typeof escalationInput>;

export const calendarInput=z.strictObject({
  title:optional(160),
  events:z.array(z.strictObject({
    date:date,
    summary:field(160),
    description:optional(500)
  })).min(1).max(50)
});
export type CalendarInput=z.infer<typeof calendarInput>;

