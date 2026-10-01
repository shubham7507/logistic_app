export const ICONS={home:'⌂',work:'▦',fleet:'▦',people:'♟',messages:'◌',money:'₹',business:'▤',search:'⌕',orders:'▥',shopOrders:'▥',shopCatalog:'▦',shopEarnings:'₹',shopProfile:'○',deliveryJobs:'▥',deliveryCash:'₹',deliveryEarnings:'₹',deliveryProfile:'○',commerceOrders:'▥',commercePartners:'♟',commercePayments:'₹',commerceIssues:'⚑',commerceOps:'▦',profile:'○',approvals:'✓',documents:'▣',users:'♟',audit:'◷',more:'•••',states:'◇',invitations:'✉',welcome:'→',signup:'☎',otp:'✓',recover:'↻',branches:'⌘',bank:'₹',applicationStatus:'◷',serviceExpansion:'+',addStaff:'+',roles:'♟',staffAccess:'⌾',hiring:'⌕',postOpening:'+',findWorkers:'⌕',applications:'▦',candidateProfile:'○',ownerCover:'☂',offboarding:'↗',staffInvite:'✉',staffOtp:'✓',staffSubmission:'◷',staffReview:'✓',goodsOrder:'📦',transportRequirement:'🚚',arrangement:'✓',buyWithDelivery:'🛒',goodsRequirements:'🛒',postAvailableLoad:'📦',postLoadRequirement:'⌕',transporterRequirements:'▦',postAvailableTruck:'🚚',routeOpportunities:'🧭',opportunityDetail:'▦',opportunityChat:'◌',workerStatus:'♟',account:'○',invoices:'🧾',book:'＋',services:'☰',trips:'🧭',myJobs:'▦',verification:'✓',cases:'⚑',exceptions:'⚠',notifications:'🔔',staffEvents:'◷',tripDetail:'▦',movingJob:'▦',conversation:'◌',paymentDetail:'₹',vehicleDetail:'🚚',addVehicle:'+'};

const nav={
  personal:[['home','Home'],['book','Book'],['services','My bookings'],['messages','Messages'],['account','Account']],
  goods:[['home','Home'],['work','Loads'],['trips','Trips'],['fleet','Fleet'],['people','People'],['messages','Messages'],['money','Money'],['invoices','Billing'],['business','Business']],
  transporter:[['home','Home'],['work','Work'],['trips','Trips'],['fleet','Fleet'],['people','People'],['messages','Messages'],['money','Money'],['invoices','Billing'],['business','Business']],
  vehicle:[['home','Home'],['fleet','My Trucks'],['work','Work'],['trips','Trips'],['people','People'],['messages','Messages'],['money','Money'],['invoices','Billing'],['business','Business']],
  movers:[['home','Home'],['work','Moving jobs'],['fleet','Fleet'],['people','People'],['messages','Messages'],['money','Money'],['business','Business']],
  commercialDriver:[['home','Home'],['myJobs','My Jobs'],['work','Find Work'],['messages','Messages'],['money','My Money'],['profile','Profile']],
  personalDriver:[['home','Home'],['myJobs','My Jobs'],['work','Find Work'],['messages','Messages'],['money','My Money'],['profile','Profile']],
  helper:[['home','Home'],['myJobs','My Jobs'],['work','Find Work'],['messages','Messages'],['money','My Money'],['profile','Profile']],
  staff:[['home','Home'],['work','My Work'],['trips','Trips'],['messages','Messages'],['money','My Money'],['profile','My Profile']],
  grocery:[['home','Home'],['shopOrders','Orders'],['shopCatalog','Products'],['shopEarnings','Money'],['shopProfile','Store']],
  groceryFresh:[['home','Home'],['shopOrders','Orders'],['shopCatalog','Products'],['shopEarnings','Money'],['shopProfile','Store']],
  picker:[['home','Home'],['pickTasks','Pick tasks'],['pickProfile','Profile']],
  pickerFresh:[['home','Home'],['pickTasks','Pick tasks'],['pickProfile','Profile']],
  deliveryPartner:[['home','Home'],['deliveryJobs','Deliveries'],['deliveryCash','COD cash'],['deliveryEarnings','Earnings'],['deliveryProfile','Profile']],
  deliveryPartner2:[['home','Home'],['deliveryJobs','Deliveries'],['deliveryCash','COD cash'],['deliveryEarnings','Earnings'],['deliveryProfile','Profile']],
  admin:[['home','Overview'],['commerceOrders','Orders'],['commercePartners','Partners'],['commercePayments','Payments'],['commerceIssues','Issues'],['verification','Verification'],['payOps','MoveAI Pay'],['approvals','Approvals'],['cases','Cases'],['documents','Documents'],['users','Users'],['audit','Audit']],
};

