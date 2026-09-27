import {ROUTES} from './config.js';
export function readRoute(){const raw=location.hash.replace(/^#\/?/,'').split('?')[0];return raw||'home'}
export function navigate(route){if(!ROUTES[route])location.hash='#/not-found';else location.hash=`#/${route}`}
export function isKnownRoute(route){return Boolean(ROUTES[route])}
