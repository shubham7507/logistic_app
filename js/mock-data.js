import {OPS_SEED} from './ops-data.js';
export const SEED={
  currentWorkspace:'personal', currentRoute:'home', demoRevision:6,
  auth:{status:'authenticated',mobile:'9876543210',mobileVerified:true,consentVersion:'2026-09-27',consentedAt:'2026-09-27T08:30:00.000Z',otpAttempts:0,otpSentAt:null,pendingMobile:null,isExistingIdentity:true},
  person:{id:'PER-1001',name:'Shubham Kumar'},
  purposeSelection:null,
  branchFilter:{goods:'all',transporter:'all',vehicle:'all',movers:'all'},
  mockUsers:{
    personal:{name:'Shubham Kumar',role:'General Customer',initials:'SK'},
    goods:{name:'Vijay Sharma',role:'Goods Owner',initials:'VS'},
    transporter:{name:'Amit Raj',role:'Transporter',initials:'AR'},
    vehicle:{name:'Rajesh Kumar',role:'Truck Owner',initials:'RK'},
    movers:{name:'Neha Singh',role:'Mover Owner',initials:'NS'},
    commercialDriver:{name:'Mohan Yadav',role:'Commercial Driver',initials:'MY'},
    personalDriver:{name:'Anil Kumar',role:'Personal Driver',initials:'AK'},
    helper:{name:'Ramesh Yadav',role:'Khalasi / Helper',initials:'RY'},
    staff:{name:'Pankaj Meena',role:'Operations Staff',initials:'PM'},
    admin:{name:'Admin Neha',role:'Platform Admin',initials:'AN'},
  },
  workspaces:['personal','goods','transporter','vehicle','movers','commercialDriver','personalDriver','helper','admin'],
  badges:{transporter:{work:3,messages:4},vehicle:{work:2,messages:5},goods:{work:3,messages:2},movers:{work:4},admin:{approvals:7}},
  branches:{goods:['All branches','Patna Warehouse','Bihta Plant','Ranchi Depot'],transporter:['All branches','Noida HQ','Jaipur Branch'],vehicle:['All branches','Patna Yard'],movers:['All branches','Noida Moving Branch','Gurugram Branch']},
  knownIdentities:[{mobile:'9876543210',personId:'PER-1001',name:'Shubham Kumar',workspaces:['personal','goods','vehicle']}],
  invitations:[
    {id:'INV-2409',business:'Raj Logistics',workspace:'transporter',branch:'Noida HQ',role:'Operations Staff',invitedBy:'Amit Raj',mobile:'9876543210',expires:'30 Sep 2026',status:'pending'},
    {id:'INV-2412',business:'SafeMove Packers',workspace:'movers',branch:'Gurugram Branch',role:'Moving Coordinator',invitedBy:'Neha Singh',mobile:'9876543210',expires:'02 Oct 2026',status:'pending'},
    {id:'INV-2381',business:'Sharma Foods',workspace:'goods',branch:'Patna Warehouse',role:'Dispatch Staff',invitedBy:'Vijay Sharma',mobile:'9876543210',expires:'25 Sep 2026',status:'expired'},
  ],
  audit:[{id:'AUD-1',event:'Mobile verified',at:'27 Sep 2026, 8:30 AM',actor:'Shubham Kumar'}],
  currentApplicationId:'APP-2001',
  businessApplications:[
    {id:'APP-2001',ownerId:'PER-1001',ownerName:'Shubham Kumar',legalName:'Sinha Cargo & Movers',services:[],status:'draft',resumeSection:'services',version:1,details:{entityType:'Proprietorship',pan:'',gstin:'',address:''},documents:[],branches:[],bank:{accountName:'',accountNumber:'',ifsc:'',upi:'',verificationStatus:'not_added'},decisions:[],updatedAt:'27 Sep 2026, 10:45 AM'},
    {id:'APP-1988',ownerId:'PER-1188',ownerName:'Aarav Singh',legalName:'Aarav Freight Services',services:['transport','fleet'],status:'under_review',resumeSection:'review',version:2,details:{entityType:'Partnership',pan:'AAEFA7821K',gstin:'09AAEFA7821K1Z8',address:'Sector 62, Noida, Uttar Pradesh'},documents:[{type:'PAN',name:'aarav-pan.pdf',status:'uploaded'},{type:'GST certificate',name:'aarav-gst.pdf',status:'uploaded'},{type:'Business address proof',name:'noida-office.pdf',status:'uploaded'}],branches:[{id:'BR-A1',name:'Noida HQ',address:'Sector 62, Noida',serviceArea:'Delhi NCR',manager:'Aarav Singh',status:'active',isDefault:true,activeWork:0}],bank:{accountName:'Aarav Freight Services',accountNumber:'451278963214',ifsc:'HDFC0001842',upi:'aaravfreight@hdfc',verificationStatus:'verified'},decisions:[{version:1,decision:'correction_requested',reason:'GST certificate was unclear',section:'kyc',reviewer:'Admin Neha',at:'25 Sep 2026'}],updatedAt:'27 Sep 2026, 9:10 AM'},
    {id:'APP-1975',ownerId:'PER-1175',ownerName:'Meera Gupta',legalName:'North Star Movers',services:['movers'],status:'correction_required',resumeSection:'bank',version:1,details:{entityType:'Proprietorship',pan:'BKQPG4412C',gstin:'',address:'Vaishali, Ghaziabad'},documents:[{type:'PAN',name:'meera-pan.pdf',status:'uploaded'},{type:'Business address proof',name:'rental-agreement.pdf',status:'uploaded'},{type:'Service declaration',name:'moving-services.pdf',status:'uploaded'}],branches:[{id:'BR-N1',name:'Ghaziabad Branch',address:'Vaishali, Ghaziabad',serviceArea:'Ghaziabad and East Delhi',manager:'Meera Gupta',status:'active',isDefault:true,activeWork:0}],bank:{accountName:'Meera Gupta',accountNumber:'659014783212',ifsc:'ICIC0002241',upi:'',verificationStatus:'correction_required'},decisions:[{version:1,decision:'correction_requested',reason:'Account-holder name must match the submitted business proof.',section:'bank',reviewer:'Admin Neha',at:'26 Sep 2026'}],updatedAt:'26 Sep 2026, 5:30 PM'},
  ],
  businessProfiles:{
    transporter:{businessId:'BIZ-001',legalName:'Raj Logistics',services:['transport','fleet','movers'],kycStatus:'approved',bank:{maskedAccount:'•••• 3214',verificationStatus:'verified'},branches:[{id:'BR-001',name:'Noida HQ',serviceArea:'Delhi NCR',manager:'Ravi Kumar',status:'active',isDefault:true,activeWork:7},{id:'BR-002',name:'Jaipur Branch',serviceArea:'Rajasthan',manager:'Pankaj Meena',status:'active',isDefault:false,activeWork:2}]},
    goods:{businessId:'BIZ-002',legalName:'Sharma Foods',services:['goods','fleet'],kycStatus:'approved',bank:{maskedAccount:'•••• 9088',verificationStatus:'verified'},branches:[{id:'BR-010',name:'Patna Warehouse',serviceArea:'Bihar',manager:'Vijay Sharma',status:'active',isDefault:true,activeWork:3},{id:'BR-011',name:'Bihta Plant',serviceArea:'Bihar',manager:'Sunil Kumar',status:'active',isDefault:false,activeWork:0}]},
    vehicle:{businessId:'BIZ-006',legalName:'Raj Transport',services:['fleet'],kycStatus:'approved',bank:{maskedAccount:'•••• 7781',verificationStatus:'verified'},branches:[{id:'BR-020',name:'Patna Yard',serviceArea:'Bihar and Jharkhand',manager:'Rajesh Kumar',status:'active',isDefault:true,activeWork:2}]},
    movers:{businessId:'BIZ-009',legalName:'SafeMove Packers',services:['movers'],kycStatus:'approved',bank:{maskedAccount:'•••• 2204',verificationStatus:'verified'},branches:[{id:'BR-030',name:'Noida Moving Branch',serviceArea:'Delhi NCR',manager:'Neha Singh',status:'active',isDefault:true,activeWork:4},{id:'BR-031',name:'Gurugram Branch',serviceArea:'Gurugram',manager:'Ankit Rao',status:'active',isDefault:false,activeWork:0}]},
  },
  selectedStaffId:'STAFF-001',selectedOpeningId:'JOB-301',selectedCandidateId:'CAND-003',
  peopleByWorkspace:{
    transporter:[
      {id:'STAFF-001',name:'Ravi Kumar',mobile:'9876501101',role:'manager',designation:'Operations Manager',branchIds:['BR-001'],services:['transport','fleet','movers'],payType:'monthly',payAmount:42000,status:'active',documentsStatus:'verified',bankStatus:'verified',emergencyStatus:'complete',activeAssignments:['LD-10461'],vehicleAssignments:[],dues:0},
      {id:'STAFF-002',name:'Sunita Verma',mobile:'9876501102',role:'accounts',designation:'Accounts Staff',branchIds:['BR-001','BR-002'],services:['transport','fleet','movers'],payType:'monthly',payAmount:35000,status:'active',documentsStatus:'verified',bankStatus:'verified',emergencyStatus:'complete',activeAssignments:[],vehicleAssignments:[],dues:12000},
      {id:'WORKER-001',name:'Mohan Yadav',mobile:'9876501103',role:'driver',designation:'Commercial Driver',branchIds:['BR-001'],services:['transport','movers'],payType:'monthly',payAmount:30000,status:'active',documentsStatus:'verified',bankStatus:'verified',emergencyStatus:'complete',activeAssignments:['TRIP-10461'],vehicleAssignments:['VEH-001'],dues:4500},
      {id:'WORKER-002',name:'Ramesh Yadav',mobile:'9876501104',role:'helper',designation:'Khalasi + Moving Helper',branchIds:['BR-001'],services:['transport','movers'],payType:'monthly',payAmount:22000,status:'active',documentsStatus:'pending_staff',bankStatus:'pending_staff',emergencyStatus:'pending_staff',activeAssignments:[],vehicleAssignments:[],dues:2200},
    ],
    goods:[{id:'STAFF-010',name:'Vijay Sharma',mobile:'9876502101',role:'manager',designation:'Warehouse Manager',branchIds:['BR-010'],services:['goods','fleet'],payType:'monthly',payAmount:38000,status:'active',documentsStatus:'verified',bankStatus:'verified',emergencyStatus:'complete',activeAssignments:['LOAD-001'],vehicleAssignments:[],dues:0}],
    vehicle:[{id:'WORKER-020',name:'Suresh Paswan',mobile:'9876503101',role:'driver',designation:'Truck Driver',branchIds:['BR-020'],services:['fleet'],payType:'monthly',payAmount:28000,status:'active',documentsStatus:'verified',bankStatus:'verified',emergencyStatus:'complete',activeAssignments:['TRIP-2201'],vehicleAssignments:['VEH-201'],dues:3000}],
    movers:[{id:'STAFF-030',name:'Neha Singh',mobile:'9876504101',role:'manager',designation:'Moving Coordinator',branchIds:['BR-030'],services:['movers'],payType:'monthly',payAmount:36000,status:'active',documentsStatus:'verified',bankStatus:'verified',emergencyStatus:'complete',activeAssignments:['MOVE-001'],vehicleAssignments:[],dues:0}],
  },
  staffInvitations:[{id:'SINV-501',workspace:'transporter',mobile:'9876501199',name:'Pankaj Meena',role:'operations',branchId:'BR-002',responsibilities:['Trip updates','Vehicle allocation'],payType:'monthly',employmentType:'permanent',status:'pending',expires:'04 Oct 2026',invitedBy:'Shubham Kumar',history:[{status:'invited',at:'27 Sep 2026, 2:30 PM',actor:'Shubham Kumar'}]}],
  staffSession:null,
  candidates:[
    {id:'CAND-001',name:'Amit Singh',mobile:'9876510001',capabilities:['driver'],licences:['Heavy vehicle'],locations:['Jaipur'],availability:'Immediate',workPreference:'Per trip',expectedPay:3500,status:'available',verified:true},
    {id:'CAND-002',name:'Iqbal Khan',mobile:'9876510002',capabilities:['helper','driver'],licences:['Light commercial'],locations:['Noida','Delhi'],availability:'01 Oct 2026',workPreference:'Monthly',expectedPay:26000,status:'available',verified:true},
    {id:'CAND-003',name:'Pooja Kumari',mobile:'9876510003',capabilities:['operations','documents'],licences:[],locations:['Patna'],availability:'Immediate',workPreference:'Monthly',expectedPay:30000,status:'available',verified:true},
    {id:'CAND-004',name:'Anil Kumar',mobile:'9876510004',capabilities:['driver'],licences:['Personal car'],locations:['Noida','Delhi'],availability:'Today until 8 PM',workPreference:'Daily',expectedPay:1800,status:'available',verified:true},
  ],
  vacancies:[
    {id:'JOB-301',workspace:'transporter',title:'Heavy Truck Driver',role:'driver',branchId:'BR-002',branch:'Jaipur Branch',location:'Jaipur, Rajasthan',count:2,payMin:3000,payMax:4500,payType:'per_trip',employmentType:'trip_only',startDate:'30 Sep 2026',endDate:'',requirements:['Heavy licence','2+ years experience'],approvalPolicy:'Manager can hire',status:'open'},
    {id:'JOB-302',workspace:'transporter',title:'Document Staff',role:'documents',branchId:'BR-001',branch:'Noida HQ',location:'Noida, Uttar Pradesh',count:1,payMin:28000,payMax:34000,payType:'monthly',employmentType:'permanent',startDate:'05 Oct 2026',endDate:'',requirements:['Document scanning','Hindi'],approvalPolicy:'Owner approval',status:'open'},
  ],
  jobApplications:[{id:'JAPP-701',openingId:'JOB-302',candidateId:'CAND-003',status:'shortlisted',joiningDate:'05 Oct 2026',expectedPay:32000,voiceIntro:'18 sec voice introduction',history:[{status:'applied',at:'26 Sep 2026'},{status:'reviewed',at:'26 Sep 2026'},{status:'shortlisted',at:'27 Sep 2026'}]}],
  goodsOrders:[
    {id:'GO-401',workspace:'goods',type:'sell',counterparty:'Metro Retail',goods:'Rice bags',quantity:20,unit:'tonnes',goodsPrice:760000,transportResponsibility:'seller',status:'confirmed',createdAt:'27 Sep 2026, 9:15 AM'},
    {id:'GO-402',workspace:'goods',type:'buy',counterparty:'Bihar Agro',goods:'Packaging material',quantity:8,unit:'tonnes',goodsPrice:224000,transportResponsibility:'buyer',status:'draft',createdAt:'27 Sep 2026, 11:40 AM'},
  ],
  transportRequirements:[
    {id:'TR-401',workspace:'goods',goodsOrderId:'GO-401',pickup:'Patna Warehouse, Bihar',drop:'Okhla, Delhi',pickupDate:'2026-09-30',truckType:'14-wheel open',capacity:20,goods:'Rice bags',dharamkata:true,paymentTerms:'₹12,000 advance; balance after POD',arrangement:'selected_transporters',selectedTransporters:['Raj Logistics'],status:'published',createdBy:'Sharma Foods'},
  ],
  availableLoads:[
    {id:'AL-401',workspace:'transporter',requirementId:'TR-401',route:'Patna → Delhi',pickup:'Patna',drop:'Delhi',date:'2026-09-30',truckType:'14-wheel open',capacity:20,goods:'Rice bags',authority:'Authorized by Sharma Foods',goodsOwnerDisplay:'Verified Goods Business',goodsOwnerPrivate:'Sharma Foods · +91 98••••3210',status:'open'},
  ],
  loadRequirements:[
    {id:'LR-401',workspace:'transporter',route:'Jaipur → Delhi',from:'Jaipur',to:'Delhi NCR',date:'2026-10-01',truckType:'22-ft closed',capacity:12,acceptedGoods:'FMCG, packaged food',status:'open',postedBy:'Raj Logistics',branch:'Jaipur Branch'},
  ],
  truckAvailability:[
    {id:'TA-401',workspace:'vehicle',vehicleId:'VEH-201',registration:'BR01 GX 4421',location:'Jaipur',availableDate:'2026-10-01',truckType:'22-ft closed',capacity:12,destinationPreference:'Delhi NCR',crew:'Driver + Khalasi ready',documents:'approved',status:'available'},
  ],
  goodsRequirements:[
    {id:'GR-401',workspace:'transporter',buyer:'Metro Retail',goods:'Premium rice',quantity:15,unit:'tonnes',delivery:'Noida by 04 Oct 2026',goodsBudget:615000,transportBudget:72000,status:'sourcing',seller:'Not selected'},
  ],
  opportunities:[
    {id:'OPP-401',type:'goods_response',sourceId:'LR-401',createdByWorkspace:'goods',participants:['goods','transporter'],participantWorkspaces:['goods','transporter'],title:'Rice 12 tonnes for Jaipur → Delhi',summary:'Sharma Foods can supply a compatible confirmed load.',status:'discussion',confirmations:{},terms:{route:'Jaipur → Delhi',freight:68000,advance:12000,advancePayer:'Goods Owner',dharamkata:true,reimbursements:'Toll and Dharamkata separate',cancellation:'Before dispatch: no charge'},canonicalLoadId:null,createdAt:'27 Sep 2026, 2:10 PM'},
    {id:'OPP-402',type:'truck_match',sourceId:'TA-401',createdByWorkspace:'vehicle',participants:['vehicle','transporter'],participantWorkspaces:['vehicle','transporter'],title:'BR01 GX 4421 matches Jaipur → Delhi',summary:'22-ft closed truck, driver and Khalasi available.',status:'matched',confirmations:{},terms:{route:'Jaipur → Delhi',freight:68000,advance:12000,advancePayer:'Transporter',dharamkata:false,reimbursements:'Toll reimbursed',cancellation:'Before dispatch: no charge'},canonicalLoadId:null,createdAt:'27 Sep 2026, 2:25 PM'},
  ],
  opportunityMessages:{
    'OPP-401':[
      {id:'MSG-401',sender:'Sharma Foods',text:'12 tonnes packaged rice is ready near Jaipur on 1 October.',kind:'text',at:'2:12 PM'},
      {id:'MSG-402',sender:'Raj Logistics',text:'Please confirm loading time and Dharamkata requirement.',kind:'text',at:'2:14 PM'},
      {id:'MSG-403',sender:'MoveAI summary',text:'Both parties agree on Jaipur pickup, Delhi delivery and a 12-tonne closed truck. Dharamkata is awaiting confirmation.',kind:'summary',at:'2:15 PM'},
    ],
    'OPP-402':[{id:'MSG-404',sender:'Raj Transport',text:'Truck documents are approved and crew can report by 8 AM.',kind:'voice',at:'2:26 PM'}],
  },
  canonicalLoads:[],
  selectedOpportunityId:'OPP-401',selectedRequirementId:'TR-401',selectedGoodsOrderId:'GO-401',
  ownerCovers:[],
  products:[
    {id:'PRD-101',name:'India Gate Basmati Rice',size:'5 kg',price:710,category:'Rice',fulfilmentPartner:'ABC Grocery',stock:'In stock'},
    {id:'PRD-102',name:'Fortune Chakki Atta',size:'10 kg',price:485,category:'Flour',fulfilmentPartner:'Fresh Mart',stock:'In stock'},
    {id:'PRD-103',name:'Tata Salt',size:'1 kg',price:28,category:'Essentials',fulfilmentPartner:'ABC Grocery',stock:'In stock'},
  ],
  customerOrders:[{id:'ORD-9001',customer:'Shubham Kumar',items:[{productId:'PRD-103',quantity:2}],total:56,status:'out_for_delivery',fulfilmentPartner:'ABC Grocery',eta:'Today, 12:40 PM'}],
  ownedVehicles:{
    goods:[{id:'VEH-G01',registration:'BR01 GH 9088',truckType:'14-wheel open',capacity:20,status:'idle',documents:'approved',documentExpiry:'2027-04-30',branchId:'BR-010',crew:'Driver + Khalasi ready'}],
    transporter:[{id:'VEH-T01',registration:'UP16 RT 2201',truckType:'22-ft closed',capacity:12,status:'idle',documents:'approved',documentExpiry:'2027-02-15',branchId:'BR-002',crew:'Driver + Khalasi ready'}],
    vehicle:[
      {id:'VEH-201',registration:'BR01 GX 4421',truckType:'22-ft closed',capacity:12,status:'idle',documents:'approved',documentExpiry:'2027-03-31',branchId:'BR-020',crew:'Driver + Khalasi ready'},
      {id:'VEH-202',registration:'BR01 GX 5522',truckType:'14-wheel open',capacity:20,status:'on_trip',documents:'approved',documentExpiry:'2027-01-31',branchId:'BR-020',crew:'Driver assigned'},
      {id:'VEH-203',registration:'BR01 GX 6633',truckType:'22-ft closed',capacity:10,status:'idle',documents:'expired',documentExpiry:'2026-09-20',branchId:'BR-020',crew:'Need Driver and Khalasi'},
    ],
  },
  marketplaceBusinesses:[
    {id:'BIZ-001',workspace:'transporter',name:'Raj Logistics',owner:'Amit Raj',verified:true,services:['transport','fleet','movers'],routes:['Patna','Jaipur','Delhi NCR']},
    {id:'BIZ-011',workspace:'transporter_partner',name:'Rohan Freight',owner:'Rohan Singh',verified:true,services:['transport'],routes:['Jaipur','Delhi NCR']},
    {id:'BIZ-012',workspace:'transporter_other',name:'FastRoad Transport',owner:'Imran Ali',verified:true,services:['transport'],routes:['Mumbai','Pune']},
  ],
  transportOffers:[],
  postHistory:[],
};

