export const ROLE_TEMPLATES={
  manager:{label:'Manager',summary:'Runs assigned branches and staff',permissions:['work.manage','people.manage','messages.internal','reports.branch']},
  operations:{label:'Operations',summary:'Handles loads, trips and moving jobs',permissions:['work.update','fleet.view','people.assign','messages.job']},
  accounts:{label:'Accounts',summary:'Prepares payments and staff pay',permissions:['money.prepare','money.view','staffpay.manage','reports.money']},
  driver:{label:'Driver',summary:'Sees only assigned vehicle and trip',permissions:['work.assigned','gps.update','proof.upload','messages.job']},
  helper:{label:'Khalasi / Helper',summary:'Sees assigned loading or moving work',permissions:['work.assigned','proof.upload','messages.job']},
  documents:{label:'Document Staff',summary:'Prepares business, vehicle and staff documents',permissions:['documents.prepare','documents.status','expiry.view']},
  viewer:{label:'Viewer',summary:'Read-only branch information',permissions:['home.view','reports.branch']},
};
export const OWNER_ONLY=['business.ownership','bank.change','roles.owner','business.close'];
export function validateStaffInvite(v){const mobile=String(v.mobile||'').replace(/\D/g,'');if(!/^[6-9]\d{9}$/.test(mobile))return 'Enter a valid 10-digit mobile number.';if(!ROLE_TEMPLATES[v.role])return 'Select a designation.';if(!v.branchId)return 'Select a branch.';if(!v.payType)return 'Select a pay type.';return ''}
export function accessAllows(access,{branchId,service,permission,now=new Date()}){if(!access||access.status!=='active')return false;if(access.from&&new Date(access.from)>now)return false;if((access.expiresAt||access.to)&&new Date(access.expiresAt||access.to)<now)return false;return (!branchId||access.branchIds?.includes(branchId))&&(!service||access.services?.includes(service))&&(!permission||access.permissions?.includes(permission))}
export function validateOwnerCover(c){if(!c.delegateId)return 'Select a delegate.';if(!c.from||!c.to||new Date(c.to)<new Date(c.from))return 'Enter a valid start and end date.';if(!c.branchIds?.length)return 'Select at least one branch.';if(Number(c.paymentLimit)<0)return 'Payment limit cannot be negative.';return ''}
export function employmentResult(type){return type==='permanent'?{createsStaffId:true,assignmentOnly:false}:type==='fixed_term'?{createsStaffId:true,assignmentOnly:false}:{createsStaffId:false,assignmentOnly:true}}
export function canOffboard(staff){return !staff.activeAssignments?.length}
export function candidateMatches(candidate,opening){return candidate.status==='available'&&candidate.capabilities.includes(opening.role)&&candidate.locations.some(x=>opening.location.includes(x)||x.includes(opening.location.split(',')[0]))}
export const STAFF_LIFECYCLE=['pending','mobile_verified','accepted','profile_pending','submitted','correction_required','approved','active','rejected','offboarded'];
export function staffSubmissionReady(staff){return ['verified','complete'].includes(staff?.documentsStatus)&&['verified','complete'].includes(staff?.emergencyStatus)&&['verified','complete'].includes(staff?.bankStatus)}
export function canAcceptStaffInvitation(invite,session,now=new Date()){const expiry=invite?.expires?new Date(`${invite.expires} 23:59:59`):null;return Boolean(invite&&session?.verified&&session.inviteId===invite.id&&session.mobile===invite.mobile&&['pending','mobile_verified'].includes(invite.status)&&(!expiry||expiry>=now))}
export function staffReviewDecision(staff,decision,section='documentsStatus'){
  if(!staffSubmissionReady(staff)&&decision==='approve')return 'All joining sections must be complete before approval.';
  if(decision==='correction'&&!['documentsStatus','emergencyStatus','bankStatus'].includes(section))return 'Select the section that needs correction.';
  if(!['approve','correction','reject'].includes(decision))return 'Select a valid review decision.';
  return '';
}