export const ROLE_CONFIG={
  personal:{label:'Personal',subtitle:'Customer and personal activities',icon:'P',nav:nav.personal,branches:false,homePhase:'P1'},
  goods:{label:'Sharma Foods',subtitle:'Goods Business · Goods Owner',icon:'G',nav:nav.goods,branches:true,homePhase:'P4'},
  transporter:{label:'Raj Logistics',subtitle:'Transport Business · Transporter',icon:'T',nav:nav.transporter,branches:true,homePhase:'P4'},
  vehicle:{label:'Raj Transport',subtitle:'Commercial Vehicles · Truck Owner',icon:'V',nav:nav.vehicle,branches:true,homePhase:'P5'},
  movers:{label:'SafeMove Packers',subtitle:'Moving Business · Mover Owner',icon:'M',nav:nav.movers,branches:true,homePhase:'P6'},
  commercialDriver:{label:'Commercial Driver',subtitle:'Driver · Independent',icon:'D',nav:nav.commercialDriver,branches:false,homePhase:'P3'},
  personalDriver:{label:'Personal Driver',subtitle:'Driver · Independent',icon:'D',nav:nav.personalDriver,branches:false,homePhase:'P3'},
  helper:{label:'Khalasi & Helper',subtitle:'Worker · Independent',icon:'H',nav:nav.helper,branches:false,homePhase:'P3'},
  staff:{label:'Staff workspace',subtitle:'Invited staff · Role-specific access',icon:'S',nav:nav.staff,branches:false,homePhase:'P3'},
  admin:{label:'Platform Admin',subtitle:'Verification and safety',icon:'A',nav:nav.admin,branches:false,homePhase:'P2'},
  grocery:{label:'ABC Grocery',subtitle:'Grocery Store · Approved',icon:'S',nav:nav.grocery,branches:false,homePhase:'P16'},
  groceryFresh:{label:'Fresh Mart',subtitle:'Grocery Store · Approved',icon:'S',nav:nav.groceryFresh,branches:false,homePhase:'P16'},
  picker:{label:'ABC Grocery picker',subtitle:'Store picker',icon:'P',nav:nav.picker,branches:false,homePhase:'P16'},
  pickerFresh:{label:'Fresh Mart picker',subtitle:'Store picker',icon:'P',nav:nav.pickerFresh,branches:false,homePhase:'P16'},
  deliveryPartner:{label:'Delivery Partner 1',subtitle:'Grocery delivery · Approved',icon:'D',nav:nav.deliveryPartner,branches:false,homePhase:'P16'},
  deliveryPartner2:{label:'Delivery Partner 2',subtitle:'Grocery delivery · Approved',icon:'D',nav:nav.deliveryPartner2,branches:false,homePhase:'P16'},
};

