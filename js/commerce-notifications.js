import {MANAGER_BY_STORE,WORKER_BY_STORE} from './seller-roles.js';
// Alerts are actionable summaries. The order history retains every event.
const id=()=>`NT-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
export function notifyOrder(s,o,text){
 const store=Object.keys(s.shopPartners||{}).find(ws=>s.shopPartners[ws].party===o.party);
 const courier=Object.keys(s.deliveryPartners||{}).find(ws=>s.deliveryPartners[ws].id===o.deliveryAssignment?.partnerId);
 const alerts=[];
 const send=(to,message,route,priority='update')=>{if(to){alerts.push({to,text:`${o.id}: ${message}`,route,priority});(s.outbox||=[]).unshift({to,text:`${o.id}: ${message}`,channels:globalThis.__moveaiNC?.channelsFor?.(s,to,message)||(to==='personal'?['Push','WhatsApp','SMS']:['Push']),at:new Date().toLocaleString('en-IN')});}};
 if(text==='Order sent to store')send(store,'New order to accept','shopOrders','action');
 else if(text==='Store accepted order'){send('personal','Store confirmed your order','orderTracking');send(store,'Assign a worker or prepare items in store','shopOrders','action');}
 else if(text==='All items picked; awaiting store packing')send(store,'Items checked; pack this order','shopOrders','action');
 else if(text==='Packed and ready for pickup'){send('personal',o.fulfilment==='pickup'?'Ready for store collection; show your pickup code':'Order ready for courier pickup','orderTracking');}
 else if(text==='Collected from store with customer code'){send('personal','Store pickup completed; view your receipt','orderTracking');send(store,'Store pickup completed; settlement pending','shopSales');}
 else if(text.startsWith('Delivery offered to '))send(courier,'New delivery offer','deliveryJobs','action');
 else if(text==='Delivery offer accepted')send(store,`${o.deliveryAssignment?.partnerName||'Courier'} accepted pickup`,'shopOrders');
 else if(text==='Delivery offer expired')send('admin','Delivery offer expired; reassign','commerceIssues','action');
 else if(text==='Waiting for an available delivery partner')send('admin','No courier available','commerceIssues','action');
 else if(text==='Package collected from store')send('personal','Courier collected your order','orderTracking');
 else if(text==='Location update: Near destination')send('personal','Courier is near your address; have your delivery code ready','orderTracking');
 else if(text==='Delivered with customer code'){send('personal','Delivered; view your order and receipt','orderTracking');send(store,'Order delivered; settlement pending','shopEarnings');}
 else if(text.startsWith('Item unavailable:')){send('personal',`${text}. Review your options`,'orders','action');send('admin','Item unavailable; customer review','commerceIssues');}
 else if(text.startsWith('Replacement suggested:'))send('personal',`${text}. Approve or remove the item`,'orders','action');
 else if(text.includes(' removed · ')||text.startsWith('Replacement approved:')){send(store,'Customer resolved unavailable item; resume picking','shopOrders','action');send('personal',`Order updated; new total ${Math.round(o.total).toLocaleString('en-IN')} rupees`,'orderTracking');}
 else if(text.startsWith('Delivery issue reported')){send('personal','Delivery issue reported; we are reviewing it','orderTracking');send('admin','Delivery issue needs review','commerceIssues','action');}
 else if(text==='Delivery reattempt approved')send('personal','Delivery will be attempted again','orderTracking');
 else if(text.startsWith('Delivery cancelled after pickup')){send('personal','Delivery cancelled; refund status is in your order','orderTracking','action');send(store,'Delivery cancelled after pickup','shopOrders');}
 else if(text.startsWith('Customer cancelled')||text.startsWith('Store rejected:')||text.startsWith('Only item unavailable')){send('personal',text,'orderTracking','action');send(store,'Order cancelled','shopOrders');}
 else if(text==='Return requested')send('admin','Return request needs review','commerceIssues','action');
 else if(text.startsWith('Return approved')||text.startsWith('Return declined'))send('personal',text,'orderTracking');
 else if(text.startsWith('COD cash ')&&text.includes('submitted'))send('admin','COD cash submitted; count and confirm receipt','commercePayments','action');
 else if(text.startsWith('COD discrepancy')){send('admin','COD amount mismatch needs investigation','commercePayments','action');send(courier,'COD cash discrepancy; contact the cash desk','deliveryCash','action');}
 else if(text.startsWith('COD cash ')&&text.includes('reconciled'))send(courier,'COD cash receipt confirmed','deliveryCash');
 else if(text.startsWith('COD refund '))send('personal','COD refund transfer recorded; check the reference in My orders','orders');
 else if(text.startsWith('Store settlement '))send(store,text,'shopEarnings');
 else if(text.startsWith('Delivery earning '))send(courier,text,'deliveryEarnings');
 for(const a of [...alerts,...alerts.filter(a=>a.to===store&&['shopOrders'].includes(a.route)).map(a=>({...a,to:MANAGER_BY_STORE[store],managerId:s.activeStoreManager?.[MANAGER_BY_STORE[store]]})).filter(a=>(s.storeManagers||[]).some(m=>m.id===a.managerId&&m.status==='active'))])(s.notifications||=[]).unshift({id:id(),...a,ref:o.id,at:new Date().toLocaleString('en-IN'),read:false});
}
