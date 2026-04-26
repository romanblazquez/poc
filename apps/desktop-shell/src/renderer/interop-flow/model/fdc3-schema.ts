export interface Fdc3ContextSchema {
  type: string;
  label: string;
  requiredFields: string[];
  optionalFields: string[];
}

export interface Fdc3IntentSchema {
  name: string;
  label: string;
  acceptsContextTypes: string[];
}

export const FDC3_CONTEXT_SCHEMAS: Fdc3ContextSchema[] = [
  { type: 'fdc3.contact', label: 'Contact', requiredFields: ['type', 'id'], optionalFields: ['name'] },
  { type: 'fdc3.instrument', label: 'Instrument', requiredFields: ['type', 'id'], optionalFields: ['name'] },
  { type: 'fdc3.organization', label: 'Organization', requiredFields: ['type', 'id'], optionalFields: ['name'] },
  { type: 'com.demo.order', label: 'Order', requiredFields: ['type', 'orderId'], optionalFields: ['fundId', 'client', 'side', 'quantity'] },
  { type: 'com.demo.fund', label: 'Fund', requiredFields: ['type', 'fundId'], optionalFields: ['name', 'isin'] },
  { type: 'com.demo.theme', label: 'Theme', requiredFields: ['type', 'theme'], optionalFields: ['name'] },
  { type: 'com.demo.paymentRequest', label: 'Payment Request', requiredFields: ['type', 'amount', 'currency'], optionalFields: ['contactId', 'reference'] },
];

export const FDC3_INTENT_SCHEMAS: Fdc3IntentSchema[] = [
  { name: 'ViewOrder', label: 'View Order', acceptsContextTypes: ['com.demo.order'] },
  { name: 'ViewFund', label: 'View Fund', acceptsContextTypes: ['com.demo.fund'] },
  { name: 'ViewPortfolio', label: 'View Portfolio', acceptsContextTypes: ['fdc3.contact', 'fdc3.portfolio'] },
  { name: 'StartPayment', label: 'Start Payment', acceptsContextTypes: ['com.demo.paymentRequest'] },
  { name: 'OpenAudit', label: 'Open Audit', acceptsContextTypes: ['com.demo.order', 'com.demo.fund'] },
  { name: 'ApplyTheme', label: 'Apply Theme', acceptsContextTypes: ['com.demo.theme'] },
];

export function contextLabel(type: string): string {
  return FDC3_CONTEXT_SCHEMAS.find((schema) => schema.type === type)?.label ?? type;
}

export function intentLabel(name: string): string {
  return FDC3_INTENT_SCHEMAS.find((schema) => schema.name === name)?.label ?? name;
}