export const ROUTES={
  home:{title:'Home',phase:'P0'}, search:{title:'Search products',phase:'P4'},productDetail:{title:'Product details',phase:'P16'},cartAdded:{title:'Added to cart',phase:'P16'},cart:{title:'Cart',phase:'P16'},orders:{title:'My orders',phase:'P4'},orderTracking:{title:'Track order',phase:'P16'},pickTasks:{title:'Pick tasks',phase:'P16'},pickProfile:{title:'Picker profile',phase:'P16'},
  shopOrders:{title:'Store orders',phase:'P16'},shopCatalog:{title:'Products and stock',phase:'P16'},shopEarnings:{title:'Store settlements',phase:'P16'},shopProfile:{title:'Store profile',phase:'P16'},
  deliveryJobs:{title:'Delivery jobs',phase:'P16'},deliveryCash:{title:'COD cash',phase:'P16'},deliveryEarnings:{title:'Delivery earnings',phase:'P16'},deliveryProfile:{title:'Delivery profile',phase:'P16'},commerceOps:{title:'Shop operations',phase:'P16'},commerceOrders:{title:'Grocery orders',phase:'P16'},commercePartners:{title:'Grocery partners',phase:'P16'},commercePayments:{title:'Grocery payments',phase:'P16'},commerceIssues:{title:'Grocery issues',phase:'P16'},
  work:{title:'Work',phase:'P4'},fleet:{title:'Fleet',phase:'P5'},people:{title:'People',phase:'P3'},messages:{title:'Messages',phase:'P5'},money:{title:'Money',phase:'P7'},business:{title:'Business',phase:'P2'},profile:{title:'Profile',phase:'P3'},
  approvals:{title:'Approvals',phase:'P2'},documents:{title:'Documents',phase:'P2'},users:{title:'Users',phase:'P2'},audit:{title:'Audit',phase:'P2'},states:{title:'Screen states',phase:'P0'},
  welcome:{title:'Welcome',phase:'P1'},signup:{title:'Mobile signup',phase:'P1'},otp:{title:'Verify mobile',phase:'P1'},recover:{title:'Account recovery',phase:'P1'},invitations:{title:'Pending invitations',phase:'P1'},
  businessStart:{title:'Add business',phase:'P2'},businessDetails:{title:'Business details',phase:'P2'},businessKyc:{title:'Business KYC',phase:'P2'},branches:{title:'Branches',phase:'P2'},bank:{title:'Bank information',phase:'P2'},applicationStatus:{title:'Application status',phase:'P2'},applicationReview:{title:'Review business application',phase:'P2'},serviceExpansion:{title:'Add business service',phase:'P2'},
  purpose:{title:'Choose purpose',phase:'P1'},consentDetails:{title:'Consent details',phase:'P1'},recoverySupport:{title:'Account recovery support',phase:'P1'},branchEditor:{title:'Branch details',phase:'P2'},
  addStaff:{title:'Add staff',phase:'P3'},staffDetail:{title:'Staff details',phase:'P3'},staffInvite:{title:'Staff invitation',phase:'P3'},staffOtp:{title:'Verify staff mobile',phase:'P3'},staffOnboarding:{title:'Staff onboarding',phase:'P3'},staffSubmission:{title:'Joining status',phase:'P3'},staffReview:{title:'Review staff onboarding',phase:'P3'},roles:{title:'Roles and permissions',phase:'P3'},staffAccess:{title:'Staff access',phase:'P3'},hiring:{title:'Hiring',phase:'P3'},postOpening:{title:'Post opening',phase:'P3'},findWorkers:{title:'Find workers',phase:'P3'},openingDetail:{title:'Opening details',phase:'P3'},applications:{title:'Applicants',phase:'P3'},candidateProfile:{title:'Work profile',phase:'P3'},ownerCover:{title:'Owner Cover',phase:'P3'},offboarding:{title:'Offboarding',phase:'P3'},
  goodsOrder:{title:'Goods order',phase:'P4'},transportRequirement:{title:'Transport requirement',phase:'P4'},arrangement:{title:'Transport arrangement',phase:'P4'},buyWithDelivery:{title:'Buy goods with delivery',phase:'P4'},goodsRequirements:{title:'Goods requirements',phase:'P4'},postAvailableLoad:{title:'Post available load',phase:'P4'},postLoadRequirement:{title:'Post load requirement',phase:'P4'},transporterRequirements:{title:'Transporters looking for loads',phase:'P4'},postAvailableTruck:{title:'Post available truck',phase:'P4'},routeOpportunities:{title:'Route opportunities',phase:'P4'},opportunityDetail:{title:'Opportunity details',phase:'P4'},opportunityChat:{title:'Opportunity conversation',phase:'P4'},
  ownVehicleAssignment:{title:'Assign owned vehicle',phase:'P4'},sellerSourcing:{title:'Source verified seller',phase:'P4'},transportOffer:{title:'Transport offer',phase:'P4'},truckOffer:{title:'Truck owner offer',phase:'P4'},applyOpening:{title:'Confirm application',phase:'P3'},candidateReview:{title:'Candidate verification',phase:'P3'},employmentChange:{title:'Employment change',phase:'P3'},inviteSent:{title:'Invitation ready',phase:'P10'},payOps:{title:'MoveAI Pay',phase:'P12'},pricingRules:{title:'Pricing rules',phase:'P15'},invoices:{title:'Freight billing',phase:'P13'},ewayBills:{title:'E-way bills',phase:'P14'},invoiceNew:{title:'New invoice',phase:'P13'},invoiceDetail:{title:'Invoice',phase:'P13'},workforce:{title:'Workforce',phase:'P11'},dutyBoard:{title:'Duty board',phase:'P11'},payroll:{title:'Payroll',phase:'P11'},khata:{title:'Khata',phase:'P11'},tripSettlement:{title:'Crew settlement',phase:'P11'},workerDocuments:{title:'Upload documents',phase:'P9'},workerStatus:{title:'Work profile',phase:'P9'},workerVerify:{title:'Verify',phase:'P9'},account:{title:'Account',phase:'P9'},productCheckout:{title:'Checkout',phase:'P16'},billDoc:{title:'Receipt / invoice',phase:'P17'},
  book:{title:'Book a service',phase:'P6'},bookingReview:{title:'Review price and book',phase:'P6'},services:{title:'My bookings',phase:'P6'},serviceDetail:{title:'Booking details',phase:'P6'},
  trips:{title:'Trips',phase:'P5'},tripDetail:{title:'Trip details',phase:'P5'},assignTrip:{title:'Assign vehicle and crew',phase:'P5'},vehicleOffer:{title:'Vehicle offer',phase:'P5'},
  vehicleDetail:{title:'Vehicle details',phase:'P5'},addVehicle:{title:'Add vehicle',phase:'P5'},movingJob:{title:'Moving job',phase:'P6'},
  myJobs:{title:'My jobs',phase:'P6'},driverJob:{title:'Driver job',phase:'P6'},upgradeDriver:{title:'Upgrade to Commercial Driver',phase:'P6'},
  conversation:{title:'Conversation',phase:'P7'},payment:{title:'Record payment',phase:'P7'},paymentDetail:{title:'Payment details',phase:'P7'},
  exceptions:{title:'Exceptions',phase:'P8'},exceptionDetail:{title:'Exception details',phase:'P8'},verification:{title:'Verification queue',phase:'P8'},verificationItem:{title:'Verification review',phase:'P8'},cases:{title:'Cases and appeals',phase:'P8'},
  staffEvents:{title:'Leave and rehire',phase:'P8'},notifications:{title:'Notifications',phase:'P7'},
};

