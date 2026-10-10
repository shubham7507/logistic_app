import {SELLER_WORKSPACES,STORE_BY_MANAGER,STORE_BY_WORKER} from './seller-roles.js';

const initial={
 grocery:[['ABC Grocery · Karol Bagh','18 Market Road, Karol Bagh, Delhi 110005','Delhi'],['ABC Grocery · Noida','12 Sector 62, Noida 201301','Noida']],
 groceryFresh:[['Fresh Mart · Lajpat Nagar','7 Main Bazaar, Lajpat Nagar, Delhi 110024','Delhi'],['Fresh Mart · Noida','8 Sector 18, Noida 201301','Noida']],
 electrical:[['Sharma Electricals · Karol Bagh','22 Market Road, Karol Bagh, Delhi 110005','Delhi'],['Sharma Electricals · Noida','14 Sector 62, Noida 201301','Noida']],
 fashion:[['City Fashion · Karol Bagh','41 Main Bazaar, Karol Bagh, Delhi 110005','Delhi'],['City Fashion · Noida','16 Sector 18, Noida 201301','Noida']]
};
export const ownerStore=ws=>SELLER_WORKSPACES.includes(ws)?ws:STORE_BY_MANAGER[ws]||null;
export const seedBranches=()=>Object.fromEntries(Object.entries(initial).map(([store,items])=>[store,items.map(([name,address,serviceArea],i)=>({id:`${store}-B${i+1}`,store,name,address,serviceArea,status:'active',open:true,priority:i+1}))]));
export const branchesFor=(s,store)=>s.sellerBranches?.[store]||seedBranches()[store]||[];
export const branch=(s,store,id)=>branchesFor(s,store).find(b=>b.id===id);
export const selectedBranch=(s,store)=>s.activeSellerBranch?.[store]||branchesFor(s,store)[0]?.id;
export const defaultBranch=(s,store)=>branchesFor(s,store)[0]?.id;
export const staffBranches=(s,p)=>p.branchIds?.length?p.branchIds:[defaultBranch(s,p.store)];
export const staffAt=(s,p,id)=>staffBranches(s,p).includes(id);
export function selectBranch(s,ws,id){const store=ownerStore(ws);if(!store||branch(s,store,id)?.status!=='active')return 'Branch unavailable.';if(STORE_BY_MANAGER[ws]){const m=(s.storeManagers||[]).find(x=>x.id===s.activeStoreManager?.[ws]&&x.status==='active');if(!m||!staffAt(s,m,id))return 'This manager is not assigned to that branch.';} (s.activeSellerBranch||={})[store]=id;return '';}
export function addBranch(s,ws,name,address,serviceArea){if(!SELLER_WORKSPACES.includes(ws))return 'Seller owner access required.';name=String(name||'').trim();address=String(address||'').trim();serviceArea=String(serviceArea||'').trim();if(name.length<3||address.length<8||serviceArea.length<2)return 'Enter branch name, full pickup address and service area.';if(branchesFor(s,ws).some(b=>b.name.toLowerCase()===name.toLowerCase()))return 'Branch name already exists.';const b={id:`${ws}-B${Date.now()}`,store:ws,name,address,serviceArea,status:'active',open:true,priority:branchesFor(s,ws).length+1};(s.sellerBranches||={})[ws]??=seedBranches()[ws];s.sellerBranches[ws].push(b);return '';}
export function assignStaffBranch(s,ws,id,branchId,enabled){
 if(!SELLER_WORKSPACES.includes(ws)||!branch(s,ws,branchId))return 'Store branch unavailable.';
 const p=[...(s.pickerStaff||[]),...(s.storeManagers||[])].find(x=>x.id===id&&x.store===ws&&x.status==='active');if(!p)return 'Active staff at this seller required.';
 const current=staffBranches(s,p),employment=(s.employments||[]).find(e=>e.business===ws&&e.source.id===id);
 if(!enabled&&current.length===1&&current[0]===branchId)return 'Assign another branch before removing the last one.';
 if(!enabled&&employment?.homeBranch===branchId)return 'Transfer the home branch in Branches & teams before removing it here.';
 p.branchIds=enabled?[...new Set([...current,branchId])]:current.filter(x=>x!==branchId);
 if(employment){employment.cover=p.branchIds.filter(x=>x!==employment.homeBranch);(employment.history||=[]).push({at:new Date().toLocaleString('en-IN'),text:`${enabled?'Added':'Removed'} cover at ${branch(s,ws,branchId).name}`});}
 if(s.staffHR?.[id])s.staffHR[id].cover=p.branchIds.filter(x=>x!==(employment?.homeBranch||s.staffHR[id].homeBranch));
 return '';
}
export function routeBranch(s,store,items,address,availableAt){const candidates=branchesFor(s,store).filter(b=>b.status==='active'&&b.open&&items.every(i=>availableAt(i.product,b.id)>=i.quantity));const area=String(address||'').toLowerCase();return candidates.sort((a,b)=>(Number(area.includes(b.serviceArea.toLowerCase()))-Number(area.includes(a.serviceArea.toLowerCase())))||a.priority-b.priority)[0]||null;}

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function branchScreen(s,ws){
 const store=ownerStore(ws),current=selectedBranch(s,store),owner=SELLER_WORKSPACES.includes(ws),people=[...(s.pickerStaff||[]),...(s.storeManagers||[])].filter(p=>p.store===store&&p.status==='active');
 if(!store)return '<section class="panel">Store branch unavailable.</section>';
 const brs=branchesFor(s,store),allowed=brs.filter(b=>b.status==='active'&&(owner||people.some(p=>p.id===s.activeStoreManager?.[ws]&&staffAt(s,p,b.id))));
 return `<div class="page-header"><div><h1>Store branches</h1><p>Choose your working branch; keep its team and pickup details clear.</p></div><button class="button secondary" data-route="branchesTeams">People by branch</button></div>
 <section class="panel staff-guide"><h2>What a branch controls</h2><p>Orders, stock and published shifts use the selected branch. Home and cover assignments are managed in People by branch. Closing a branch pauses new orders there.</p></section>
 <section class="panel"><h2>Work at branch</h2><div class="staff-form-row"><label>Current branch <select data-branch-choice>${allowed.map(b=>`<option value="${esc(b.id)}" ${b.id===current?'selected':''}>${esc(b.name)} · ${esc(b.serviceArea)}</option>`).join('')}</select></label><button class="button primary" data-commerce="select-branch">Use this branch</button></div></section>
 <div class="staff-branch-grid">${brs.map(b=>{const home=people.filter(p=>staffBranches(s,p)[0]===b.id),cover=people.filter(p=>staffBranches(s,p).slice(1).includes(b.id)),openOrders=(s.customerOrders||[]).filter(o=>o.branchId===b.id&&!['delivered','cancelled','returned'].includes(o.status)).length;return `<section class="panel staff-branch-card"><div class="panel-header"><div><h2>${esc(b.name)} ${b.id===current?'· selected':''}</h2><p>${esc(b.address)}</p></div><span class="status-pill">${b.open?'Open':'Paused'}</span></div><div class="metrics"><div class="metric"><span>Open orders</span><b>${openOrders}</b></div><div class="metric"><span>Home team</span><b>${home.length}</b></div><div class="metric"><span>Cover staff</span><b>${cover.length}</b></div></div><p class="muted">Service area: ${esc(b.serviceArea)} · Home team: ${home.map(p=>esc(p.name)).join(', ')||'No one yet'}</p><div class="row-actions"><button class="button secondary compact" data-route="shopSchedule">View shifts</button><button class="button secondary compact" data-route="branchesTeams">Manage team</button>${owner?`<button class="button ${b.open?'secondary':'primary'} compact" data-commerce="branch-toggle" data-id="${esc(b.id)}">${b.open?'Pause new orders':'Resume orders'}</button>`:''}</div></section>`}).join('')}</div>
 ${owner?`<section class="panel"><h2>Add a branch</h2><p class="muted">Use a short store name and a full pickup address. Assign staff and stock after creating it.</p><div class="staff-form-row"><label>Branch name <input class="form-control" data-branch-name placeholder="e.g. Sector 62 store"></label><label>Full pickup address <input class="form-control" data-branch-address placeholder="Street, locality and PIN code"></label><label>Service area <input class="form-control" data-branch-area placeholder="e.g. Noida"></label></div><button class="button primary" data-commerce="add-branch">Add branch</button></section>`:''}`;
}
export function toggleBranch(s,ws,id){if(!SELLER_WORKSPACES.includes(ws))return 'Only the store owner can change branch availability.';const b=branch(s,ws,id);if(!b)return 'Branch not found.';b.open=!b.open;return '';}
export function selectStaffBranch(s,ws,id){const store=STORE_BY_WORKER[ws],p=(s.pickerStaff||[]).find(x=>x.id===s.activePicker?.[ws]&&x.store===store&&x.status==='active');if(!p||!staffAt(s,p,id))return 'Branch is not assigned to this staff member.';(s.activeStaffBranch||={})[p.id]=id;return '';}
