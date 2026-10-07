// Seller staff and assignment rules for the single-browser demo.
import {SELLER_WORKSPACES,MANAGER_BY_STORE,WORKER_BY_STORE,STORE_BY_MANAGER,STORE_BY_WORKER} from './seller-roles.js';
import {defaultBranch,selectedBranch,staffAt,staffBranches} from './seller-branches.js';
import {esc} from './ops.js';
import * as PC from './people-core.js';
import {ROLES} from './store-hr.js';
import {aadhaarEkyc, pennyDrop, faceMatch} from './verify-sim.js';
const storeRole=ws=>SELLER_WORKSPACES.includes(ws);
const managerStore=ws=>STORE_BY_MANAGER[ws]||null;
const canAssign=(s,ws)=>storeRole(ws)||!!managerStore(ws)&&(s.storeManagers||[]).some(m=>m.id===s.activeStoreManager?.[ws]&&m.store===managerStore(ws)&&m.status==='active');
const pickerRole=ws=>!!STORE_BY_WORKER[ws];
export const pickerWorkspace=store=>WORKER_BY_STORE[store]||null;
export const storeWorkspace=picker=>STORE_BY_WORKER[picker]||null;
export const staffFor=(s,store)=>s.pickerStaff?.filter(p=>p.store===store)||[];
export const currentPicker=(s,ws)=>pickerRole(ws)?staffFor(s,storeWorkspace(ws)).find(p=>p.id===s.activePicker?.[ws]):null;
const audit=(s,actor,event)=>{(s.audit||=[]).unshift({id:`AUD-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,event,actor,workspace:actor,at:new Date().toLocaleString('en-IN')})};
const alert=(s,to,route,text,ref,pickerId)=>{(s.notifications||=[]).unshift({id:`NT-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,to,route,text,ref,pickerId,priority:'action',at:new Date().toLocaleString('en-IN'),read:false})};
export function invitePicker(s,ws,name,mobile){
 if(!storeRole(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 name=String(name||'').trim();mobile=String(mobile||'').trim();
 if(name.length<2)return 'Enter the picker name.';
 if(!/^\d{10}$/.test(mobile))return 'Enter a 10-digit mobile number.';
 // Only block when the conflict is at THIS store — a mobile already active at a different one of the
 // owner's stores is the normal "same trusted person, another business" case and must be allowed through,
 // not hard-blocked. (Previously this checked across every store regardless of which one, so an owner
 // could never add someone who already worked at their other store at all.)
 if((s.pickerStaff||[]).some(p=>p.store===ws&&p.mobile===mobile&&p.status!=='removed'))return 'This mobile already has an active or pending invitation at this store.';
 const p={id:`PICK-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,store:ws,name,mobile,role:ws==='electrical'||ws==='fashion'?'fulfilment':'picker',branchIds:[selectedBranch(s,ws)],status:'invited',invitedBy:s.shopPartners[ws].name,invitedAt:new Date().toISOString()};
 (s.pickerStaff||=[]).push(p);audit(s,s.shopPartners[ws].name,`Invited ${name} as store worker for ${s.shopPartners[ws].name}`);
 alert(s,pickerWorkspace(ws),'pickProfile',`${name}: invitation to join ${s.shopPartners[ws].name}`,p.id,p.id);
 return '';
}
export function selectPicker(s,ws,id){
 if(!pickerRole(ws)||!staffFor(s,storeWorkspace(ws)).some(p=>p.id===id&&p.status!=='removed'))return 'Picker account unavailable for this store.';
 (s.activePicker||={})[ws]=id;return '';
}
// Pickers now go through the same joining lifecycle as logistics staff instead of going straight to
// active: invited -> profile_pending (fill identity/bank) -> submitted (owner review) -> active.
// Previously this set status='active' directly with zero identity or bank verification ever collected.
export function acceptPickerInvite(s,ws){
 const p=currentPicker(s,ws);if(!p||p.status!=='invited')return 'No pending invitation for this picker.';
 if(s.shopPartners?.[p.store]?.status!=='approved')return 'Store is not approved.';
 p.status='profile_pending';p.acceptedAt=new Date().toISOString();p.documentsStatus='pending_staff';p.bankStatus='pending_staff';p.emergencyStatus='pending_staff';
 audit(s,p.name,`Accepted invitation at ${s.shopPartners[p.store].name} — completing joining details`);
 alert(s,p.store,'shopTeam',`${p.name} accepted and is completing their joining details`,p.id);
 return '';
}
export function submitPickerOnboarding(s,ws,v){
 const p=currentPicker(s,ws);if(!p||!['profile_pending','correction_required'].includes(p.status))return 'No joining details to submit for this picker.';
 const assisted=v.assisted==='1';
 // Real Aadhaar OTP verification (DigiLocker-simulated), not a typed digit count. consent is required
 // either way — from the worker themself normally, or an explicit "I confirm they were present and
 // consented" from whoever is assisting, which is a materially different, more serious claim.
 const kyc=aadhaarEkyc({aadhaar:v.aadhaar,otp:v.otp,consent:v.consent==='1'});
 if(!kyc.ok)return `Aadhaar: ${kyc.reason}`;
 if(!v.dob)return 'Enter the date of birth.';
 if(!v.selfie)return assisted?'Upload a photo of the worker or their Aadhaar card.':'Take a live selfie.';
 // faceMatch expects a file object with a real image extension — the owner/UI passes the selected
 // file's name through here; this prototype still only ever stores the filename, same convention as
 // everywhere else in the app (no real file storage exists anywhere), but the affordance itself — a
 // genuine camera-capable file picker — is the real fix for what was missing before.
 const fm=faceMatch({name:v.selfie},assisted?'assisted-reference':kyc.data?.masked);
 // The error paragraph sits at the bottom of the form (after Emergency contact), regardless of which
 // section actually failed — prefixing which section the error is about avoids it visually looking
 // like a complaint about whichever field happens to sit right above the message.
 if(!fm.ok)return `Photo: ${fm.reason}`;
 // Bank verified with a simulated ₹1 penny-drop, not just an IFSC regex check.
 const bankCheck=pennyDrop({account:v.accountNumber,ifsc:v.ifsc,name:v.accountName});
 if(!bankCheck.ok)return `Bank account: ${bankCheck.reason}`;
 const emergencyProvided=Boolean(String(v.emergencyName||'').trim()||String(v.emergencyMobile||'').trim());
 if(emergencyProvided&&!/^[6-9]\d{9}$/.test(String(v.emergencyMobile||'').replace(/\D/g,'')))return 'Enter a valid 10-digit mobile for the emergency contact, or leave both fields blank to skip it.';
 p.identity={dob:v.dob,idType:'Aadhaar',idLast4:kyc.data.masked.slice(-4),address:kyc.data.address,documentName:v.selfie,aadhaarMasked:kyc.data.masked};
 p.bank={accountName:bankCheck.data.holder,accountNumber:bankCheck.data.masked.replace(/\D/g,'').slice(-4).padStart(bankCheck.data.masked.length,'X'),masked:bankCheck.data.masked,ifsc:bankCheck.data.ifsc,upi:String(v.upi||'').trim()};
 p.emergency=emergencyProvided?{name:String(v.emergencyName).trim(),relationship:String(v.relationship||'').trim(),mobile:String(v.emergencyMobile).replace(/\D/g,'')}:null;
 p.documentsStatus='complete';p.bankStatus='complete';p.emergencyStatus=emergencyProvided?'complete':'skipped';p.status='submitted';p.correctionSection=null;p.correctionReason='';
 p.verificationMode=assisted?'assisted':'self';
 if(assisted){p.assistedBy=s.shopPartners[p.store]?.name||'Owner';p.assistedAt=new Date().toISOString();}
 audit(s,p.name,`Submitted joining details at ${s.shopPartners[p.store].name} for owner review${assisted?' (assisted verification)':''}`);
 alert(s,p.store,'shopTeam',`${p.name}: joining details submitted for review`,p.id);
 return '';
}
export function pickerReviewDecision(s,ws,pickerId,decision,section='documentsStatus',reason=''){
 if(!storeRole(ws)&&!managerStore(ws))return 'Not allowed.';
 const store=managerStore(ws)||ws,p=staffFor(s,store).find(x=>x.id===pickerId);
 if(!p||p.status!=='submitted')return 'Nothing to review for this picker.';
 if(!['approve','correction','reject'].includes(decision))return 'Select a valid review decision.';
 if(decision==='correction'&&!['documentsStatus','bankStatus','emergencyStatus'].includes(section))return 'Select the section that needs correction.';
 if(decision==='approve'){p.status='active';p.joinedAt=new Date().toISOString();audit(s,s.shopPartners[store].name,`Approved ${p.name}'s joining details — now active`);alert(s,pickerWorkspace(store),'pickProfile',`Your joining details were approved. Welcome to ${s.shopPartners[store].name}.`,p.id,p.id);}
 else if(decision==='reject'){p.status='rejected';audit(s,s.shopPartners[store].name,`Rejected ${p.name}'s joining details`);}
 else{p.status='correction_required';p.correctionSection=section;p.correctionReason=String(reason||'').trim()||'Update the highlighted section and submit again.';audit(s,s.shopPartners[store].name,`Requested correction from ${p.name}: ${section}`);alert(s,pickerWorkspace(store),'pickProfile',`Correction needed: ${p.correctionReason}`,p.id,p.id);}
 return '';
}
export function pickerCanSee(s,ws,o){
 const p=currentPicker(s,ws),store=storeWorkspace(ws);
 return !!p&&p.status==='active'&&s.shopPartners?.[store]?.status==='approved'&&o.party===s.shopPartners[store].party&&staffAt(s,p,o.branchId||defaultBranch(s,store))&&o.pickerId===p.id;
}
export function assignPicker(s,ws,orderId,pickerId){
 const store=managerStore(ws)||ws;
 if(!canAssign(s,ws)||s.shopPartners?.[store]?.status!=='approved')return 'Approved store access required.';
 const o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners[store].party);
 if(!o||o.status!=='accepted'||o.pick?.completedAt)return 'Only an accepted, unfinished store order can be assigned.';
 const p=staffFor(s,store).find(x=>x.id===pickerId&&x.status==='active'&&staffAt(s,x,o.branchId||defaultBranch(s,store))&&(!x.offboarding?.effectiveDate||x.offboarding.effectiveDate>=new Date().toISOString().slice(0,10)));if(!p)return 'Choose an active picker from this store.';
 if(o.pick?.mode==='self')return 'The seller has already started picking this order.';
 if(o.pickerId===p.id)return 'This order is already assigned to that picker.';
 const prior=staffFor(s,store).find(x=>x.id===o.pickerId);
 o.pickerId=p.id;o.pick=null;o.pickerOffer=null;
 const event=prior?`Pick task reassigned from ${prior.name} to ${p.name}`:`Pick task assigned to ${p.name}`;
 const actor=storeRole(ws)?s.shopPartners[store].name:(s.storeManagers||[]).find(x=>x.id===s.activeStoreManager?.[ws])?.name||'Store manager';
 (o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor,text:event});audit(s,actor,`${o.id}: ${event}`);
 alert(s,pickerWorkspace(store),'pickTasks',`${p.name}: ${event} · ${o.id}`,o.id,p.id);
 if(prior)alert(s,pickerWorkspace(store),'pickTasks',`${prior.name}: ${o.id} was reassigned`,o.id,prior.id);
 return '';
}
export function releasePickTask(s,ws,orderId){
 const store=managerStore(ws)||ws,o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners?.[store]?.party);
 if(!canAssign(s,ws)||!o||o.status!=='accepted'||o.pick?.startedAt)return 'Only an unstarted store pick task can be released.';
 const old=o.pickerId;o.pickerId=null;o.pickerOffer=null;o.pick=null;
 (o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:s.shopPartners[store].name,text:'Store took back pick task for manual picking'});
 if(old)alert(s,pickerWorkspace(store),'pickTasks',`${o.id} is now being picked in store`,o.id,old);
 return '';
}
export function availablePickers(s,store,now=new Date(),branchId=null){
 const day=now.toISOString().slice(0,10),time=now.toISOString().slice(11,16);
 return staffFor(s,store).filter(p=>p.status==='active'&&(!branchId||staffAt(s,p,branchId))&&(!p.offboarding?.effectiveDate||p.offboarding.effectiveDate>=day)&&!p.onBreak&&
  (s.pickerShifts||[]).some(x=>x.store===store&&(!branchId||x.branchId===branchId||!x.branchId&&branchId===defaultBranch(s,store))&&x.pickerId===p.id&&x.status==='open'&&x.date===day)&&
  !(s.pickerSchedules||[]).some(x=>x.store===store&&x.pickerId===p.id&&x.date===day&&['cover_requested','cancelled'].includes(x.status))&&
  (s.pickerSchedules||[]).filter(x=>x.store===store&&x.pickerId===p.id&&x.date===day&&x.status!=='cancelled').every(x=>x.start<=time&&time<x.end)&&
  (s.customerOrders||[]).filter(o=>o.pickerId===p.id&&['accepted','item_review'].includes(o.status)&&!o.pick?.completedAt).length<3);
}
export function autoAssignPicker(s,store,orderId,excluded=[]){
 const o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners?.[store]?.party);
 if(!o||o.status!=='accepted'||o.pick?.startedAt)return 'Order is unavailable for automatic assignment.';
 const eligible=availablePickers(s,store,new Date(),o.branchId||defaultBranch(s,store)).filter(p=>!excluded.includes(p.id));
 eligible.sort((a,b)=>{
  const load=p=>(s.customerOrders||[]).filter(x=>x.pickerId===p.id&&['accepted','item_review'].includes(x.status)&&!x.pick?.completedAt).length;
  return load(a)-load(b)||String(a.joinedAt||'').localeCompare(String(b.joinedAt||''))||a.id.localeCompare(b.id);
 });
 const p=eligible[0];if(!p){o.pickerId=null;o.pickerOffer=null;alert(s,store,'shopOrders',`${o.id}: no on-shift worker available; assign manually or prepare in store`,o.id);return 'No on-shift picker available.';}
 const old=o.pickerId;o.pickerId=p.id;o.pick=null;o.pickerOffer={pickerId:p.id,status:'offered',offeredAt:Date.now(),expiresAt:Date.now()+2*60000};
 (o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:'MoveAI',text:`Pick task offered to ${p.name}`});
 alert(s,pickerWorkspace(store),'pickTasks',`${p.name}: accept pick task ${o.id}`,o.id,p.id);
 if(old&&old!==p.id)alert(s,pickerWorkspace(store),'pickTasks',`${o.id} was offered to another picker`,o.id,old);
 return '';
}
export function respondPickOffer(s,ws,orderId,accept){
 const p=currentPicker(s,ws),store=storeWorkspace(ws),o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners?.[store]?.party);
 if(!p||p.status!=='active'||!o||o.status!=='accepted'||o.pickerId!==p.id||o.pickerOffer?.status!=='offered')return 'This pick offer is no longer available.';
 if(Date.now()>=o.pickerOffer.expiresAt)return 'This pick offer expired. Ask the store to reoffer it.';
 if(accept){if(!availablePickers(s,store,new Date(),o.branchId||defaultBranch(s,store)).some(x=>x.id===p.id))return 'Start your shift and end your break before accepting.';o.pickerOffer.status='accepted';o.pickerOffer.respondedAt=Date.now();(o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:p.name,text:'Pick task accepted'});return '';}
 o.pickerOffer.status='declined';(o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:p.name,text:'Pick task declined'});
 autoAssignPicker(s,store,orderId,[p.id]);return '';
}
export function setPickerBreak(s,ws,onBreak){
 const p=currentPicker(s,ws),store=storeWorkspace(ws);
 if(!p||p.status!=='active')return 'Active picker required.';
 if(!onBreak&&!(s.pickerShifts||[]).some(x=>x.pickerId===p.id&&x.store===store&&x.status==='open'))return 'Start a shift before becoming available.';
 p.onBreak=!!onBreak;return '';
}
export function reofferExpiredPick(s,ws,orderId){
 const store=managerStore(ws)||ws,o=s.customerOrders?.find(x=>x.id===orderId&&x.party===s.shopPartners?.[store]?.party);
 if(!canAssign(s,ws)||!o||o.pickerOffer?.status!=='offered'||Date.now()<o.pickerOffer.expiresAt)return 'No expired pick offer to reassign.';
 const old=o.pickerId;(o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:'MoveAI',text:'Pick offer timed out'});
 const result=autoAssignPicker(s,store,orderId,[old]);return result==='No on-shift picker available.'?'':result;
}
// ---------- worker-facing joining screen ----------
export function pickerOnboardingScreen(s,ws,assisted=false){
 const p=currentPicker(s,ws);if(!p)return '';
 const correction=p.status==='correction_required'?`<div class="action-warning"><b>Correction requested: ${esc((p.correctionSection||'').replaceAll('Status',''))}</b><span>${esc(p.correctionReason||'Update the highlighted section and submit again.')}</span></div>`:'';
 PC.ensureCore(s);const reuse=PC.reusableIdentity(s,p.mobile,p.store);
 const reuseBanner=reuse?`<div class="info-banner"><b>Verified details available</b><span>You already have a verified identity and bank profile from working at ${esc(reuse.businessName)}. Reuse it instead of entering everything again.</span><button type="button" class="button secondary" data-commerce="reuse-picker-identity">Use my verified details</button></div>`:'';
 return `<section class="panel"><h2>Complete your joining details</h2><p>${esc(p.name)} · You enter your own private information</p>${correction}${reuseBanner}
 ${!assisted?`<p class="muted">No smartphone? <button type="button" class="button-link" data-commerce="toggle-assisted-onboarding">Have the owner/manager verify this on your behalf instead</button></p>`:`<div class="action-warning"><b>Assisted verification</b><span>The owner/manager is entering this on ${esc(p.name)}'s behalf, with their consent, because they don't have a smartphone to do this themselves. This gets recorded differently from self-verification.</span></div><button type="button" class="button-link" data-commerce="toggle-assisted-onboarding">Switch back to self-verification</button>`}
 <form id="picker-onboarding-form"><input type="hidden" name="assisted" value="${assisted?'1':''}"><div class="onboarding-status"><div><span>1</span><b>Aadhaar verification</b></div><div><span>2</span><b>Bank verification</b></div><div><span>3</span><b>Emergency (optional)</b></div></div>
 <h3>Aadhaar verification <small class="muted">(via OTP — no need to upload a photo of the card)</small></h3>
 <div class="form-grid two"><label><span>Aadhaar number</span><input name="aadhaar" inputmode="numeric" maxlength="12" placeholder="12-digit number"></label><label><span>Date of birth</span><input type="date" name="dob" value="${esc(p.identity?.dob||'')}"></label></div>
 <div class="form-grid two"><label><span>OTP ${assisted?'(read aloud by the worker from their SMS)':'(sent to the Aadhaar-linked mobile)'}</span><input name="otp" inputmode="numeric" maxlength="6" placeholder="6-digit OTP"></label><label><span>${assisted?'Photo of the worker or their Aadhaar card':'Live selfie'}</span><input name="selfie" type="file" accept="image/*" ${assisted?'':'capture="user"'}></label></div>
 <label class="check-row"><input type="checkbox" name="consent" value="1"> ${assisted?`I confirm ${esc(p.name)} was present and gave consent for this verification.`:'I consent to fetching my Aadhaar details for verification.'}</label>
 <p class="mock-hint">Test: any 12-digit Aadhaar starting 2–9, OTP 123456.</p>
 <h3>Payment destination <small class="muted">(verified with a ₹1 penny-drop check)</small></h3><div class="form-grid two"><label><span>Account holder</span><input name="accountName" value="${esc(p.bank?.accountName||p.name)}"></label><label><span>Account number</span><input name="accountNumber" value="${esc(p.bank?.accountNumber||'')}"></label></div>
 <div class="form-grid two"><label><span>IFSC</span><input name="ifsc" value="${esc(p.bank?.ifsc||'')}"></label><label><span>UPI (optional)</span><input name="upi" value="${esc(p.bank?.upi||'')}"></label></div>
 <h3>Emergency contact <small class="muted">(optional — leave blank to skip, add it later)</small></h3><div class="form-grid two"><label><span>Name</span><input name="emergencyName" value="${esc(p.emergency?.name||'')}" placeholder="Optional"></label><label><span>Relationship</span><input name="relationship" value="${esc(p.emergency?.relationship||'')}" placeholder="Optional"></label></div>
 <label><span>Mobile</span><input name="emergencyMobile" maxlength="10" value="${esc(p.emergency?.mobile||'')}" placeholder="Optional"></label>
 <p id="picker-onboarding-error" class="field-error" hidden></p><div class="info-banner"><b>The store owner only ever sees a masked Aadhaar number and verified status</b><span>The full number is never shown to the owner or stored visibly — only "XXXX XXXX 1234" and whether it's verified.</span></div><button class="button primary full">Save and submit for owner review</button></form></section>`;
}
export function pickerSubmittedScreen(p,storeName){
 return `<section class="panel"><h2>${p.status==='correction_required'?'Correction required':'Sent for owner review'}</h2><p>${esc(p.name)} · ${esc(storeName)}</p>
 <div class="review-checklist"><span class="done">✓ Identity information submitted</span><span class="${p.emergencyStatus==='skipped'?'':'done'}">${p.emergencyStatus==='skipped'?'○ Emergency contact not provided (optional)':'✓ Emergency contact submitted'}</span><span class="done">✓ Payment destination submitted</span></div>
 ${p.status==='correction_required'?`<div class="action-warning"><b>${esc(p.correctionReason)}</b><span>Only the selected section must be corrected.</span></div>`:'<p>The owner can approve, reject or return one section for correction.</p>'}</section>`;
}
export function pickerReviewScreen(s,store,pickerId){
 const p=staffFor(s,store).find(x=>x.id===pickerId);if(!p)return '';
 const assisted=p.verificationMode==='assisted';
 return `<section class="panel"><h2>Review joining details</h2><p>${esc(p.name)} · Submitted by staff</p>
 ${assisted?`<div class="action-warning"><b>Assisted verification</b><span>This was entered by ${esc(p.assistedBy||'the owner/manager')} on ${esc(p.name)}'s behalf, with their confirmed consent — not self-verified. Review a little more carefully before approving.</span></div>`:''}
 <div class="review-checklist"><span class="done">✓ Mobile verified · ••••••${esc(p.mobile.slice(-4))}</span><span class="done">✓ Aadhaar (OTP) · ${esc(p.identity?.aadhaarMasked||'verified')} · ${assisted?'verified, assisted':'verified, self'}</span><span class="${p.emergencyStatus==='skipped'?'':'done'}">${p.emergencyStatus==='skipped'?'○ Emergency contact · not provided, optional — does not block approval':'✓ Emergency contact · complete'}</span><span class="done">✓ Bank / UPI · ${esc(p.bank?.masked||'verified and masked')}</span></div>
 <form id="picker-review-form"><label><span>Correction section</span><select name="section"><option value="documentsStatus">Identity documents</option><option value="bankStatus">Bank / UPI</option><option value="emergencyStatus">Emergency contact</option></select></label><label><span>Correction/rejection reason</span><textarea name="reason" placeholder="Required for correction or rejection"></textarea></label>
 <p id="picker-review-error" class="field-error" hidden></p><div class="form-actions"><button type="button" class="button secondary" data-commerce="picker-review-correction" data-id="${esc(p.id)}">Request correction</button><button type="button" class="button danger" data-commerce="picker-review-reject" data-id="${esc(p.id)}">Reject</button><button type="button" class="button primary" data-commerce="picker-review-approve" data-id="${esc(p.id)}">Approve and activate</button></div></form>
 <p><b>Role:</b> ${esc(ROLES[p.role]||p.role)}</p></section>`;
}
export function removePicker(s,ws,id){
 if(!storeRole(ws)||s.shopPartners?.[ws]?.status!=='approved')return 'Approved store access required.';
 const p=staffFor(s,ws).find(x=>x.id===id&&x.status!=='removed');if(!p)return 'Picker is unavailable.';
 p.status='removed';p.removedAt=new Date().toISOString();
 for(const shift of s.pickerShifts||[])if(shift.pickerId===id&&shift.status==='open'){shift.status='submitted';shift.endAt=p.removedAt;shift.note='Closed when store removed picker access';}
 let released=0;
 for(const o of s.customerOrders||[]){if(o.pickerId!==id||!['accepted','item_review'].includes(o.status)||o.pick?.completedAt)continue;o.pickerId=null;o.pick=null;released++;(o.history||=[]).push({at:new Date().toLocaleString('en-IN'),actor:s.shopPartners[ws].name,text:`${p.name} access removed; assign another picker or pick in store`})}
 audit(s,s.shopPartners[ws].name,`Removed ${p.name} picker access; ${released} open tasks released`);
 alert(s,ws,'shopOrders',`${p.name} access removed; ${released} open tasks need assignment`,p.id);
 return '';
}
