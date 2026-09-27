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
export function accessAllows(access,{branchId,service,permission}){if(access.status!=='active')return false;if(access.expiresAt&&new Date(access.expiresAt)<new Date())return false;return access.branchIds.includes(branchId)&&(!service||access.services.includes(service))&&access.permissions.includes(permission)}
export function validateOwnerCover(c){if(!c.delegateId)return 'Select a delegate.';if(!c.from||!c.to||new Date(c.to)<new Date(c.from))return 'Enter a valid start and end date.';if(!c.branchIds?.length)return 'Select at least one branch.';if(Number(c.paymentLimit)<0)return 'Payment limit cannot be negative.';return ''}
export function employmentResult(type){return type==='permanent'?{createsStaffId:true,assignmentOnly:false}:type==='fixed_term'?{createsStaffId:true,assignmentOnly:false}:{createsStaffId:false,assignmentOnly:true}}
export function canOffboard(staff){return !staff.activeAssignments?.length}
export function candidateMatches(candidate,opening){return candidate.status==='available'&&candidate.capabilities.includes(opening.role)&&candidate.locations.some(x=>opening.location.includes(x)||x.includes(opening.location.split(',')[0]))}
