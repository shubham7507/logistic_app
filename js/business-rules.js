export const SERVICE_OPTIONS=[
  {id:'transport',label:'Transport goods',description:'Arrange loads, vehicles and trips'},
  {id:'fleet',label:'Own vehicles',description:'Manage and offer your commercial vehicles'},
  {id:'movers',label:'Packers & movers',description:'Handle household and office moving jobs'},
  {id:'goods',label:'Goods business',description:'Buy, sell and publish transport needs'},
];

export function maskAccount(value){const d=String(value||'').replace(/\D/g,'');return d.length>=4?`•••• ${d.slice(-4)}`:'Not added'}
export function requiredKyc(services=[]){const docs=new Set(['PAN','Business address proof']);if(services.includes('transport')||services.includes('fleet'))docs.add('GST certificate');if(services.includes('movers'))docs.add('Service declaration');return [...docs]}
export function canDisableBranch(branch){return Number(branch?.activeWork||0)===0}
export function canReceivePayout(bank){return bank?.verificationStatus==='verified'}
export function workspaceForServices(services=[]){if(services.some(x=>['transport','fleet','movers'].includes(x)))return 'transporter';if(services.includes('goods'))return 'goods';return 'personal'}
export function applicationProgress(app){const checks=[app?.legalName,app?.services?.length,app?.details?.pan,app?.documents?.length,app?.branches?.length,app?.bank?.accountNumber];return Math.round(checks.filter(Boolean).length/checks.length*100)}
export function validateServices(name,services){if(!String(name||'').trim())return 'Enter the legal business name.';if(!services?.length)return 'Select at least one service.';return ''}
export function validateBank(bank){if(!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(bank?.ifsc||'').toUpperCase()))return 'Enter a valid IFSC code.';if(!/^\d{9,18}$/.test(String(bank?.accountNumber||'').replace(/\D/g,'')))return 'Enter a valid bank account number.';return ''}
