// Repeatable sample data for the browser-only seller/staff walkthrough.
import * as HR from './store-hr.js';
import * as Time from './staff-time.js';
import * as Workforce from './grocery-workforce.js';
import * as Inventory from './grocery-inventory.js';
import * as PC from './people-core.js';
import {clock} from './pay.js';
import {defaultBranch} from './seller-branches.js';
import {MANAGER_BY_STORE} from './seller-roles.js';

const presets={
 grocery:{worker:'Asha Picker',cover:'Kiran Cover',mobile:'9876505191',products:[
  ['Demo Moong Dal','1 kg','Pulses, dal & beans','vegetarian',145,12,4],
  ['Demo Whole Wheat Atta','5 kg','Flour & atta','vegetarian',260,2,5],
  ['Demo Cumin Powder','100 g','Spices & masala','vegetarian',58,0,3]]},
 groceryFresh:{worker:'Imran Picker',cover:'Neha Cover',mobile:'9876505192',products:[
  ['Demo Fresh Apples','1 kg','Fresh fruits','vegetarian',180,12,4],
  ['Demo Paneer','200 g','Dairy & paneer','vegetarian',95,2,5],
  ['Demo Tomatoes','1 kg','Fresh vegetables','vegetarian',48,0,3]]},
 electrical:{worker:'Amit Store Staff',cover:'Deepa Cover',mobile:'9876505193',products:[
  ['Demo LED Bulb 12 W','1 piece','Electrical & lighting','not_applicable',170,12,4],
  ['Demo Extension Board','4 socket','Electrical & lighting','not_applicable',390,2,5],
  ['Demo Screwdriver Set','1 set','Hardware & repair','not_applicable',240,0,3]]},
 fashion:{worker:'Pooja Store Staff',cover:'Tara Cover',mobile:'9876505194',products:[
  ['Demo Cotton T-shirt','Size M','Fashion & clothing','not_applicable',499,12,4],
  ['Demo Linen Shirt','Size L','Fashion & clothing','not_applicable',899,2,5],
  ['Demo Denim Jeans','Size 32','Fashion & clothing','not_applicable',1199,0,3]]}
};
const day=n=>new Date(clock()+n*86400000).toISOString().slice(0,10);
const workday=(start=1)=>Array.from({length:8},(_,i)=>day(start+i)).find(d=>new Date(d+'T12:00:00Z').getUTCDay()!==0);
const previousWorkday=()=>Array.from({length:7},(_,i)=>day(-i)).find(d=>new Date(d+'T12:00:00Z').getUTCDay()!==0);

export function loadStaffDemo(s,store){
 const preset=presets[store];
 if(!preset||s.shopPartners?.[store]?.status!=='approved')return 'Choose an approved seller workspace.';
 if(s.staffDemoLoaded?.[store])return 'This store sample is already loaded. Use Reset demo data to start again.';
 // Prepare on a copy so a failed step never leaves a half-loaded team or catalogue.
 const draft=structuredClone(s);
 const home=defaultBranch(draft,store),main=(draft.pickerStaff||[]).find(p=>p.store===store&&p.status==='active'&&p.name===preset.worker);
 if(!home||!main)return 'The sample worker or branch is unavailable. Reset demo data and try again.';
 (draft.activeSellerBranch||={})[store]=home;
 const coverId=`PICK-DEMO-${store}`;
 (draft.pickerStaff||=[]).push({id:coverId,store,name:preset.cover,mobile:preset.mobile,status:'active',branchIds:[home],role:'picker',payPlan:{type:'monthly',rate:10000,effectiveFrom:day(0)},joinedAt:day(0),demo:true});
 HR.people(draft,store);HR.ensureDemoWorkweeks(draft,store);PC.ensureCore(draft);
 const attendanceDay=previousWorkday();
 const check=Time.checkIn(draft,store,main.id,home,attendanceDay);
 if(check)return check;
 const leaveDay=workday();
 const leave=Time.requestLeave(draft,store,main.id,{from:leaveDay,to:leaveDay,units:1,reason:'Demo family appointment'});
 if(leave)return leave;
 const shiftDay=workday(3);
 const shift=Workforce.publishPickerShift(draft,store,main.id,shiftDay,'09:00','17:00');
 if(shift)return shift;
 const advance=HR.requestAdvance(draft,MANAGER_BY_STORE[store],main.id,{amount:1000,instalment:250,reason:'Demo staff travel expense'});
 if(advance)return advance;
 const payout=HR.setPayout(draft,coverId,{method:'bank',account:'12345678901',ifsc:'SBIN0001234',name:preset.cover});
 if(payout)return payout;
 for(const [name,size,category,vegStatus,price,quantity,lowStockAt] of preset.products){
  const error=Inventory.saveProduct(draft,store,null,{name,size,category,vegStatus,price,quantity,lowStockAt,sku:`DEMO-${store.toUpperCase()}-${preset.products.findIndex(x=>x[0]===name)+1}`,status:'active'});
  if(error)return error;
 }
 (draft.staffDemoLoaded||={})[store]={at:new Date().toISOString(),workerId:main.id,coverId,branchId:home,leaveDay,shiftDay};
 draft.hrTab='time';
 Object.assign(s,draft);
 return '';
}
export const sampleName=store=>presets[store]?.worker||'Worker';