export const HOME_CONTENT={
  personal:{greeting:'Good morning, Shubham',summary:'Your personal services and activity in one simple place.',metrics:[['Open orders','2','One arriving today'],['Service requests','1','Carpenter tomorrow'],['Invitations','2','Business access'],['Payments','₹1,850','This month']],quick:[['search','⌕','Search products','Find products directly'],['orders','▥','My orders','Track orders'],['messages','◌','Messages','Updates and support'],['invitations','✉','Invitations','Review business access']]},
  goods:{greeting:'Good morning, Vijay',summary:'Vijay Sharma · Goods Owner testing Sharma Foods across every branch.',metrics:[['Active loads','3','One needs action'],['Owned vehicles','2','One idle'],['Staff','8','Across 3 branches'],['Open balance','₹40K','One settlement']],quick:[['work','▦','Loads','Create and track'],['fleet','▦','Fleet','Own use or available'],['people','♟','People','Staff and hiring'],['money','₹','Money','Freight and staff pay']]},
  transporter:{greeting:'Good morning, Amit',summary:'Amit Raj · Transporter testing Raj Logistics, Fleet and Movers with one shared team.',metrics:[['Loads waiting','3','Need vehicles'],['Available trucks','5','Two near Jaipur'],['Moving jobs','4','Today'],['Money due','₹1.24L','Six items']],quick:[['work','▦','Work','Loads and moving jobs'],['fleet','▦','Fleet','Owned and partner trucks'],['people','♟','People','Staff and marketplace workers'],['money','₹','Money','Advances and settlements']]},
  vehicle:{greeting:'Good morning, Rajesh',summary:'Rajesh Kumar · Truck Owner testing Raj Transport trucks, people and payments.',metrics:[['Trucks','4','Three GPS online'],['On trip','2','Live tracking'],['Available','1','Jaipur'],['To receive','₹86K','Three settlements']],quick:[['fleet','▦','My Trucks','Documents and GPS'],['work','▦','Work','Offers and next loads'],['people','♟','People','Drivers and Khalasis'],['money','₹','Money','Advances and earnings']]},
  movers:{greeting:'Good morning, Neha',summary:'Neha Singh · Mover Owner testing SafeMove Packers requests, crew and vehicles.',metrics:[['New requests','4','Auto-assigned'],['Today jobs','3','One loading'],['Available helpers','6','Across 2 branches'],['Payout due','₹22K','Partners and crew']],quick:[['work','▦','Moving jobs','Queue and allocation'],['fleet','▦','Vehicles','Owned and partners'],['people','♟','Crew','Drivers and helpers'],['money','₹','Money','Customer and payouts']]},
  commercialDriver:{greeting:'Good morning, Mohan',summary:'Your commercial work, availability and money.',metrics:[['Today trip','1','Patna to Delhi'],['Next offer','2','Review available'],['This month','₹38K','Earned'],['Documents','Valid','Licence checked']],quick:[['work','▦','My Work','Trip and offers'],['messages','◌','Messages','Trip groups'],['money','₹','My Money','Advance and wages'],['profile','○','Profile','Availability and documents']]},
  personalDriver:{greeting:'Good morning, Anil',summary:'Find personal driving work near you.',metrics:[['New jobs','8','Within 10 km'],['Applications','2','One shortlisted'],['This month','₹21K','Recorded'],['Availability','On','Until 8 PM']],quick:[['work','⌕','Find Work','Nearby requests'],['messages','◌','Messages','Customers and employers'],['money','₹','My Money','Work payments'],['profile','○','Profile','Skills and availability']]},
  helper:{greeting:'Good morning, Ramesh',summary:'Your Khalasi and moving-helper work.',metrics:[['Today task','1','Loading at 10 AM'],['New offers','3','Nearby'],['This month','₹19K','Recorded'],['Skills','3','Verified']],quick:[['work','▦','My Work','Trips and moving jobs'],['messages','◌','Messages','Assigned groups'],['money','₹','My Money','Advance and wages'],['profile','○','Profile','Skills and availability']]},
  staff:{greeting:'Welcome to your staff workspace',summary:'Only your assigned branch, role and work are visible.',metrics:[['Today’s work','0','Starts after approval'],['Joining status','Pending','Owner review'],['Messages','0','Business channels'],['Payment','Not active','Starts after approval']],quick:[['work','▦','My Work','Only assigned work'],['messages','◌','Messages','Permitted conversations'],['money','₹','My Money','Salary, advance and claims'],['profile','○','My Profile','Documents and joining status']]},
  admin:{greeting:'Good morning, Admin Neha',summary:'Platform Admin mock user · verification, safety and audit queues.',metrics:[['Approvals','7','Three business'],['Documents','12','Four expiring'],['Safety cases','2','One urgent'],['Audit alerts','1','Payment access']],quick:[['approvals','✓','Approvals','Business and capability'],['documents','▣','Documents','People and vehicles'],['users','♟','Users','Support and status'],['audit','◷','Audit','Sensitive actions']]},
};

