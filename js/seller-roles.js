// One mapping for the mock seller, manager and fulfilment-worker workspaces.
export const SELLER_WORKSPACES=['grocery','groceryFresh','electrical','fashion'];
export const MANAGER_BY_STORE={grocery:'groceryManager',groceryFresh:'groceryFreshManager',electrical:'electricalManager',fashion:'fashionManager'};
export const WORKER_BY_STORE={grocery:'picker',groceryFresh:'pickerFresh',electrical:'pickerElectrical',fashion:'pickerFashion'};
export const STORE_BY_MANAGER=Object.fromEntries(Object.entries(MANAGER_BY_STORE).map(([store,ws])=>[ws,store]));
export const STORE_BY_WORKER=Object.fromEntries(Object.entries(WORKER_BY_STORE).map(([store,ws])=>[ws,store]));
export const sellerRole=ws=>SELLER_WORKSPACES.includes(ws);
export const managerRole=ws=>!!STORE_BY_MANAGER[ws];
export const workerRole=ws=>!!STORE_BY_WORKER[ws];

// ---------- stores created by seller onboarding ----------
// The four demo stores are fixed. Stores approved through "Sell products" are added at runtime with
// their own owner, manager and store-staff workspaces, behaving like the template store of their main
// category (grocery, electrical or fashion). In production these are rows in a stores table.
export const STORE_TEMPLATE={grocery:'grocery',groceryFresh:'grocery',electrical:'electrical',fashion:'fashion'};
export const storeTemplate=ws=>STORE_TEMPLATE[ws]||STORE_TEMPLATE[STORE_BY_MANAGER[ws]]||STORE_TEMPLATE[STORE_BY_WORKER[ws]]||ws;
export const managerWorkspaces=()=>Object.values(MANAGER_BY_STORE);
export const workerWorkspaces=()=>Object.values(WORKER_BY_STORE);
export const retailOwnerAndManagers=()=>[...SELLER_WORKSPACES,...managerWorkspaces()];
export const retailAll=()=>[...SELLER_WORKSPACES,...managerWorkspaces(),...workerWorkspaces()];
export function registerStoreKeys(store,template){
 const mgr=`${store}Manager`,worker=`picker${store[0].toUpperCase()}${store.slice(1)}`;
 if(!SELLER_WORKSPACES.includes(store))SELLER_WORKSPACES.push(store);
 MANAGER_BY_STORE[store]=mgr;WORKER_BY_STORE[store]=worker;STORE_BY_MANAGER[mgr]=store;STORE_BY_WORKER[worker]=store;STORE_TEMPLATE[store]=template;
 return {store,manager:mgr,worker};
}
