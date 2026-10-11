// Browser-local help desk. Decisions record mock case history; they do not move money or dispatch real agents.
import {esc,inr} from './ops.js';
import {SELLER_WORKSPACES,STORE_BY_MANAGER,STORE_BY_WORKER} from './seller-roles.js';
import {readEvidence,evidenceHtml} from './claim-evidence.js';

const seller=ws=>SELLER_WORKSPACES.includes(ws)||!!STORE_BY_MANAGER[ws];
const worker=ws=>!!STORE_BY_WORKER[ws]||ws==='staff';
const delivery=ws=>['deliveryPartner','deliveryPartner2'].includes(ws);
const storeOf=ws=>STORE_BY_MANAGER[ws]||STORE_BY_WORKER[ws]||(SELLER_WORKSPACES.includes(ws)?ws:null);
const active=x=>!['resolved','rejected'].includes(x.status);
const categories={
 missing_item:['Missing item','order'],wrong_item:['Wrong item','order'],damaged_item:['Damaged item','order'],expired_item:['Expired item','order'],not_received:['Marked delivered, not received','order'],late_order:['Order is late','order'],pickup_delayed:['Courier pickup delayed','order'],store_delayed:['Store delayed at pickup','order'],route_blocked:['Route blocked','order'],store_closed:['Store closed','order'],missing_bag:['Package missing at pickup','order'],oversized:['Load too large','order'],unreachable:['Customer unreachable','order'],wrong_address:['Wrong address','order'],cod_refused:['COD refused','order'],delivery_dispute:['Delivery dispute','order'],
 refund_missing:['Refund missing','payment'],payout_mismatch:['Payout amount is wrong','payment'],cod_dispute:['COD handover mismatch','payment'],wallet_missing:['Wallet earning missing','payment'],
 task:['Task or assignment problem','work'],shift:['Shift problem','work'],attendance:['Attendance correction','work'],leave:['Leave request problem','work'],advance:['Advance deduction problem','work'],salary:['Salary problem','work'],
 product:['Product listing problem','catalog'],stock:['Stock problem','catalog'],csv:['CSV import failed','catalog'],branch:['Branch access or details','catalog'],
 verification:['Verification problem','account'],access:['Cannot access my account','account'],compromised:['Account may be compromised','account'],
 accident:['Accident','safety'],threat:['Threat or abuse','safety'],harassment:['Harassment','safety'],other:['Something else','account']
};
const choices=ws=>ws==='personal'?['missing_item','wrong_item','damaged_item','expired_item','not_received','late_order','delivery_dispute','refund_missing','verification','access','compromised','accident','threat','harassment','other']:seller(ws)?['pickup_delayed','missing_item','delivery_dispute','payout_mismatch','cod_dispute','product','stock','csv','branch','salary','verification','access','compromised','accident','threat','harassment','other']:delivery(ws)?['store_delayed','route_blocked','store_closed','missing_bag','oversized','unreachable','wrong_address','cod_refused','late_order','delivery_dispute','cod_dispute','wallet_missing','payout_mismatch','verification','access','compromised','accident','threat','harassment','other']:worker(ws)?['task','shift','attendance','leave','advance','salary','verification','access','compromised','accident','threat','harassment','other']:ws==='admin'?Object.keys(categories):['task','shift','attendance','leave','advance','salary','payout_mismatch','verification','access','compromised','accident','threat','harassment','other'];
const label=k=>categories[k]?.[0]||'Help request';
const categoryKind=k=>categories[k]?.[1];
export function principal(s,ws){
 if(ws==='personal')return `person:${s.person?.id||'demo'}`;
 if(delivery(ws))return `courier:${s.deliveryPartners?.[ws]?.id||ws}`;
 if(STORE_BY_WORKER[ws])return `staff:${s.activePicker?.[ws]||ws}`;
 if(ws==='staff')return `staff:${s.selectedStaffId||ws}`;
 if(STORE_BY_MANAGER[ws])return `manager:${s.activeStoreManager?.[ws]||ws}`;
 if(seller(ws))return `store:${storeOf(ws)}`;
 return `workspace:${ws}`;
}
function orderAccess(s,ws,o){
 if(!o)return false;
 if(ws==='admin')return true;
 if(ws==='personal')return o.channel!=='counter_delivery'||o.customerId===s.person?.id;
 if(storeOf(ws))return o.party===s.shopPartners?.[storeOf(ws)]?.party&&(seller(ws)||o.pickerId===s.activePicker?.[ws]);
 if(delivery(ws))return o.deliveryAssignment?.partnerId===s.deliveryPartners?.[ws]?.id;
 return false;
}
export function references(s,ws,kind){
 if(kind==='order')return (s.customerOrders||[]).filter(o=>orderAccess(s,ws,o)).map(o=>({id:o.id,text:`${o.id} · ${o.fulfilmentPartner||'Store'} · ${o.status}`}));
 if(kind==='payment'){
  const store=storeOf(ws),party=s.shopPartners?.[store]?.party,actor=s.deliveryPartners?.[ws]?.id;
  return (s.ledger||[]).filter(x=>ws==='admin'||ws==='personal'&&(['personal',s.person?.id].includes(x.owner)||x.payer==='personal'||x.payee==='personal')||store&&seller(ws)&&(x.owner===party||x.payer===party||x.payee===party)||actor&&(x.owner===actor||x.payee===actor||x.payer===actor)).slice(0,60).map(x=>({id:x.id,text:`${x.reference||x.orderId||x.id} · ${inr(x.amount)} · ${x.status}`}));
 }
 if(kind==='work')return [{id:`work:${principal(s,ws)}`,text:'My work or current pay period'}];
 if(kind==='catalog'){
  const store=storeOf(ws),party=s.shopPartners?.[store]?.name;
  return seller(ws)?(s.products||[]).filter(p=>p.fulfilmentPartner===party).slice(0,60).map(p=>({id:p.id,text:`${p.name} · ${p.id}`})):[ ];
 }
 return [];
}
function owner(s,ws,k){
 if(categoryKind(k)==='work'&&worker(ws)&&storeOf(ws))return `store:${storeOf(ws)}`;
 if(categoryKind(k)==='work'&&ws==='staff')return `business:${s.staffSession?.ownerWorkspace||'transporter'}`;
 return categoryKind(k)==='safety'?'safety':'platform';
}
function event(c,by,text){(c.history||=[]).push({at:new Date().toLocaleString('en-IN'),by,text});}
function notify(s,to,c,text,route='helpDesk'){
 if(!to)return;
 const target=to==='staff'&&c.requester.ws==='staff'?`staff:${c.requester.id.slice(6)}`:to;
 const scope=to===c.requester.ws&&c.requester.id.startsWith('staff:')?{staffId:c.requester.id.slice(6)}:to===c.requester.ws&&c.requester.id.startsWith('manager:')?{managerId:c.requester.id.slice(8)}:{};
 (s.notifications||=[]).unshift({id:`NT-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,to:target,...scope,ref:c.id,text:`${c.id}: ${text}`,route,priority:c.priority==='urgent'?'action':'update',at:new Date().toLocaleString('en-IN'),read:false});
}
function alertOwner(s,c,text){if(c.owner==='safety'||c.owner==='platform')notify(s,'admin',c,text);else if(c.owner.startsWith('business:'))notify(s,c.owner.slice(9),c,text);else{const store=c.owner.slice(6);notify(s,store,c,text);const manager={grocery:'groceryManager',groceryFresh:'groceryFreshManager',electrical:'electricalManager',fashion:'fashionManager'}[store];notify(s,manager,c,text)}}
export function createCase(s,ws,input){
 const k=String(input.category||''),kind=categoryKind(k),ref=String(input.reference||''),description=String(input.description||'').trim(),attachment=String(input.attachment||'').trim();
 if(!choices(ws).includes(k))return {error:'Choose an issue available in your workspace.'};
 if(kind==='order'&&(!ref||!references(s,ws,kind).some(x=>x.id===ref)))return {error:'Choose the affected package.'};
 if(ref&&kind!=='order'&&!references(s,ws,kind).some(x=>x.id===ref))return {error:'Choose a record visible to you.'};
 if(description.length<10||description.length>1000)return {error:'Describe what happened in 10 to 1000 characters.'};
 if(attachment.length>120)return {error:'Attachment name is too long.'};
 const who=principal(s,ws),dupe=(s.supportCases||[]).find(c=>c.requester.id===who&&c.category===k&&c.reference===ref&&active(c));
 if(dupe)return {error:`Case ${dupe.id} is already open for this issue. Add a message there instead.`,caseId:dupe.id};
 const id=`HELP-${String((s.supportCounter||0)+1).padStart(4,'0')}`;s.supportCounter=(s.supportCounter||0)+1;
 const c={id,category:k,kind,reference:ref,description:description.slice(0,1000),attachment:attachment||null,evidence:input.evidence||null,linkedClaimId:input.linkedClaimId||null,requester:{ws,id:who},owner:owner(s,ws,k),status:'received',priority:kind==='safety'?'urgent':kind==='order'&&['store_closed','store_delayed','missing_bag','oversized','route_blocked','unreachable'].includes(k)?'time_sensitive':'normal',createdAt:Date.now(),history:[],messages:[],linked:[]};
 event(c,ws,`Case received · ${label(k)}`);
 for(const other of s.supportCases||[])if(other.reference&&other.reference===ref&&other.category===k&&active(other)){c.linked.push(other.id);(other.linked||=[]).push(c.id)}
 (s.supportCases||=[]).unshift(c);alertOwner(s,c,`New ${label(k)} case`);
 if(ws==='personal'&&['missing_item','wrong_item','damaged_item','expired_item'].includes(k)){const order=(s.customerOrders||[]).find(o=>o.id===ref),store=Object.keys(s.shopPartners||{}).find(key=>s.shopPartners[key].party===order?.party);notify(s,store,c,'Customer item report: add packing evidence');}
 notify(s,ws,c,'Case received');
 return {case:c};
}
export function canSee(s,ws,c){if(!c)return false;if(ws==='admin')return true;if(c.requester.id===principal(s,ws))return true;const sharedStore=seller(ws)&&storeOf(ws)===storeOf(c.requester.ws)&&['order','catalog'].includes(c.kind);const itemReview=seller(ws)&&c.requester.ws==='personal'&&['missing_item','wrong_item','damaged_item','expired_item'].includes(c.category)&&!!(s.customerOrders||[]).find(o=>o.id===c.reference&&o.party===s.shopPartners?.[storeOf(ws)]?.party);return sharedStore||itemReview||c.owner===`store:${storeOf(ws)}`&&seller(ws)||c.owner===`business:${ws}`}
const handler=(s,ws,c)=>ws==='admin'||c.owner===`store:${storeOf(ws)}`&&seller(ws)||c.owner===`business:${ws}`;
export function addMessage(s,ws,id,body){
 const c=(s.supportCases||[]).find(x=>x.id===id),message=String(body||'').trim();
 if(!canSee(s,ws,c))return 'Case access denied.';
 if(message.length<2||message.length>1000)return 'Write a message of 2 to 1000 characters.';
 (c.messages||=[]).push({by:ws,text:message,at:new Date().toLocaleString('en-IN')});event(c,ws,'Reply added');
 if(handler(s,ws,c)){c.lastHandledAt=Date.now();notify(s,c.requester.ws,c,'Support replied')}else alertOwner(s,c,'New reply');
 return '';
}
export function changeStatus(s,ws,id,status,note){
 const c=(s.supportCases||[]).find(x=>x.id===id),comment=String(note||'').trim();
 if(!canSee(s,ws,c)||!handler(s,ws,c))return 'Only the assigned support owner can update this case.';
 if(c.status==='escalated'&&ws!=='admin')return 'Platform review is required after an appeal.';
 if(!['checking','action_needed','resolved','rejected'].includes(status))return 'Choose a valid case status.';
 if(['resolved','rejected'].includes(status)&&comment.length<10)return 'Write a clear decision of at least 10 characters.';
 if(comment.length>1000)return 'Keep the note below 1000 characters.';
 c.status=status;c.lastHandledAt=Date.now();event(c,ws,`${status.replaceAll('_',' ')}${comment?` · ${comment}`:''}`);notify(s,c.requester.ws,c,`Case ${status.replaceAll('_',' ')}`);
 return '';
}
export function appeal(s,ws,id,note){
 const c=(s.supportCases||[]).find(x=>x.id===id),comment=String(note||'').trim();
 if(!canSee(s,ws,c)||c.requester.id!==principal(s,ws))return 'Only the requester can appeal.';
 if(!['resolved','rejected'].includes(c.status))return 'Appeal is available after a decision.';
 if(comment.length<10||comment.length>1000)return 'Explain the appeal in 10 to 1000 characters.';
 c.status='escalated';c.owner='platform';c.appealCount=(c.appealCount||0)+1;event(c,ws,`Appealed · ${comment}`);notify(s,'admin',c,'Appeal requires a different reviewer');return '';
}
export function sweepOverdue(s,now=Date.now()){
 const limits={urgent:15*60_000,time_sensitive:30*60_000,normal:24*60*60_000};let count=0;
 for(const c of s.supportCases||[]){if(!['received','checking'].includes(c.status)||now-(c.lastHandledAt||c.createdAt)<limits[c.priority||'normal'])continue;
  c.status='escalated';if(c.owner!=='safety')c.owner='platform';c.escalationReason='No support response within the demo target';event(c,'MoveAI','Escalated for platform review after no timely response');notify(s,'admin',c,'Overdue case requires review');notify(s,c.requester.ws,c,'Case escalated');count++;
 }
 return count;
}
export function addInternalNote(s,ws,id,note){
 const c=(s.supportCases||[]).find(x=>x.id===id),message=String(note||'').trim();
 if(ws!=='admin'||!c)return 'Admin access required.';
 if(message.length<5||message.length>1000)return 'Write an internal note of 5 to 1000 characters.';
 (c.internalNotes||=[]).push({by:ws,text:message,at:new Date().toLocaleString('en-IN')});event(c,ws,'Internal investigation note added');return '';
}
export function assignCase(s,ws,id,next,reason){
 const c=(s.supportCases||[]).find(x=>x.id===id),note=String(reason||'').trim();
 if(ws!=='admin'||!c)return 'Admin access required.';
 const order=(s.customerOrders||[]).find(o=>o.id===c.reference),store=Object.keys(s.shopPartners||{}).find(k=>s.shopPartners[k].party===order?.party)||storeOf(c.requester.ws),allowed=['platform','safety',...(store?[`store:${store}`]:[])];
 if(!allowed.includes(next)||c.kind==='safety'&&next!=='safety')return 'Choose an eligible support team.';
 if(note.length<5||note.length>300)return 'Explain reassignment in 5 to 300 characters.';
 c.owner=next;event(c,'admin',`Assigned to ${next} · ${note}`);alertOwner(s,c,'Case assigned for review');notify(s,c.requester.ws,c,'Case assigned to support team');return '';
}
export function loadExamples(s){
 if(s.supportExampleLoaded)return 'Demo cases have already been loaded.';
 const original=s.currentWorkspace;
 for(const [ws,category,description] of [['personal','missing_item','One pack of rice is missing from my grocery order.'],['grocery','product','The product listing needs a mock catalog review.'],['grocery','pickup_delayed','Packed bags are ready but the courier has not arrived.'],['picker','attendance','My present day needs the store manager to review it.'],['deliveryPartner','cod_dispute','The recorded cash handover amount needs review.'],['personal','threat','A mock safety concern needs urgent platform review.']]){
  const kind=categoryKind(category),ref=references(s,ws,kind)[0]?.id||'';
  if(kind==='order'&&!ref)continue;
  const result=createCase(s,ws,{category,reference:ref,description});if(result.case)result.case.demoExample=true;
 }
 s.currentWorkspace=original;s.supportExampleLoaded=true;return '';
}
const statusText=s=>({received:'Received',checking:'Checking',action_needed:'Action needed',resolved:'Resolved',rejected:'Not approved',escalated:'Escalated to platform'})[s]||s;
const roleName=(s,c)=>c.owner.startsWith('store:')?`${s.shopPartners?.[c.owner.slice(6)]?.name||'Store'} owner or manager`:c.owner.startsWith('business:')?`${c.owner.slice(9)} owner`:c.owner==='safety'?'Platform safety':'Platform support';
function detail(s,ws,c){
 if(!canSee(s,ws,c))return '';
 const assigned=handler(s,ws,c),closed=['resolved','rejected'].includes(c.status);
 const order=c.kind==='order'?(s.customerOrders||[]).find(o=>o.id===c.reference):null,payment=c.kind==='payment'?(s.ledger||[]).find(x=>x.id===c.reference):null;
 const evidence=order?`<div class="info-banner"><b>Order record</b> · ${esc(order.status)} · ${esc(order.fulfilmentPartner||'Store')} · ${esc((order.items||[]).map(i=>`${i.quantity} × ${i.name||i.productId}`).join(', '))}<details><summary>Order updates</summary>${(order.history||[]).slice(-8).map(h=>`<p>${esc(h.at)} · ${esc(h.text)}</p>`).join('')||'<p>No updates recorded.</p>'}</details></div>`:payment?`<div class="info-banner"><b>Payment record</b> · ${inr(payment.amount)} · ${esc(payment.status)} · ${esc(payment.method||'Unspecified')}</div>`:'';
 const admin=ws==='admin',store=order&&Object.keys(s.shopPartners||{}).find(k=>s.shopPartners[k].party===order.party);
 const claim=(s.claims||[]).find(x=>x.id===c.linkedClaimId);
 const operations=admin?`<div class="help-decision"><h3>Internal review</h3>${(c.internalNotes||[]).map(n=>`<p class="help-update"><small>${esc(n.at)} · Internal</small><br>${esc(n.text)}</p>`).join('')}<label>Private note <textarea class="form-control" data-help-internal="${esc(c.id)}" maxlength="1000"></textarea></label><button class="button secondary compact" data-help-action="internal" data-id="${esc(c.id)}">Save internal note</button><label>Assign team <select class="form-control" data-help-owner="${esc(c.id)}"><option value="platform">Platform support</option><option value="safety" ${c.owner==='safety'?'selected':''}>Safety team</option>${store?`<option value="store:${esc(store)}" ${c.owner===`store:${store}`?'selected':''}>${esc(s.shopPartners[store].name)} team</option>`:''}</select></label><label>Reason <input class="form-control" data-help-assign-reason="${esc(c.id)}" maxlength="300"></label><button class="button secondary compact" data-help-action="assign" data-id="${esc(c.id)}">Assign case</button></div>`:'';
 return `<section class="panel help-case-detail"><h2>${esc(c.id)} · ${esc(label(c.category))}</h2><p><b>${esc(statusText(c.status))}</b> · ${esc(roleName(s,c))} · ${esc(c.priority.replaceAll('_',' '))} priority</p><p>${esc(c.description)}</p>${c.reference?`<p>Related record: <b>${esc(c.reference)}</b></p>`:''}${evidence}${claim?`<p class="info-banner"><b>Linked claim ${esc(claim.id)}</b> · ${esc(claim.status.replaceAll('_',' '))} · ${inr(claim.amount)}. Refund or return actions are recorded in Returns & claims.</p>`:''}${evidenceHtml(c.evidence,c.attachment,'Case attachment')}<h3>Updates</h3>${c.history.map(h=>`<p class="help-update"><small>${esc(h.at)} · ${esc(h.by)}</small><br>${esc(h.text)}</p>`).join('')}${c.messages.map(m=>`<p class="help-update"><small>${esc(m.at)} · ${esc(m.by)}</small><br>${esc(m.text)}</p>`).join('')}<label>Reply <textarea class="form-control" data-help-reply="${esc(c.id)}" maxlength="1000" placeholder="Add information or ask a question"></textarea></label><button class="button secondary compact" data-help-action="reply" data-id="${esc(c.id)}">Send reply</button>${assigned?`<div class="help-decision"><label>Decision or next step <textarea class="form-control" data-help-note="${esc(c.id)}" maxlength="1000" placeholder="Explain the action and reason"></textarea></label><div class="row-actions">${[['checking','Start review'],['action_needed','Request more information'],['resolved','Resolve'],['rejected','Not approved']].map(([v,t])=>`<button class="button secondary compact" data-help-action="${v}" data-id="${esc(c.id)}">${t}</button>`).join('')}</div><p class="muted">A case decision does not itself move money or change an order. Use the relevant payment or order action separately.</p></div>`:''}${operations}${closed&&c.requester.id===principal(s,ws)?`<div class="help-decision"><label>Why do you disagree? <textarea class="form-control" data-help-appeal="${esc(c.id)}" maxlength="1000"></textarea></label><button class="button secondary compact" data-help-action="appeal" data-id="${esc(c.id)}">Appeal this decision</button></div>`:''}</section>`;
}
export function screen(s,ws){
 const mine=(s.supportCases||[]).filter(c=>canSee(s,ws,c)),selected=mine.find(c=>c.id===s.selectedSupportCaseId),draft=s.helpDraft||{},available=choices(ws),category=available.includes(draft.category)?draft.category:available[0],kind=categoryKind(category),refs=references(s,ws,kind),admin=ws==='admin';
 const filter=s.helpQueueFilter||'all',shown=admin&&filter!=='all'?mine.filter(c=>filter==='urgent'?c.priority==='urgent':filter==='open'?active(c):c.status===filter):mine;
 const header=`<div class="page-header"><div><h1>${admin?'Help Desk':'Help'}</h1><p>${admin?'Review and resolve cases across roles':'Tell us what went wrong. You can follow each case here.'}</p></div></div>${admin?'':`<div class="info-banner"><b>Urgent safety help</b> · If someone is in immediate danger, contact local emergency services. This browser demo does not dispatch responders. <button class="button secondary compact" data-help-action="safety">Report a safety concern</button></div>`}`;
 const form=admin?`<section class="panel"><h2>Support queue</h2><p>Cases are linked to the affected record. Decisions need a written reason. Money and order changes use their own approved flows.</p><div class="row-actions"><button class="button secondary compact" data-help-action="examples">Load mock help cases</button><button class="button secondary compact" data-help-action="advance">Demo: check after 25 hours</button></div></section>`:`<section class="panel"><h2>Get help</h2><p>Choose the issue first. We will show the related records you can access.</p><form id="help-form"><div class="help-form-grid"><label>What went wrong? <select class="form-control" name="category" data-help-category>${available.map(x=>`<option value="${x}" ${x===category?'selected':''}>${esc(label(x))}</option>`).join('')}</select></label>${['order','payment','work','catalog'].includes(kind)?`<label>Related ${kind==='order'?'package':kind==='payment'?'payment':kind==='work'?'work record':'product'} <select class="form-control" name="reference"><option value="">${kind==='order'?'Choose a package':'No matching record / general issue'}</option>${refs.map(r=>`<option value="${esc(r.id)}" ${r.id===draft.reference?'selected':''}>${esc(r.text)}</option>`).join('')}</select></label>`:''}<label class="help-wide">What happened? <textarea class="form-control" name="description" required minlength="10" maxlength="1000" placeholder="For example: one rice pack is missing from package ORD-..."></textarea></label><div class="help-wide row-actions"><button class="button secondary compact" type="button" data-help-action="dictate">🎤 Speak</button><label>Optional photo or PDF <input type="file" name="attachment" accept="image/*,application/pdf"></label></div></div>${kind==='safety'?'<p class="info-banner"><b>Urgent safety concern:</b> If someone is in immediate danger, contact local emergency services. This browser demo does not dispatch responders.</p>':''}<p class="muted">Small mock files are saved only in this browser profile for role review. Avoid real ID or bank details in this demo.</p><button class="button primary" type="submit">Create help case</button></form></section>`;
 return `${header}${form}<section class="panel"><h2>${admin?'All cases':'My cases'} · ${mine.length}</h2>${admin?`<label>Show <select class="form-control" data-help-filter>${[['all','All'],['open','Open'],['urgent','Urgent'],['escalated','Escalated'],['resolved','Resolved']].map(([v,t])=>`<option value="${v}" ${filter===v?'selected':''}>${t}</option>`).join('')}</select></label>`:''}${shown.map(c=>`<button class="help-list-row" data-help-case="${esc(c.id)}"><span><b>${esc(c.id)} · ${esc(label(c.category))}</b><small>${esc(c.reference||'Account')} · ${esc(c.requester.ws)} · ${esc(roleName(s,c))}</small></span><span class="help-status">${esc(statusText(c.status))}${c.priority==='urgent'?' · Urgent':''}</span></button>`).join('')||'<p>No cases match this view.</p>'}</section>${selected?detail(s,ws,selected):''}`;
}
export function bind(root,api){
 root.querySelectorAll('[data-help-context]').forEach(b=>b.onclick=()=>{const s=api.getState();s.helpDraft={category:b.dataset.helpCategory||'missing_item',reference:b.dataset.helpId||''};api.save();api.navigate('helpDesk')});
 root.querySelector('[data-help-category]')?.addEventListener('change',e=>{const s=api.getState();s.helpDraft={category:e.target.value,reference:''};api.save();api.render()});
 root.querySelector('[data-help-filter]')?.addEventListener('change',e=>{const s=api.getState();if(s.currentWorkspace!=='admin')return;s.helpQueueFilter=e.target.value;api.save();api.render()});
 root.querySelector('#help-form')?.addEventListener('submit',async e=>{e.preventDefault();const s=api.getState(),f=new FormData(e.currentTarget),file=f.get('attachment');let evidence;try{evidence=await readEvidence(file,{pdf:true});}catch(ex){return api.toast(ex.message);}const result=createCase(s,s.currentWorkspace,{category:f.get('category'),reference:f.get('reference'),description:f.get('description'),attachment:evidence?.name||'',evidence});if(result.error)return api.toast(result.error);s.selectedSupportCaseId=result.case.id;delete s.helpDraft;api.save();api.render();globalThis.requestAnimationFrame?.(()=>root.querySelector('.help-case-detail')?.scrollIntoView({block:'start'}));api.toast(`${result.case.id} created. Follow its updates here.`)});
 root.querySelectorAll('[data-help-case]').forEach(b=>b.onclick=()=>{const s=api.getState(),c=(s.supportCases||[]).find(x=>x.id===b.dataset.helpCase);if(!canSee(s,s.currentWorkspace,c))return api.toast('Case access denied.');s.selectedSupportCaseId=c.id;api.save();api.render();globalThis.requestAnimationFrame?.(()=>root.querySelector('.help-case-detail')?.scrollIntoView({block:'start'}))});
 root.querySelectorAll('[data-help-action]').forEach(b=>b.onclick=()=>{const s=api.getState(),ws=s.currentWorkspace,id=b.dataset.id,k=b.dataset.helpAction;
  if(k==='safety'){s.helpDraft={category:'threat',reference:''};api.save();api.render();return}
  if(k==='dictate'){const Recognizer=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;if(!Recognizer)return api.toast('Speech input is unavailable here; type the description instead.');const rec=new Recognizer();rec.lang='en-IN';rec.onresult=e=>{const t=root.querySelector('#help-form [name="description"]');if(t)t.value=`${t.value} ${e.results[0][0].transcript}`.trim()};rec.onerror=()=>api.toast('Speech input failed. You can type instead.');rec.start();return}
  let error='';if(k==='examples'){if(ws!=='admin')return api.toast('Admin access required.');error=loadExamples(s)}else if(k==='advance'){if(ws!=='admin')return api.toast('Admin access required.');const count=sweepOverdue(s,Date.now()+25*60*60_000);api.save();api.render();api.toast(`${count} overdue case(s) escalated in this mock check.`);return}else if(k==='reply')error=addMessage(s,ws,id,root.querySelector(`[data-help-reply="${id}"]`)?.value);else if(k==='appeal')error=appeal(s,ws,id,root.querySelector(`[data-help-appeal="${id}"]`)?.value);else if(k==='internal')error=addInternalNote(s,ws,id,root.querySelector(`[data-help-internal="${id}"]`)?.value);else if(k==='assign')error=assignCase(s,ws,id,root.querySelector(`[data-help-owner="${id}"]`)?.value,root.querySelector(`[data-help-assign-reason="${id}"]`)?.value);else error=changeStatus(s,ws,id,k,root.querySelector(`[data-help-note="${id}"]`)?.value);
  if(error)return api.toast(error);api.save();api.render();api.toast('Help case updated.');
 });
}
