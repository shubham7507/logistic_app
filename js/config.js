export const ICONS={home:'⌂',work:'▦',fleet:'▦',people:'♟',messages:'◌',money:'₹',business:'▤',search:'⌕',orders:'▥',profile:'○',approvals:'✓',documents:'▣',users:'♟',audit:'◷',more:'•••',states:'◇',invitations:'✉',welcome:'→',signup:'☎',otp:'✓',recover:'↻',branches:'⌘',bank:'₹',applicationStatus:'◷',serviceExpansion:'+'};

const nav={
  personal:[['home','Home'],['search','Search products'],['orders','My orders'],['messages','Messages'],['money','Payments'],['invitations','Invitations']],
  goods:[['home','Home'],['work','Loads'],['fleet','Fleet'],['people','People'],['messages','Messages'],['money','Money'],['business','Business']],
  transporter:[['home','Home'],['work','Work'],['fleet','Fleet'],['people','People'],['messages','Messages'],['money','Money'],['business','Business']],
  vehicle:[['home','Home'],['fleet','My Trucks'],['work','Work'],['people','People'],['messages','Messages'],['money','Money'],['business','Business']],
  movers:[['home','Home'],['work','Moving jobs'],['fleet','Fleet'],['people','People'],['messages','Messages'],['money','Money'],['business','Business']],
  commercialDriver:[['home','Home'],['work','Work'],['messages','Messages'],['money','My Money'],['profile','Profile']],
  personalDriver:[['home','Home'],['work','Find Work'],['messages','Messages'],['money','My Money'],['profile','Profile']],
  helper:[['home','Home'],['work','Work'],['messages','Messages'],['money','My Money'],['profile','Profile']],
  admin:[['home','Home'],['approvals','Approvals'],['documents','Documents'],['users','Users'],['audit','Audit']],
};

export const ROLE_CONFIG={
  personal:{label:'Personal',subtitle:'Customer and personal activities',icon:'P',nav:nav.personal,branches:false,homePhase:'P1'},
  goods:{label:'Sharma Foods',subtitle:'Goods Business · Owner',icon:'G',nav:nav.goods,branches:true,homePhase:'P4'},
  transporter:{label:'Raj Logistics',subtitle:'Transporter + Fleet + Movers · Owner',icon:'T',nav:nav.transporter,branches:true,homePhase:'P4'},
  vehicle:{label:'Raj Transport',subtitle:'Truck Owner · Owner',icon:'V',nav:nav.vehicle,branches:true,homePhase:'P5'},
  movers:{label:'SafeMove Packers',subtitle:'Moving Business · Owner',icon:'M',nav:nav.movers,branches:true,homePhase:'P6'},
  commercialDriver:{label:'Commercial Driver',subtitle:'Driver · Independent',icon:'D',nav:nav.commercialDriver,branches:false,homePhase:'P3'},
  personalDriver:{label:'Personal Driver',subtitle:'Driver · Independent',icon:'D',nav:nav.personalDriver,branches:false,homePhase:'P3'},
  helper:{label:'Khalasi & Helper',subtitle:'Worker · Independent',icon:'H',nav:nav.helper,branches:false,homePhase:'P3'},
  admin:{label:'Platform Admin',subtitle:'Verification and safety',icon:'A',nav:nav.admin,branches:false,homePhase:'P2'},
};

export const ROUTES={
  home:{title:'Home',phase:'P0'}, search:{title:'Search products',phase:'P4'},orders:{title:'My orders',phase:'P4'},
  work:{title:'Work',phase:'P4'},fleet:{title:'Fleet',phase:'P5'},people:{title:'People',phase:'P3'},messages:{title:'Messages',phase:'P5'},money:{title:'Money',phase:'P7'},business:{title:'Business',phase:'P2'},profile:{title:'Profile',phase:'P3'},
  approvals:{title:'Approvals',phase:'P2'},documents:{title:'Documents',phase:'P2'},users:{title:'Users',phase:'P2'},audit:{title:'Audit',phase:'P2'},states:{title:'Screen states',phase:'P0'},
  welcome:{title:'Welcome',phase:'P1'},signup:{title:'Mobile signup',phase:'P1'},otp:{title:'Verify mobile',phase:'P1'},recover:{title:'Account recovery',phase:'P1'},invitations:{title:'Pending invitations',phase:'P1'},
  businessStart:{title:'Add business',phase:'P2'},businessDetails:{title:'Business details',phase:'P2'},businessKyc:{title:'Business KYC',phase:'P2'},branches:{title:'Branches',phase:'P2'},bank:{title:'Bank information',phase:'P2'},applicationStatus:{title:'Application status',phase:'P2'},applicationReview:{title:'Review business application',phase:'P2'},serviceExpansion:{title:'Add business service',phase:'P2'},
};

export const MOBILE_PRIMARY=['home','work','messages','money'];
export const PUBLIC_ROUTES=new Set(['welcome','signup','otp','recover']);

export function allowedRoutes(roleKey){
  const role=ROLE_CONFIG[roleKey]||ROLE_CONFIG.personal;
  const extra=roleKey==='personal'?['businessStart','businessDetails','businessKyc','branches','bank','applicationStatus']:roleKey==='admin'?['applicationReview']:role.branches?['branches','bank','serviceExpansion']:[];
  return new Set([...role.nav.map(([id])=>id),'states',...extra]);
}

export function routeTitle(route){return ROUTES[route]?.title||'Page not found'}
