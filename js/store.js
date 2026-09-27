import {SEED} from './mock-data.js';
const KEY='moveai-vnext-p1';
const clone=v=>JSON.parse(JSON.stringify(v));
export function loadState(){try{return {...clone(SEED),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return clone(SEED)}}
export function saveState(state){localStorage.setItem(KEY,JSON.stringify(state))}
export function resetState(){localStorage.removeItem(KEY);return clone(SEED)}
export function signupDemoState(){const s=clone(SEED);s.auth={status:'signed-out',mobile:null,mobileVerified:false,consentVersion:null,consentedAt:null,otpAttempts:0,otpSentAt:null,pendingMobile:null,isExistingIdentity:false};s.person={id:null,name:null};s.workspaces=[];s.currentWorkspace='personal';s.currentRoute='welcome';return s}