// P5–P8 operations seed: trips, fleet documents, moving jobs, ledger, conversations, admin queue, exceptions.
{
  const {extraVehicles,goodsOrderExtras,...ops}=OPS_SEED;
  Object.assign(SEED,JSON.parse(JSON.stringify(ops)));
  for(const [k,list] of Object.entries(extraVehicles))SEED.ownedVehicles[k]=[...(SEED.ownedVehicles[k]||[]),...list];
  SEED.goodsOrders=[...SEED.goodsOrders,...goodsOrderExtras];
  SEED.goodsOrders.find(o=>o.id==='GO-401')&&(SEED.goodsOrders.find(o=>o.id==='GO-401').status='in_delivery');
}

// P5–P8 quick actions from the draw.io flows (each route is allowed for that workspace).
Object.assign(HOME_CONTENT.personal,{quick:[['book','＋','Book a service','Moving, driver or home service'],['services','☰','My bookings','Track, message, pay and rate'],['search','⌕','Search products','Find products directly'],['invitations','✉','Invitations','Review business access']]});
Object.assign(HOME_CONTENT.goods,{quick:[['work','▦','Loads','Sell, buy and arrange transport'],['trips','🧭','Trips','Track, receive and settle'],['fleet','▦','Fleet','Documents and calendar'],['money','₹','Money','Freight, advances and dues']]});
Object.assign(HOME_CONTENT.transporter,{quick:[['trips','🧭','Trips','Assign vehicle and crew'],['work','▦','Work','Loads and opportunities'],['fleet','▦','Fleet','One calendar, no overlaps'],['money','₹','Money','Advances and settlements']]});
Object.assign(HOME_CONTENT.vehicle,{quick:[['fleet','▦','My Trucks','Documents, GPS and calendar'],['trips','🧭','Trips','Offers and running trips'],['addVehicle','+','Add vehicle','Staff upload, owner review'],['money','₹','Money','Advances and earnings']]});
Object.assign(HOME_CONTENT.movers,{quick:[['work','▦','Moving jobs','Auto-assigned queue'],['fleet','▦','Vehicles','One calendar across services'],['people','♟','Crew','Staff, temporary and platform'],['money','₹','Money','Customer and payouts']]});
for(const k of ['commercialDriver','helper'])HOME_CONTENT[k].quick[0]=['myJobs','▦','My Jobs','Invites, offers and assigned trips'];
HOME_CONTENT.personalDriver.quick=[['myJobs','▦','My Jobs','Customer requests near you'],['work','⌕','Find Work','Hiring openings'],['money','₹','My Money','Work payments'],['upgradeDriver','↑','Go commercial','Upgrade with a commercial licence']];
HOME_CONTENT.staff.quick=[['work','▦','My Work','Only assigned work'],['trips','🧭','Trips','Your branch trips'],['money','₹','My Money','Salary, advance and claims'],['profile','○','My Profile','Documents and joining status']];
HOME_CONTENT.admin.quick=[['verification','✓','Verification','People, vehicles, businesses'],['cases','⚑','Cases','Disputes and appeals'],['approvals','✓','Approvals','Business applications'],['audit','◷','Audit','Immutable history']];
