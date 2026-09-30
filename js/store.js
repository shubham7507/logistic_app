import {SEED} from './mock-data.js';
const KEY='moveai-vnext-p1';
const clone=v=>JSON.parse(JSON.stringify(v));
export function loadState(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');if(saved.demoRevision!==SEED.demoRevision)return clone(SEED);const state={...clone(SEED),...saved};if(!saved.shopPartners&&saved.workspaces?.includes('admin'))state.workspaces=[...new Set([...state.workspaces,'grocery','groceryFresh','deliveryPartner','deliveryPartner2'])];return state}catch{return clone(SEED)}}
export function saveState(state){localStorage.setItem(KEY,JSON.stringify(state))}
export function resetState(){localStorage.removeItem(KEY);return clone(SEED)}
export function signupDemoState(){const s=clone(SEED);s.auth={status:'signed-out',mobile:null,mobileVerified:false,consentVersion:null,consentedAt:null,otpAttempts:0,otpSentAt:null,pendingMobile:null,isExistingIdentity:false};s.person={id:null,name:null};s.workspaces=[];s.currentWorkspace='personal';s.currentRoute='welcome';return s}
