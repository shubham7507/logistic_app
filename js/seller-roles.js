// One mapping for the mock seller, manager and fulfilment-worker workspaces.
export const SELLER_WORKSPACES=['grocery','groceryFresh','electrical','fashion'];
export const MANAGER_BY_STORE={grocery:'groceryManager',groceryFresh:'groceryFreshManager',electrical:'electricalManager',fashion:'fashionManager'};
export const WORKER_BY_STORE={grocery:'picker',groceryFresh:'pickerFresh',electrical:'pickerElectrical',fashion:'pickerFashion'};
export const STORE_BY_MANAGER=Object.fromEntries(Object.entries(MANAGER_BY_STORE).map(([store,ws])=>[ws,store]));
export const STORE_BY_WORKER=Object.fromEntries(Object.entries(WORKER_BY_STORE).map(([store,ws])=>[ws,store]));
export const sellerRole=ws=>SELLER_WORKSPACES.includes(ws);
export const managerRole=ws=>!!STORE_BY_MANAGER[ws];
export const workerRole=ws=>!!STORE_BY_WORKER[ws];
