import {MOBILE_PRIMARY} from './config.js';

// The four grocery-facing products need their own bottom bar destinations.
// Everything else in the desktop navigation stays accessible through More.
const PRIMARY={
  customer:['home','search','orders','account'],
  seller:['home','shopOrders','shopCatalog','shopEarnings'],
  picker:['home','pickTasks','pickEarnings','pickProfile'],
  delivery:['home','deliveryJobs','deliveryEarnings','deliveryProfile'],
  admin:['home','commerceOrders','commercePartners','commercePayments'],
};

export function mobileNavigation(product,workspace,nav){
  const map=new Map(nav);
  const preferred=PRIMARY[product] || (workspace==='personal'?nav.map(([id])=>id):
    ['commercialDriver','personalDriver','helper'].includes(workspace)?['home','myJobs','work','money']:MOBILE_PRIMARY);
  const shown=preferred.filter(id=>map.has(id)).slice(0,workspace==='personal'&&!PRIMARY[product]&&nav.length<=5?5:4);
  return {shown:shown.map(id=>[id,map.get(id)]),more:nav.filter(([id])=>!shown.includes(id))};
}
