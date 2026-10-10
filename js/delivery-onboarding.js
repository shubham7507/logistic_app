// Browser-local delivery partner onboarding. Files are represented by names only;
// all OTP, document, background, and payout checks are explicitly simulated.
import {esc} from './ops.js';
import {aadhaarEkyc,pennyDrop,licenceLookup,upiVerify} from './verify-sim.js';
const steps=['identity','driving','vehicle','payout','review'];
const today=()=>new Date().toISOString().slice(0,10);
const nameOf=f=>typeof f==='string'?f:f?.name||'';
const picture=f=>/\.(jpe?g|png|webp|heic|pdf)$/i.test(nameOf(f));
const masked=v=>String(v||'').replace(/.(?=.{4})/g,'•');
export const currentDeliveryPartner=(s,ws)=>s.deliveryPartners?.[ws]||null;
export function deliveryEligibility(p){
 if(!p||p.status!=='approved')return 'Platform approval required.';
 // Seeded Ravi remains a usable demo account; all newly onboarded accounts use the gates below.
 if(!p.onboardingVersion)return '';
 if(!p.verification?.training||!p.verification?.background)return 'Training or background review is incomplete.';
 if(p.documents?.licence?.expiry<today())return 'Driving licence expired. Upload a renewal.';
 if(p.documents?.insurance?.expiry<today())return 'Insurance expired. Upload a renewal.';
 if(p.documents?.puc?.expiry<today())return 'PUC expired. Upload a renewal.';
 return '';
}
export function requestAadhaarOtp(s,ws,number,consent){
 const p=currentDeliveryPartner(s,ws);if(!p||!['profile_pending','correction_required'].includes(p.status))return 'Application is not open.';
 if(!consent)return 'Consent is required before requesting an Aadhaar check.';
 const n=String(number||'').replace(/\D/g,'');if(!/^[2-9]\d{11}$/.test(n))return 'Enter a valid 12-digit test Aadhaar number.';
 p.otpRequest={last4:n.slice(-4),issuedAt:Date.now(),attempts:0,mode:'demo'};
 return '';
}
export function confirmAadhaarOtp(s,ws,otp,dob,selfie){
 const p=currentDeliveryPartner(s,ws),r=p?.otpRequest;
 if(!r)return 'Choose Verify Aadhaar first.';
 if(Date.now()-r.issuedAt>5*60000)return 'Demo OTP expired. Choose Resend OTP.';
 if(r.attempts>=3)return 'Too many attempts. Choose Resend OTP.';
 r.attempts++;
 const result=aadhaarEkyc({aadhaar:`23456789${r.last4}`,otp,consent:true});if(!result.ok)return result.reason;
 if(!dob||!picture(selfie)||/\.pdf$/i.test(nameOf(selfie)))return 'Enter date of birth and take a selfie image.';
 p.identity={idType:'Aadhaar',idLast4:r.last4,aadhaarMasked:`XXXX XXXX ${r.last4}`,dob,selfieName:nameOf(selfie),method:'demo_otp'};
 (p.verification||={}).identity='demo_verified';delete p.otpRequest;p.onboardingStep='driving';p.onboardingVersion=1;return '';
}
export function submitManualIdentity(s,ws,{dob,front,back,selfie,consent}){
 const p=currentDeliveryPartner(s,ws);if(!p||!['profile_pending','correction_required'].includes(p.status))return 'Application is not open.';
 if(!consent||!dob||![front,back,selfie].every(picture)||/\.pdf$/i.test(nameOf(selfie)))return 'Give consent, enter date of birth, upload Aadhaar front and back, and take a selfie image.';
 p.identity={idType:'Aadhaar',dob,method:'manual_review',frontName:nameOf(front),backName:nameOf(back),selfieName:nameOf(selfie)};
 (p.verification||={}).identity='manual_review';p.onboardingStep='driving';p.onboardingVersion=1;delete p.otpRequest;return '';
}
export function saveDeliveryDriving(s,ws,v){
 const p=currentDeliveryPartner(s,ws);if(!p?.identity)return 'Complete identity first.';
 const type=v.vehicleType||'two_wheeler',number=String(v.licenceNumber||'').trim(),expiry=v.licenceExpiry;
 if(!['two_wheeler','three_wheeler','four_wheeler','cycle','walking'].includes(type))return 'Choose a delivery mode.';
 if(!['cycle','walking'].includes(type)){
  if(!number||!expiry||expiry<today())return 'Enter a current driving licence number and expiry date.';
  const check=licenceLookup({number,dob:p.identity.dob,name:p.name,type:'deliveryPartner'});
  if(!check.ok&&!picture(v.licenceFront))return `${check.reason} Upload licence front and back for manual review.`;
  if(!check.ok&&!picture(v.licenceBack))return 'Upload the back of the driving licence too.';
  p.documents||={};p.documents.licence={number,expiry,frontName:nameOf(v.licenceFront),backName:nameOf(v.licenceBack),status:check.ok?'demo_checked':'manual_review'};
  (p.verification||={}).driving=check.ok?'demo_checked':'manual_review';
 }else{p.documents||={};p.documents.licence=null;(p.verification||={}).driving='not_applicable';}
 p.vehicle={...(p.vehicle||{}),type};p.onboardingStep='vehicle';return '';
}
export function saveDeliveryVehicle(s,ws,v){
 const p=currentDeliveryPartner(s,ws);if(!p?.verification?.driving)return 'Complete driving eligibility first.';
 const motor=!['walking','cycle'].includes(p.vehicle.type);
 if(motor){
  if(!String(v.vehicleNumber||'').trim()||!picture(v.rc)||!picture(v.insurance)||!picture(v.puc)||!v.insuranceExpiry||!v.pucExpiry)return 'Enter the vehicle number and upload RC, insurance and PUC with expiry dates.';
  if(v.insuranceExpiry<today()||v.pucExpiry<today())return 'Insurance and PUC must be current.';
  if(v.ownership==='borrowed'&&!picture(v.authorization))return 'Upload permission from the vehicle owner.';
  p.vehicle={...p.vehicle,number:String(v.vehicleNumber).trim().toUpperCase(),ownership:v.ownership||'own',authorizationName:nameOf(v.authorization)};
  p.documents={...(p.documents||{}),rc:{documentName:nameOf(v.rc)},insurance:{documentName:nameOf(v.insurance),expiry:v.insuranceExpiry},puc:{documentName:nameOf(v.puc),expiry:v.pucExpiry}};
 }else{p.vehicle={...p.vehicle,number:'',ownership:'not_applicable'};}
 p.verification.vehicle=motor?'manual_review':'not_applicable';p.onboardingStep='payout';return '';
}
export function saveDeliveryPayout(s,ws,v){
 const p=currentDeliveryPartner(s,ws);if(!p?.verification?.vehicle)return 'Complete the vehicle step first.';
 if(!/^[A-Z]{5}\d{4}[A-Z]$/.test(String(v.pan||'').toUpperCase()))return 'Enter a 10-character PAN.';
 const check=pennyDrop({account:v.accountNumber,ifsc:v.ifsc,name:v.accountName});
 if(!check.ok&&!check.fallback)return check.reason;
 if(!check.ok&&!picture(v.bankProof))return 'Upload a cancelled cheque or passbook for manual payout review.';
 if(v.upi){const u=upiVerify({vpa:v.upi,name:p.name});if(!u.ok)return u.reason;}
 p.panMasked=masked(String(v.pan).toUpperCase());p.bank={accountName:String(v.accountName||'').trim(),accountNumber:String(v.accountNumber||'').replace(/\D/g,''),masked:masked(String(v.accountNumber||'').replace(/\D/g,'')),ifsc:String(v.ifsc||'').toUpperCase(),upi:String(v.upi||'').trim(),proofName:nameOf(v.bankProof)};
 p.verification.payout=check.ok?'demo_checked':'manual_review';p.onboardingStep='review';return '';
}
export function submitDeliveryOnboarding(s,ws){
 const p=currentDeliveryPartner(s,ws);if(!p||!['profile_pending','correction_required'].includes(p.status))return 'No joining details to submit.';
 if(!p.identity||!p.verification?.driving||!p.verification?.vehicle||!p.verification?.payout)return 'Complete all four steps before submitting.';
 p.status='submitted';p.available=false;p.submittedAt=new Date().toISOString();p.correctionReason='';return '';
}
const tag=v=>v==='demo_checked'||v==='demo_verified'?'Demo checked':v==='manual_review'?'Manual review':v==='not_applicable'?'Not needed':v?'Complete':'To do';
const file=(label,key,accept='image/*,application/pdf')=>`<label><span>${label}</span><input type="file" name="${key}" accept="${accept}" ${accept.includes('image/*')?'capture="environment"':''}></label>`;
export function deliveryOnboardingScreen(s,ws){
 const p=currentDeliveryPartner(s,ws);if(!p)return '';
 const current=steps.includes(p.onboardingStep)?p.onboardingStep:'identity',v=p.verification||{};
 const status=`<div class="delivery-steps">${steps.map((x,i)=>`<button type="button" class="delivery-step ${current===x?'active':''}" data-delivery-step="${x}"><b>${i+1}. ${({identity:'My ID',driving:'My licence',vehicle:'My vehicle',payout:'My payment',review:'Ready to deliver'})[x]}</b><small>${tag(x==='identity'?v.identity:x==='driving'?v.driving:x==='vehicle'?v.vehicle:x==='payout'?v.payout:p.status==='submitted'?'Submitted':'')}</small></button>`).join('')}</div>`;
 const identity=`<section class="panel delivery-join-card"><h2>1. Verify my ID</h2><p>Choose the demo OTP check, or upload both sides of Aadhaar for manual review. Nothing here contacts UIDAI.</p><div class="delivery-choice"><h3>Aadhaar with demo OTP</h3>${p.otpRequest?`<p class="info-banner">Demo OTP requested for Aadhaar ending ${esc(p.otpRequest.last4)}. Enter <b>123456</b> within five minutes.</p><form data-delivery-form="otp"><div class="form-grid two"><label><span>OTP</span><input name="otp" inputmode="numeric" maxlength="6" required></label><label><span>Date of birth</span><input name="dob" type="date" required></label>${file('Live selfie','selfie','image/*')}</div><button class="button primary">Confirm demo OTP</button><button type="button" class="button secondary" data-delivery-resend>Resend demo OTP</button><button type="button" class="button text" data-delivery-change-number>Change Aadhaar number</button></form>`:`<form data-delivery-form="request"><label><span>Aadhaar number</span><input name="aadhaar" inputmode="numeric" maxlength="12" placeholder="Test number: 234567890123" required></label><label class="check-row"><input type="checkbox" name="consent" required> I consent to this demo identity check</label><button class="button primary">Verify Aadhaar</button></form>`}</div><div class="delivery-choice"><h3>Cannot use OTP? Submit front and back</h3><form data-delivery-form="manual"><div class="form-grid two"><label><span>Date of birth</span><input type="date" name="dob" required></label>${file('Aadhaar front','front')}${file('Aadhaar back','back')}${file('Live selfie','selfie','image/*')}</div><label class="check-row"><input type="checkbox" name="consent" required> I consent to manual ID review</label><button class="button secondary">Submit ID images for review</button></form><p class="muted">Demo stores only filenames, not document images. Uploads require secure storage when a backend is added.</p></div></section>`;
 const driving=`<section class="panel delivery-join-card"><h2>2. My delivery mode and licence</h2><form data-delivery-form="driving"><div class="form-grid two"><label><span>Delivery mode</span><select name="vehicleType"><option value="two_wheeler">Motorbike / scooter</option><option value="three_wheeler">Three-wheeler</option><option value="four_wheeler">Car</option><option value="cycle">Cycle</option><option value="walking">Walking</option></select></label><label><span>Licence number (motor vehicles)</span><input name="licenceNumber" value="${esc(p.documents?.licence?.number||'')}" placeholder="RJ14 20220012345"></label><label><span>Licence expiry</span><input name="licenceExpiry" type="date" value="${esc(p.documents?.licence?.expiry||'')}"></label>${file('Licence front (if demo lookup fails)','licenceFront')}${file('Licence back (if demo lookup fails)','licenceBack')}</div><p>Mock lookup may require manual review. Walking and cycle roles skip motor licence checks and can receive only compatible jobs.</p><button class="button primary">Save and continue</button></form></section>`;
 const vehicle=`<section class="panel delivery-join-card"><h2>3. My vehicle</h2><form data-delivery-form="vehicle"><p>For motor vehicles upload RC, insurance and PUC. Walking and cycle partners can continue without them.</p><div class="form-grid two"><label><span>Registration number</span><input name="vehicleNumber" value="${esc(p.vehicle?.number||'')}"></label><label><span>Ownership</span><select name="ownership"><option value="own">My vehicle</option><option value="borrowed">Someone else's vehicle</option></select></label>${file('RC image or PDF','rc')}${file('Insurance image or PDF','insurance')}<label><span>Insurance expiry</span><input type="date" name="insuranceExpiry" value="${esc(p.documents?.insurance?.expiry||'')}"></label>${file('PUC image or PDF','puc')}<label><span>PUC expiry</span><input type="date" name="pucExpiry" value="${esc(p.documents?.puc?.expiry||'')}"></label>${file('Owner permission if borrowed','authorization')}</div><button class="button primary">Save and continue</button></form></section>`;
 const payout=`<section class="panel delivery-join-card"><h2>4. My payout details</h2><form data-delivery-form="payout"><div class="form-grid two"><label><span>PAN</span><input name="pan" placeholder="ABCDE1234F" required></label><label><span>Account holder</span><input name="accountName" value="${esc(p.bank?.accountName||p.name)}" required></label><label><span>Account number</span><input name="accountNumber" inputmode="numeric" value="${esc(p.bank?.accountNumber||'')}" required></label><label><span>IFSC</span><input name="ifsc" value="${esc(p.bank?.ifsc||'')}" required></label><label><span>UPI ID (optional)</span><input name="upi" value="${esc(p.bank?.upi||'')}"></label>${file('Cancelled cheque / passbook if name differs','bankProof')}</div><p>Bank and UPI checks are simulated. Only masked account details appear in review.</p><button class="button primary">Save and continue</button></form></section>`;
 const review=`<section class="panel delivery-join-card"><h2>5. Review and submit</h2><div class="review-checklist"><span>${tag(v.identity)} · ID ${esc(p.identity?.aadhaarMasked||p.identity?.frontName||'')}</span><span>${tag(v.driving)} · licence ${esc(p.documents?.licence?.number?masked(p.documents.licence.number):'not needed')}</span><span>${tag(v.vehicle)} · ${esc(p.vehicle?.number||p.vehicle?.type||'')}</span><span>${tag(v.payout)} · account ${esc(p.bank?.masked||'')}</span></div><p>Platform review and demo training are required before new job offers. Sellers cannot approve this application.</p><button type="button" class="button primary" data-delivery-submit ${v.identity&&v.driving&&v.vehicle&&v.payout?'':'disabled'}>Submit for platform review</button></section>`;
 return `<div class="delivery-join"><div class="info-banner"><b>Delivery joining · ${esc(p.name)}</b><span>Demo checks only. Your approval applies to all sellers.</span></div>${p.status==='correction_required'?`<p class="action-warning">Please correct ${esc(p.correctionSection||'the requested details')}: ${esc(p.correctionReason||'')}</p>`:''}${status}${({identity,driving,vehicle,payout,review})[current]}<p class="field-error" data-delivery-error hidden></p></div>`;
}
export function deliverySubmittedScreen(p){return `<section class="panel"><h2>Submitted for platform review</h2><p>${esc(p.name)} · identity ${tag(p.verification?.identity)}, driving ${tag(p.verification?.driving)}, vehicle ${tag(p.verification?.vehicle)}, payout ${tag(p.verification?.payout)}.</p><p>Admin will review evidence, background and training before enabling offers.</p></section>`;}
export function deliveryReviewScreen(s,ws){const p=currentDeliveryPartner(s,ws);if(!p)return '';
 const v=p.verification||{},d=p.documents||{};
 return `<section class="panel delivery-join-card"><h2>Review ${esc(p.name)}</h2><p>Demo verification results and filenames only. Open source documents in a secure service when a backend is connected.</p><div class="review-checklist"><span>ID: ${tag(v.identity)} · ${esc(p.identity?.aadhaarMasked||`${p.identity?.frontName||'No front'} / ${p.identity?.backName||'No back'}`)}</span><span>Licence: ${tag(v.driving)} · ${esc(masked(d.licence?.number||''))} · expiry ${esc(d.licence?.expiry||'N/A')} · ${esc(d.licence?.frontName||'')}</span><span>Vehicle: ${tag(v.vehicle)} · ${esc(p.vehicle?.number||p.vehicle?.type||'')} · RC ${esc(d.rc?.documentName||'N/A')} · insurance ${esc(d.insurance?.expiry||'N/A')} · PUC ${esc(d.puc?.expiry||'N/A')}</span><span>PAN ${esc(p.panMasked||'N/A')} · bank ${esc(p.bank?.masked||'N/A')} · ${tag(v.payout)}</span></div><form id="delivery-review-form"><label class="check-row"><input type="checkbox" name="background"> Demo background review complete</label><label class="check-row"><input type="checkbox" name="training"> Demo delivery training complete</label><label><span>Section to correct</span><select name="section"><option value="identity">Identity</option><option value="driving">Licence</option><option value="vehicle">Vehicle</option><option value="payout">Payout</option></select></label><label><span>Reason for correction or rejection</span><textarea name="reason"></textarea></label><div class="form-actions"><button type="button" class="button secondary" data-commerce="delivery-review-correction" data-ws="${esc(ws)}">Request correction</button><button type="button" class="button danger" data-commerce="delivery-review-reject" data-ws="${esc(ws)}">Reject</button><button type="button" class="button primary" data-commerce="delivery-review-approve" data-ws="${esc(ws)}">Approve partner</button></div></form></section>`;
}
export function deliveryReviewDecision(s,ws,decision,section='identity',reason='',checks={}){
 const p=currentDeliveryPartner(s,ws);if(!p||p.status!=='submitted')return 'Nothing to review for this delivery partner.';
 if(!['approve','correction','reject'].includes(decision))return 'Choose a review decision.';
 if(decision!=='approve'&&!String(reason).trim())return 'Give a reason.';
 if(decision==='correction'&&!['identity','driving','vehicle','payout'].includes(section))return 'Choose a section.';
 if(decision==='approve'){
  if(!p.identity||!p.verification?.driving||!p.verification?.vehicle||!p.verification?.payout)return 'Review all application steps first.';
  for(const x of ['licence','insurance','puc'])if(p.documents?.[x]?.expiry&&p.documents[x].expiry<today())return `${x} expired. Request a renewed document.`;
  if(!checks.background||!checks.training)return 'Complete background review and delivery training first.';
  p.verification.background=true;p.verification.training=true;p.verification.reviewedAt=new Date().toISOString();p.status='approved';p.available=true;
 }else if(decision==='reject'){p.status='rejected';p.available=false;p.rejectionReason=String(reason).trim();}
 else{p.status='correction_required';p.available=false;p.correctionSection=section;p.correctionReason=String(reason).trim();p.onboardingStep=section;p.verification[section]=null;}
 return '';
}