export const MOBILE_PRIMARY=['home','work','messages','money'];
export const PUBLIC_ROUTES=new Set(['welcome','signup','otp','recover','consentDetails','recoverySupport']);

export function allowedRoutes(roleKey){
  const role=ROLE_CONFIG[roleKey]||ROLE_CONFIG.personal;
  const businessPeople=['ewayBills','invoices','invoiceNew','invoiceDetail','workforce','dutyBoard','payroll','khata','tripSettlement','addStaff','inviteSent','staffDetail','staffReview','roles','staffAccess','hiring','postOpening','findWorkers','openingDetail','applications','ownerCover','offboarding','candidateReview','employmentChange'];
  const workerPeople=['candidateProfile','openingDetail','workerDocuments','workerStatus','workerVerify'];
  const phase4ByRole={goods:['goodsOrder','transportRequirement','arrangement','buyWithDelivery','transporterRequirements','opportunityDetail','opportunityChat','ownVehicleAssignment','postAvailableTruck'],transporter:['goodsRequirements','postAvailableLoad','postLoadRequirement','transporterRequirements','postAvailableTruck','routeOpportunities','opportunityDetail','opportunityChat','sellerSourcing','transportOffer'],vehicle:['postAvailableTruck','routeOpportunities','opportunityDetail','opportunityChat','truckOffer'],movers:[]};
  const extra=roleKey==='personal'?['purpose','consentDetails','recoverySupport','businessStart','businessDetails','businessKyc','branches','bank','applicationStatus','candidateProfile','applyOpening','workerDocuments','workerStatus','workerVerify','work','search','productDetail','cartAdded','cart','orders','orderTracking','money','invitations','productCheckout','billDoc']:roleKey==='admin'?['applicationReview','candidateReview','commerceOps']:roleKey==='staff'?['staffInvite','staffOtp','staffOnboarding','staffSubmission']:['commercialDriver','personalDriver','helper'].includes(roleKey)?[...workerPeople,'applyOpening']:role.branches?['branches','branchEditor','bank','serviceExpansion',...businessPeople,...(phase4ByRole[roleKey]||[])]:[];
  const common=['grocery','groceryFresh','picker','pickerFresh','deliveryPartner','deliveryPartner2'].includes(roleKey)?['notifications']:['notifications','conversation','exceptions','exceptionDetail','paymentDetail'];
  const tripRoutes=['trips','tripDetail'];
  const opsExtra=role.branches?[...tripRoutes,'assignTrip','vehicleOffer','vehicleDetail','addVehicle','movingJob','payment','staffEvents']:
    roleKey==='personal'?['book','bookingReview','services','serviceDetail','movingJob','tripDetail','payment']:
    ['commercialDriver','helper'].includes(roleKey)?['myJobs','tripDetail','movingJob','vehicleOffer']:
    roleKey==='personalDriver'?['myJobs','driverJob','upgradeDriver']:
    roleKey==='staff'?[...tripRoutes,'assignTrip','movingJob','vehicleDetail','addVehicle','fleet','payment','workforce','dutyBoard','payroll','khata','tripSettlement','invoices','invoiceDetail','ewayBills']:
    roleKey==='admin'?['verification','verificationItem','cases','tripDetail','pricingRules']:[];
  const blocked=roleKey==='goods'?['movingJob','staffEvents']:[];
  const set=new Set([...role.nav.map(([id])=>id),'states',...extra,...common,...opsExtra]);blocked.forEach(r=>set.delete(r));
  if(roleKey==='movers')set.delete('trips');
  return set;
}

export function routeTitle(route){return ROUTES[route]?.title||'Page not found'}
