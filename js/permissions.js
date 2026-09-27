import {allowedRoutes,ROLE_CONFIG,PUBLIC_ROUTES} from './config.js';
export function canOpen(role,route,authStatus='authenticated'){
  if(PUBLIC_ROUTES.has(route))return authStatus!=='authenticated';
  return authStatus==='authenticated'&&Boolean(ROLE_CONFIG[role])&&allowedRoutes(role).has(route);
}
export function visibleNavigation(role){return ROLE_CONFIG[role]?.nav||ROLE_CONFIG.personal.nav}
