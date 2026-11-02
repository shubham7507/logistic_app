// MoveAI One — the journeys that "Show me" plays and that the guide videos are recorded from.
// Each step: {role, title, say, at?: 'file.html#/route', do: [actions], focus?: selector}.
// Actions: click | fill+value | check | select+value | file+value | submit | see | clickAll | patch(fn) | run(fn).
// Values and 'at' may be functions of ctx (state(), vars(), set(), iso()).

const day = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const v = k => c => c.vars()[k];
const SUBMIT = 'form[data-sell-step] button[type=submit]';
const latestApp = c => (c.state().sellerApplications || [])[0]?.id;

// ---------- shared pieces ----------
const signUp = (mobile, purpose, role = 'New user') => [
  {role, title: 'Start as a brand-new person', say: 'We clear the demo in this browser and open MoveAI as someone who has never used it.', at: 'index.html#/home', do: [{run: () => window.MoveAIVNextTest?.startSignup(), reload: true}]},
  {role, title: 'Sign up with a mobile number', say: 'One sign-up for every role. The person gives consent for their data to be used.', at: 'index.html#/welcome', do: [{click: '[data-route="signup"]'}, {fill: '#mobile', value: mobile}, {check: '#consent'}, {submit: '#mobile-form'}]},
  {role, title: 'Confirm with the OTP', say: 'An OTP is sent to the phone (in this demo it is always 123456).', do: [{fill: '#otp', value: '123456'}, {submit: '#otp-form'}]},
  {role, title: 'Choose what you want to do', say: 'Shop, find work, deliver, sell or run a logistics business. This only picks the first screen; people can add roles later.', focus: '[data-purpose]', do: [{see: '[data-purpose]'}, {click: `[data-purpose="${purpose}"]`}]},
];
const sellerApplication = ({name, legal, cats, gstin, store, branch, address, city, pincode, stateCode, product, bihar}) => [
  {role: 'Seller', title: 'Seller type and what you sell', say: `${legal} is a registered shop. Each category shows the licence it needs and the commission.`, at: 'business.html#/sellStart',
    do: [{fill: 'input[name=legalName]', value: legal}, {check: 'input[name=sellerType][value=shop]'}, ...cats.map(c => ({check: `input[name=categories][value=${c}]`})), {click: SUBMIT}]},
  {role: 'Seller', title: 'PAN, GST and bank', say: 'The GSTIN is checked with the GST portal, the PAN must match it, and ₹1 is sent to the bank account to check the name.',
    do: [{fill: 'input[name=pan]', value: 'ABCDE1234F'}, {fill: 'input[name=gstin]', value: gstin}, {fill: 'input[name=account]', value: '123456789012'}, {fill: 'input[name=ifsc]', value: 'SBIN0001234'}, {click: SUBMIT}]},
  {role: 'Seller', title: 'Food licence (FSSAI)', say: 'Food sellers add their FSSAI licence. Without it, food stays locked while the rest of the store can go live.',
    do: [{fill: 'input[name=fssai]', value: '12345678901234'}, {fill: 'input[name=fssaiExpiry]', value: '2030-01-01'}, {click: SUBMIT}]},
  {role: 'Seller', title: 'Store and first branch', say: `The pincode must be in the same state as the GSTIN — a wrong pincode is refused. (Open all day here so the demo works at any hour.)`,
    do: [{fill: 'input[name=storeName]', value: store}, {fill: 'input[name=branchName]', value: branch}, {fill: 'input[name=address]', value: address}, {fill: 'input[name=city]', value: city}, {fill: 'input[name=pincode]', value: pincode}, {select: 'select[name=stateCode]', value: stateCode}, {fill: 'input[name=open]', value: '00:00'}, {fill: 'input[name=close]', value: '23:59'}, {click: SUBMIT}]},
  ...(bihar ? biharChecks : []),
  {role: 'Seller', title: 'How orders reach customers', say: 'Each option says who packs, who delivers, the cost and how cash on delivery works. Nothing is pre-selected; modes can be combined.',
    do: [{check: 'input[name=moveai]'}, {check: 'input[name=handover][value=pickup]'}, {check: 'input[name=windows][value="09-12"]'}, {check: 'input[name=packaging]'}, {check: 'input[name=pickup]'}, {click: SUBMIT}]},
  {role: 'Seller', title: 'Fees and seller agreement', say: 'Commission and payout timing per category, accepted online.', do: [{check: 'input[name=accept]'}, {click: SUBMIT}]},
  {role: 'Seller', title: 'First products', say: 'Packaged food needs batch, manufacture and expiry dates. Restricted items and prices above MRP are refused.',
    do: [{fill: 'form[data-sell-product] input[name=name]', value: product}, {select: 'form[data-sell-product] select[name=category]', value: 'food'}, {fill: 'form[data-sell-product] input[name=price]', value: '150'}, {fill: 'form[data-sell-product] input[name=mrp]', value: '170'}, {fill: 'form[data-sell-product] input[name=size]', value: '1 kg'},
      {fill: 'form[data-sell-product] input[name=batch]', value: 'TD-26'}, {fill: 'form[data-sell-product] input[name=mfgDate]', value: () => day(-20)}, {fill: 'form[data-sell-product] input[name=expiryDate]', value: () => day(300)}, {click: 'form[data-sell-product] button'}, {click: '[data-sell-goto="8"]'}]},
  {role: 'Seller', title: 'Review and submit', say: 'The seller sees everything once more and submits. Each section is reviewed on its own.', do: [{click: '[data-sell-submit]'}, {run: c => c.set('app', latestApp(c))}]},
];
const biharChecks = [
  {role: 'Seller', title: 'Extra checks in Bihar: Aadhaar via DigiLocker', say: 'Bihar is set to strict checks. The seller signs in on DigiLocker and approves sharing — MoveAI never sees the full Aadhaar number.',
    do: [{click: '[data-dl="start"]'}, {fill: '#dl-mobile', value: '9876543210'}, {click: '[data-dl="send"]'}, {fill: '#dl-otp', value: '123456'}, {click: '[data-dl="verify"]'}, {see: '[data-dl="allow"]'}, {click: '[data-dl="allow"]'}], focus: '.dl-result'},
  {role: 'Seller', title: 'Selfie, shop photos and supplier invoice', say: 'A live selfie is matched to the Aadhaar photo, geo-tagged photos prove the shop exists, and a distributor invoice shows where stock comes from.',
    do: [{file: 'input[name=selfie]', value: 'selfie.jpg'}, {click: '[data-trust-verify="selfie"]'}, {file: 'input[name=photoSignboard]', value: 'signboard.jpg'}, {file: 'input[name=photoInside]', value: 'inside.jpg'}, {file: 'input[name=photoStock]', value: 'stock.jpg'}, {click: '[data-trust-verify="shopPhotos"]'},
      {file: 'input[name=invoices]', value: 'distributor-invoice.pdf'}, {click: SUBMIT}]},
];
const adminOpens = role => ({role, title: 'MoveAI admin opens the review queue', say: 'In real life a MoveAI reviewer does this on their own login. For the demo we open the admin console in this browser.',
  at: 'index.html#/home', do: [{patch: s => { s.workspaces ||= []; if (!s.workspaces.includes('admin')) s.workspaces.push('admin'); }}]});
const approve = (sections, role = 'MoveAI admin') => ({role, title: 'Approve each section', say: 'Highest risk first. Every automatic check is shown with ✓ or ✗. Approving a section whose check failed needs a written reason.',
  at: 'admin.html#/sellerReview?ws=admin', focus: c => `#review-${c.vars().app} .evidence`,
  do: [{see: c => `#review-${c.vars().app} .evidence`}, ...sections.map(sec => ({click: c => `#review-${c.vars().app} form[data-sell-decide][data-section="${sec}"] button[value=approved]`})),
    {run: c => c.set('store', (c.state().sellerApplications || []).find(a => a.id === c.vars().app)?.storeKey)}]});
const customerPays = (storeName, role = 'Customer') => [
  {role, title: 'A customer orders', say: `A customer adds ${storeName}'s product to the cart and goes to checkout.`, at: 'index.html#/home',
    do: [{patch: s => { const p = s.products.find(x => x.fulfilmentPartner === storeName && x.status === 'active'); s.productCart = [{productId: p.id, quantity: 1, priceAtAdd: p.price}]; s.checkoutFromCart = true; s.currentWorkspace = 'personal'; }}]},
  {role, title: 'Pay by UPI', say: 'New stores are on probation, so cash on delivery is off. The UPI request goes to MoveAI\'s account, never to the seller directly.', at: 'index.html#/productCheckout',
    do: [{fill: 'textarea[name=address]', value: '22 Fraser Road, near the bank'}, {check: 'input[name=method][value=upi]'}, {fill: 'input[name=vpa]', value: 'buyer@okaxis'}, {click: 'form[data-po-form] button[type=submit]'}, {run: () => { const e = document.querySelector('#po-error'); if (e && !e.hidden && e.textContent.trim()) throw new Error(`Checkout refused: ${e.textContent.trim()}`); document.querySelectorAll('[data-upi-overlay]').forEach(x => x.remove()); }}]},
  {role, title: 'The bank confirms the payment', say: 'Only the bank can mark an order paid (unpaid orders cancel after 15 minutes). This demo button stands in for the bank.', at: 'index.html#/orders',
    do: [{see: '[data-po="bank-ok"]'}, {click: '[data-po="bank-ok"]'}]},
];

export const JOURNEYS = {
  'seller-up': {
    title: 'Open a shop and get the first order', who: 'Seller · MoveAI admin · Customer', minutes: 3,
    verify: s => { const p = Object.values(s.shopPartners || {}).find(x => x.name === 'Gupta Mart'); return p?.probation?.active && s.products.some(x => x.name === 'Basmati Rice' && x.fulfilmentPartner === 'Gupta Mart') && s.customerOrders.some(o => o.fulfilmentPartner === 'Gupta Mart' && o.status === 'accepted') ? '' : 'Gupta Mart did not end with a listed product and an accepted order'; },
    done: 'The shop applied, was reviewed, went live on probation, listed a product, and accepted a paid order.',
    steps: [
      ...signUp('9123456789', 'sell'),
      ...sellerApplication({legal: 'Gupta Traders', cats: ['food'], gstin: '09ABCDE1234F1Z5', store: 'Gupta Mart', branch: 'Sector 62', address: '12 Main Market, Sector 62, Noida', city: 'Noida', pincode: '201301', stateCode: '09', product: 'Toor Dal'}),
      adminOpens('MoveAI admin'),
      approve(['type', 'kyc', 'food', 'store', 'delivery', 'agreement', 'products']),
      {role: 'Seller', title: 'The store is live — on probation', say: 'New stores start with limits: no cash on delivery, a cap on order value and a longer payout hold. They lift after the first orders.', at: 'business.html#/sellStatus', focus: '.sell-app', do: [{see: '.sell-app'}]},
      {role: 'Seller', title: 'Add another product', say: 'Only approved categories are offered. MRP and pack dates are required; items close to expiry are hidden automatically.', at: c => `business.html#/shopCatalog?ws=${c.vars().store}`,
        do: [{fill: '[data-catalog-name]', value: 'Basmati Rice'}, {fill: '[data-catalog-size]', value: '5 kg'}, {select: '[data-catalog-category]', value: 'Rice, grains & cereals'}, {select: '[data-catalog-veg]', value: 'vegetarian'}, {fill: '[data-catalog-mrp]', value: '520'}, {fill: '[data-catalog-price]', value: '450'}, {fill: '[data-catalog-quantity]', value: '20'},
          {fill: '[data-catalog-batch]', value: 'BR-11'}, {fill: '[data-catalog-mfg]', value: () => day(-15)}, {fill: '[data-catalog-expiry]', value: () => day(330)}, {click: '[data-commerce="catalog-add"]'}]},
      ...customerPays('Gupta Mart'),
      {role: 'Seller', title: 'The seller accepts the order', say: 'Before the bank confirmed, the seller saw "waiting for payment — don\'t pack yet". Now Accept appears. The order then goes to on-shift staff, or the owner prepares it.', at: c => `business.html#/shopOrders?ws=${c.vars().store}`,
        do: [{click: '[data-commerce="accept"]'}], focus: '.order-card'},
    ]},
  'seller-bihar': {
    title: 'Seller in Bihar: strict checks', who: 'Seller · MoveAI admin', minutes: 3,
    verify: s => { const p = Object.values(s.shopPartners || {}).find(x => x.name === 'Patna Bazaar'); return p?.probation?.strict && p.verification?.policy === 'strict' ? '' : 'Patna Bazaar is not live under the strict policy'; },
    done: 'In strict states every seller proves who they are, that the shop exists and where stock comes from, and a reviewer checks it before going live.',
    steps: [
      ...signUp('9123456790', 'sell'),
      ...sellerApplication({legal: 'Patna Traders', cats: ['food'], gstin: '10ABCDE1234F1Z5', store: 'Patna Bazaar', branch: 'Boring Road', address: '4 Boring Road, Patna', city: 'Patna', pincode: '800001', stateCode: '10', product: 'Chana Dal', bihar: true}),
      adminOpens('MoveAI admin'),
      {role: 'MoveAI admin', title: 'Record the video call and field visit', say: 'The reviewer marks each check Passed with a note of what they saw: shop photos, invoice, video KYC and the field agent\'s visit.', at: 'admin.html#/sellerReview?ws=admin',
        do: ['shopPhotos', 'supplierInvoices', 'videoKyc', 'fieldVisit'].flatMap(k => [{fill: c => `#review-${c.vars().app} form[data-trust-record][data-key="${k}"] input[name=note]`, value: 'Checked on call / in person'}, {click: c => `#review-${c.vars().app} form[data-trust-record][data-key="${k}"] button[value=verified]`}])},
      approve(['type', 'kyc', 'food', 'store', 'trust', 'delivery', 'agreement', 'products']),
      {role: 'MoveAI admin', title: 'New stores on probation', say: 'In Bihar: up to 30 products, orders up to ₹2,000, no cash on delivery and payouts held 14 extra days, until 50 delivered orders.', at: 'admin.html#/sellerReview?ws=admin', focus: 'main', do: [{wait: 400}]},
    ]},
  'picker': {
    title: 'Add a picker to an electrical shop', who: 'Store owner · Store staff', minutes: 2,
    verify: s => { const p = (s.pickerStaff || []).find(x => x.mobile === '9876512345'); return p?.status === 'active' && s.customerOrders.some(o => o.pickerOffer?.pickerId === p.id) ? '' : 'The picker is not active with an order offered'; },
    done: 'The worker joined from a link on their own phone, verified their ID and bank, was approved, checked in and received an order.',
    steps: [
      {role: 'Store owner', title: 'Verma Electricals is live', say: 'We start with an electrical shop that has just been approved through "Sell products".', at: 'index.html#/home',
        do: [{run: () => window.MoveAIVNextTest?.reset()}, {async: true, patch: async s => {
          const SO = await import('./seller-onboarding.js'); s.person ||= {id: 'P-DEMO', name: 'Ravi Verma'};
          const a = SO.startApplication(s, {}); SO.saveType(s, a, {sellerType: 'shop', categories: ['electrical'], legalName: 'Verma Electricals'});
          SO.saveKyc(s, a, {pan: 'ABCDE1234F', gstin: '09ABCDE1234F1Z5', account: '123456789012', ifsc: 'SBIN0001234'}); SO.saveLicences(s, a, {brandProof: 'invoice.pdf'});
          SO.saveStore(s, a, {storeName: 'Verma Electricals', branchName: 'Sector 18', address: '5 Sector 18 Market, Noida', city: 'Noida', pincode: '201301', stateCode: '09', open: '00:00', close: '23:59', radiusKm: 5});
          SO.saveDelivery(s, a, {mode: 'moveai'}); SO.saveAgreement(s, a, {accept: true}); SO.addProduct(s, a, {name: 'LED Bulb 9W', category: 'electrical', price: 90, mrp: 120, size: '9 W', stock: 40});
          SO.submit(s, a); for (const sec of Object.keys(a.sections)) if (a.sections[sec].status === 'pending') SO.decide(s, a.id, sec, 'approved', 'Checked papers');
          sessionStorage.setItem('moveai-tour', JSON.stringify({...JSON.parse(sessionStorage.getItem('moveai-tour')), vars: {store: a.storeKey, worker: `picker${a.storeKey[0].toUpperCase()}${a.storeKey.slice(1)}`}}));
        }}]},
      {role: 'Store owner', title: 'Staff → Add worker', say: 'Name, mobile, role, home branch and pay. Electrical shops hire "fulfilment" staff who check, pack and hand over orders.', at: c => `business.html#/easyStaff?ws=${c.vars().store}`,
        do: [{click: '[data-easy-nav="storeHR"]'}, {fill: 'form[data-hr-form=invite] input[name=name]', value: 'Arjun Kumar'}, {fill: 'form[data-hr-form=invite] input[name=mobile]', value: '9876512345'}, {fill: 'form[data-hr-form=invite] input[name=rate]', value: '12000'}, {click: 'form[data-hr-form=invite] button'}], focus: '.pick-invite'},
      {role: 'Store staff', title: 'The worker opens the invite link', say: 'The link arrives by SMS and WhatsApp. On their own phone they enter the invited mobile and an OTP.', at: c => { const p = (c.state().pickerStaff || []).find(x => x.mobile === '9876512345'); return `business.html#/pickJoin/${p?.inviteToken}`; },
        do: [{fill: 'form[data-pick-join] input[name=mobile]', value: '9876512345'}, {fill: 'form[data-pick-join] input[name=otp]', value: '123456'}, {check: 'form[data-pick-join] input[name=consent]'}, {click: 'form[data-pick-join] button'}]},
      {role: 'Store staff', title: 'Accept and complete joining', say: 'Aadhaar by OTP, a live selfie and a bank account checked with ₹1. The owner only ever sees masked details.', at: c => `business.html#/pickProfile?ws=${c.vars().worker}`,
        do: [{click: '[data-commerce="accept-picker"]'}, {fill: '#picker-onboarding-form input[name=aadhaar]', value: '234567890123'}, {fill: '#picker-onboarding-form input[name=dob]', value: '1998-05-10'}, {fill: '#picker-onboarding-form input[name=otp]', value: '123456'}, {file: '#picker-onboarding-form input[name=selfie]', value: 'selfie.jpg'}, {check: '#picker-onboarding-form input[name=consent]'},
          {fill: '#picker-onboarding-form input[name=accountName]', value: 'Arjun Kumar'}, {fill: '#picker-onboarding-form input[name=accountNumber]', value: '123456789012'}, {fill: '#picker-onboarding-form input[name=ifsc]', value: 'SBIN0001234'}, {click: '#picker-onboarding-form button.button.primary'}]},
      {role: 'Store owner', title: 'The owner approves', say: 'The owner reviews the joining details and activates the worker.', at: c => `business.html#/shopTeam?ws=${c.vars().store}`,
        do: [{click: '[data-picker-review]'}, {see: '[data-commerce="picker-review-approve"]'}, {click: '[data-commerce="picker-review-approve"]'}, {patch: s => { const p = s.pickerStaff.find(x => x.mobile === '9876512345'); (s.staffWorkRules ||= {})[p.id] = [{effectiveFrom: '2026-01-01', weekdays: [0, 1, 2, 3, 4, 5, 6]}]; }}]},
      {role: 'Store staff', title: 'The worker checks in', say: '"I\'m here today" puts them on shift (the owner approves attendance for pay).', at: c => `business.html#/myHR?ws=${c.vars().worker}`, do: [{click: '[data-hr="checkin"]'}]},
      {role: 'Store owner', title: 'An order arrives and is offered to the worker', say: 'A customer has paid. When the owner accepts, the order is offered to the worker on shift.', at: c => `business.html#/shopOrders?ws=${c.vars().store}`,
        do: [{async: true, patch: async s => { const O = await import('./product-orders.js'); const p = s.products.find(x => x.fulfilmentPartner === 'Verma Electricals'); if (!p) throw new Error('No product found for Verma Electricals'); const r = O.placeOrder(s, {productId: p.id, qty: 1, address: '9 Sector 50, Noida', method: 'upi', vpa: 'c@okaxis'}); if (r.error) throw new Error(`Order could not be placed: ${r.error}`); O.bankConfirmPayment(s, r.order, true); }}]},
      {role: 'Store owner', title: 'Accept the order', say: 'Accepting sends it to on-shift staff automatically.', at: c => `business.html#/shopOrders?ws=${c.vars().store}`, do: [{click: '[data-commerce="accept"]'}]},
      {role: 'Store staff', title: 'The task appears for the worker', say: 'They accept the task, check each item and quantity, pack and hand it to the rider.', at: c => `business.html#/pickTasks?ws=${c.vars().worker}`, focus: '.order-card', do: [{see: '.order-card'}]},
    ]},
  'customer': {
    title: 'Shop, pay and report an expired item', who: 'Customer', minutes: 2,
    verify: s => s.customerOrders.some(o => (o.expiredReports || []).length) && s.ledger.some(x => x.type === 'refund') ? '' : 'No expired-item report with a refund',
    done: 'The customer ordered, paid by UPI, received the order and reported an expired item — refunded at once, the product paused and the seller given a strike.',
    steps: [
      {role: 'Customer', title: 'Browse the shop', say: 'Products from many local stores; each store prepares its own package.', at: 'index.html#/home', do: [{run: () => window.MoveAIVNextTest?.reset(), reload: true}]},
      {role: 'Customer', title: 'Open a product and add it to the cart', say: 'Price, MRP, pack size and the store that sells it.', at: 'index.html#/search',
        do: [{run: c => { const p = c.state().products.find(x => x.fulfilmentPartner === 'ABC Grocery' && x.stock === 'In stock' && x.status !== 'draft' && (x.approval || 'approved') === 'approved' && document.querySelector(`[data-po-detail="${x.id}"]`)); c.set('pid', p?.id); }},
          {click: c => `[data-po-detail="${c.vars().pid}"]`}, {click: c => `[data-po-add="${c.vars().pid}"]`}]},
      {role: 'Customer', title: 'Checkout and pay by UPI', say: 'One payment for all stores. The money goes to MoveAI and is held until delivery.', at: 'index.html#/cart',
        do: [{click: '[data-po-checkout]'}, {fill: 'textarea[name=address]', value: '14 Park Street, Sector 21'}, {check: 'input[name=method][value=upi]'}, {fill: 'input[name=vpa]', value: 'buyer@okaxis'}, {click: 'form[data-po-form] button[type=submit]'}, {run: () => { const e = document.querySelector('#po-error'); if (e && !e.hidden && e.textContent.trim()) throw new Error(`Checkout refused: ${e.textContent.trim()}`); document.querySelectorAll('[data-upi-overlay]').forEach(x => x.remove()); }}]},
      {role: 'Customer', title: 'The bank confirms', say: 'Until then the order says "waiting for your bank" and the store is told not to pack.', at: 'index.html#/orders', do: [{click: '[data-po="bank-ok"]'}]},
      {role: 'Customer', title: 'The order is delivered', say: 'The store packs it and a rider delivers it with a delivery code (see the seller and picker journeys).', at: 'index.html#/home',
        do: [{patch: s => { const o = s.customerOrders.find(x => x.status === 'paid'); if (o) { o.status = 'delivered'; o.deliveredAt = Date.now(); } }}]},
      {role: 'Customer', title: 'Report an expired item', say: 'With a photo of the expiry date. The item is refunded, the product is paused until the store re-checks the batch, and the store gets a strike.', at: 'index.html#/orders',
        do: [{click: '.expired-report summary'}, {file: '.expired-report input[name=photo]', value: 'expiry-date.jpg'}, {click: '.expired-report button'}], focus: '.expired-report'},
    ]},
  'logistics': {
    title: 'Register a logistics business', who: 'Business owner · MoveAI admin', minutes: 2,
    verify: s => s.businessApplications?.find(a => a.legalName === 'Sinha Cargo & Movers' || a.id === s.currentApplicationId)?.status === 'approved' ? '' : 'The business application was not approved',
    done: 'One legal business enabled transport, fleet and movers, passed KYC, and got its workspace after admin approval.',
    steps: [
      {role: 'Business owner', title: 'Add your business', say: 'One legal business can enable several services: transport, own fleet, packers & movers.', at: 'index.html#/home',
        do: [{run: () => { window.MoveAIVNextTest?.reset(); window.MoveAIVNextTest?.switchWorkspace('personal'); }, reload: true}]},
      {role: 'Business owner', title: 'Name and services', say: 'Choose every service the business offers.', at: 'business.html#/businessStart',
        do: [{fill: '#legal-name', value: 'Sinha Cargo & Movers'}, ...['transport', 'fleet', 'movers'].map(x => ({check: `input[name="services"][value="${x}"]`})), {submit: '#business-start-form'}]},
      {role: 'Business owner', title: 'PAN, GST and address', say: 'Checked against the GST portal.', do: [{fill: 'input[name="pan"]', value: 'ABCDE1234F'}, {fill: 'input[name="gstin"]', value: '09ABCDE1234F1Z5'}, {fill: 'textarea[name="address"]', value: 'Sector 62, Noida, Uttar Pradesh'}, {submit: '#business-details-form'}]},
      {role: 'Business owner', title: 'Documents', say: 'Registration and permits for each service (sample documents in this demo).', do: [{clickAll: '[data-action="use-sample-document"]'}, {click: '[data-action="continue-kyc"]'}]},
      {role: 'Business owner', title: 'Branch and bank', say: 'The first branch, then the payout account checked with ₹1.', do: [{submit: '#branch-form'}, {fill: 'input[name="accountNumber"]', value: '451278963214'}, {fill: 'input[name="ifsc"]', value: 'HDFC0001842'}, {submit: '#bank-form'}]},
      {role: 'Business owner', title: 'Submit for review', say: 'MoveAI reviews the exact version submitted.', do: [{click: '[data-action="submit-business-application"]'}, {run: c => c.set('bapp', c.state().currentApplicationId)}]},
      {role: 'MoveAI admin', title: 'Admin approves', say: 'The reviewer checks documents, branch and bank, then approves.', at: 'admin.html#/approvals?ws=admin',
        do: [{click: c => `[data-application="${c.vars().bapp}"]`}, {click: '[data-action="admin-decision"][data-decision="approved"]'}]},
      {role: 'Business owner', title: 'The business workspace', say: 'Loads, trips, fleet, staff and money in one place. Staff are invited by link, just like store staff.', at: 'business.html#/home?ws=transporter', focus: 'main', do: [{wait: 400}]},
    ]},
};

// ---------- "Show me around": every function of a role, one screen per step ----------
const fresh = role => ({role, title: 'Load the full demo', say: 'We open the demo with sample stores, staff, orders and businesses so every screen has something to show.', at: 'index.html#/home', do: [{run: () => window.MoveAIVNextTest?.reset(), reload: true}]});
const around = ({role, ws, file, items}) => [fresh(role), ...items.map(([route, title, say, focus]) => ({role, title, say, at: `${file}#/${route}?ws=${ws}`, focus: focus || 'main h1', do: [{see: focus || 'main h1'}]}))];

const SHOP_OWNER = [
  ['home', 'Store dashboard', 'Today at a glance: new orders, low stock, staff on shift and money due. Only this store\'s products and orders are shown.'],
  ['shopOrders', 'Orders', 'Every online order: accept or reject, offer it to a worker on shift (or prepare it yourself), pack, and hand over to the rider with a code.'],
  ['shopIssues', 'Needs attention', 'Orders that are stuck — no staff free, packing delayed, courier late or an unavailable item waiting for the customer.'],
  ['shopCatalog', 'Products and stock', 'Add products with MRP and pack dates, change prices and stock per branch, import from CSV. Items close to expiry hide automatically.', '#catalog-add-product'],
  ['shopCounter', 'In-store sale', 'Sell at the counter: build a cart (or speak the list), take cash/UPI/card, give a receipt, and close the cash drawer at the end of the shift.'],
  ['shopCounterDelivery', 'Counter delivery', 'A customer in the shop wants it delivered: make the order here and it goes through the same packing and rider flow.'],
  ['shopSales', 'Sales', 'Online, pickup and counter sales together, by day and branch.'],
  ['shopEarnings', 'Money', 'Settlements from MoveAI after delivery (minus commission), direct receipts and fees. New stores on probation see the extra payout hold here.'],
  ['plusReturns', 'Returns', 'Customer returns and claims with photos: approve, replace or dispute. Expired-item reports also arrive here.'],
  ['plusAnalytics', 'Analytics', 'Best sellers, cancellations, ratings and payouts over time.'],
  ['plusStore', 'Store setup', 'Verification, categories you can sell, opening hours, pause or "busy" mode, and delivery settings (couriers, own delivery, pickup) — changes are reviewed by MoveAI.'],
  ['shopProfile', 'Store profile', 'The store details customers see.'],
  ['shopBranches', 'Branches', 'Each branch has its own stock, staff and pickup address. Choose the branch you are working on.'],
  ['easyStaff', 'Staff', 'Simple staff tools: add a worker, today\'s attendance, pay, advances — or just say "Pooja aaj present".'],
  ['shopTeam', 'Order team', 'Who can prepare orders today, their open tasks, joining reviews and manager invites.'],
  ['shopSchedule', 'Schedule', 'Publish shifts; workers confirm or ask for cover.'],
  ['hiring', 'Hiring', 'Post an opening, see applicants and available verified workers nearby.'],
  ['shopOffboarding', 'Offboarding', 'When someone leaves: set the last day, settle work and pay, then close the employment.'],
  ['branchesTeams', 'Branches & teams', 'Home branch, temporary cover at another branch, and teams.'],
  ['staffPay', 'Pay workers', 'One balance per worker: wages, advances and payments, with history they can also see.'],
  ['monthlyPayroll', 'Monthly payroll', 'Lock attendance for the month and pay everyone in one run (simulated).'],
  ['helpDesk', 'Help', 'Raise a problem with MoveAI and follow it until it is solved.'],
];
const STORE_MANAGER = [
  ['home', 'Manager dashboard', 'Orders and shifts for the branch the manager runs. The owner keeps pay approval.'],
  ['shopOrders', 'Orders', 'Accept orders and assign workers at this branch.'],
  ['shopIssues', 'Needs attention', 'Stuck orders at this branch.'],
  ['shopCatalog', 'Products and stock', 'Update stock counts for this branch.'],
  ['shopCounter', 'In-store sale', 'Run the counter and close the cash drawer.'],
  ['shopCounterDelivery', 'Counter delivery', 'Make a delivery order for a customer in the shop.'],
  ['shopSales', 'Sales', 'Branch sales.'],
  ['shopSchedule', 'Schedule', 'Publish shifts and handle cover requests.'],
  ['managerTimecards', 'Timecards', 'Check the hours workers submitted before pay.'],
  ['easyStaff', 'Staff', 'Attendance and advances for this branch (adding staff and paying is for the owner).'],
  ['hiring', 'Hiring', 'Openings and applicants for this branch.'],
  ['plusReturns', 'Returns', 'Returns at this branch.'],
  ['shopBranches', 'Branches', 'The branch the manager works at.'],
  ['branchesTeams', 'Branches & teams', 'Cover and teams for this branch.'],
  ['staffPay', 'Pay workers', 'See balances; the owner approves payments.'],
  ['managerProfile', 'Manager profile', 'What this manager is allowed to do.'],
  ['myHR', 'My work & pay', 'The manager\'s own attendance, leave and pay.'],
  ['helpDesk', 'Help', 'Raise a problem with MoveAI.'],
];
const STORE_STAFF = [
  ['home', 'Staff home', 'What to do now: tasks waiting and today\'s shift.'],
  ['pickTasks', 'Tasks', 'Orders offered to me: accept, tick each item and quantity, pack, and hand to the rider with the store code.'],
  ['pickSchedule', 'My schedule', 'My shifts: confirm, or ask for cover if I can\'t come.'],
  ['myHR', 'My work & pay', '"I\'m here today", leave requests, my pay and advances — the same numbers the owner sees.'],
  ['pickProfile', 'Profile', 'My invitation, ID and bank status, and the branch I work at.'],
  ['helpDesk', 'Help', 'Raise a problem.'],
];
const CUSTOMER = [
  ['home', 'Home', 'Start anything: shop, book movers, hire a driver, home services — plus "Sell on MoveAI" and "Work with MoveAI".'],
  ['search', 'Shop', 'Products from many local stores in one cart; each store sends its own package.'],
  ['orders', 'My orders', 'Track each package, cancel before pickup, return, or report an expired item for an instant refund.'],
  ['book', 'Book a service', 'Packers & movers, a driver, or a home service, with the full price before booking.'],
  ['services', 'My bookings', 'Every booking from request to rating, with progress and proof at each stage.'],
  ['messages', 'Messages', 'Chat with the store, crew or driver for that order or booking only.'],
  ['account', 'Account', 'Profile, addresses, saved payment, receipts and invoices, and "Buying for" a business.'],
  ['helpDesk', 'Help', 'Raise a problem and follow it.'],
];
const ADMIN = [
  ['home', 'Overview', 'Today\'s queues: approvals, verifications, safety cases and payments.'],
  ['sellerReview', 'Seller onboarding review', 'Applications sorted by risk with automatic checks and identity/shop evidence; verification policy by state (Bihar strict); stores on probation.'],
  ['approvals', 'Business approvals', 'Logistics businesses and service additions: KYC, branches, bank and capabilities.'],
  ['verification', 'Verification', 'Decisions need strong sign-in; admins verify, they never take over an account.'],
  ['commerceOrders', 'Store orders', 'Every store package and its delivery history.'],
  ['commercePartners', 'Store partners', 'Sellers, store staff and delivery partners.'],
  ['commercePayments', 'Store payments', 'Receipts, refunds, fees, cash and payouts.'],
  ['payOps', 'MoveAI Pay', 'Money held for customers, refunds, partner wallets and payouts.'],
  ['commerceIssues', 'Store issues', 'Returns, unavailable items and delivery exceptions.'],
  ['plusApprovals', 'Listing approvals', 'Listings checked for MRP, required details, restricted items and duplicates.'],
  ['plusClaims', 'Returns & claims', 'Customer evidence, exceptions and refunds, with limits that flag repeat claims.'],
  ['plusSettings', 'Commerce settings', 'Commission and payout hold by category, tax rates, limits and coupons.'],
  ['plusReports', 'Commerce reports', 'Sales, commission, returns, delivery performance and fraud flags.'],
  ['cases', 'Operations cases', 'Safety and dispute escalations.'],
  ['documents', 'Documents', 'Current versions, corrections and expiry of documents.'],
  ['users', 'Users', 'One mobile identity with several roles, without duplicates.'],
  ['audit', 'Audit', 'Who did what, where and when — kept unchanged.'],
  ['helpDesk', 'Help desk', 'Cases raised by every role.'],
];
Object.assign(JOURNEYS, {
  'role-shop-owner': {title: 'Shop owner: every function', who: 'Shop owner', kind: 'around', minutes: 3, done: 'Those are all the shop owner\'s screens. Try "Open a shop and get the first order" or "In-store sale" to see them in action.', steps: around({role: 'Shop owner', ws: 'grocery', file: 'business.html', items: SHOP_OWNER})},
  'role-store-manager': {title: 'Store manager: every function', who: 'Store manager', kind: 'around', minutes: 2, done: 'Managers run orders, stock and shifts for their branch; the owner keeps pay approval.', steps: around({role: 'Store manager', ws: 'groceryManager', file: 'business.html', items: STORE_MANAGER})},
  'role-store-staff': {title: 'Store staff: every function', who: 'Store staff / picker', kind: 'around', minutes: 1, done: 'Store staff join from a link, check in, and pick and pack orders.', steps: around({role: 'Store staff', ws: 'picker', file: 'business.html', items: STORE_STAFF})},
  'role-customer': {title: 'Customer: every function', who: 'Customer', kind: 'around', minutes: 1, done: 'Customers shop, book services and track everything in one account.', steps: around({role: 'Customer', ws: 'personal', file: 'index.html', items: CUSTOMER})},
  'role-admin': {title: 'MoveAI admin: every function', who: 'MoveAI admin', kind: 'around', minutes: 3, done: 'Admin reviews sellers and businesses, sets policy by state, and watches orders, money and claims.', steps: around({role: 'MoveAI admin', ws: 'admin', file: 'admin.html', items: ADMIN})},
  'task-booking': {title: 'Book packers & movers', who: 'Customer', minutes: 1,
    verify: s => (s.serviceRequests || []).some(r => /move/i.test(r.title || r.service || '') && r.id !== 'SR-701' && r.status) ? '' : 'No new moving booking',
    done: 'The move is booked: the price was shown first, paid through MoveAI, and every stage is tracked with proof.',
    steps: [fresh('Customer'),
      {role: 'Customer', title: 'Describe the move', say: 'From and to, date, home size, floors and lift, and what needs moving. Packages (basic, standard, premium) change what the crew does.', at: 'index.html#/book?ws=personal',
        do: [{check: 'input[name=service][value=moving]'}, {fill: 'input[name=from]', value: 'Sector 62, Noida'}, {fill: 'input[name=to]', value: 'DLF Phase 3, Gurugram'}, {fill: 'input[name=date]', value: () => day(5)}, {select: 'select[name=size]', value: '1 BHK'}, {check: 'input[name=pkg][value=standard]'}, {click: '#booking-form button:not([type=button]):not([data-route]):not([data-op])'}]},
      {role: 'Customer', title: 'See the full price, then pay', say: 'Nothing is booked until the customer sees the price and pays through MoveAI (simulated).', at: 'index.html#/bookingReview', do: [{see: '[data-op="booking-publish"]'}, {click: '[data-op="booking-publish"]'}]},
      {role: 'Customer', title: 'Track every stage', say: 'Assigned to a mover branch, slot confirmed, crew allocated, packing, loading proof, GPS, unloading, OTP at delivery, then payment and payouts.', focus: 'main', do: [{see: 'main h1, main h2'}]},
    ]},
  'task-counter': {title: 'In-store sale at the counter', who: 'Shop owner / manager', minutes: 1,
    verify: s => (s.counterSales || []).length ? '' : 'No counter sale recorded',
    done: 'A walk-in sale: cart, payment, receipt, and stock reduced for that branch. The cash drawer is reconciled at the end of the shift.',
    steps: [fresh('Shop owner'),
      {role: 'Shop owner', title: 'Open the cash shift', say: 'Count the cash in the drawer to start.', at: 'business.html#/shopCounter?ws=grocery', do: [{fill: '[data-counter-opening]', value: '500'}, {click: '[data-commerce="counter-shift-open"]'}]},
      {role: 'Shop owner', title: 'Add items', say: 'Search or pick a product (or speak the list in Hindi or English) and set the quantity.', do: [{fill: '[data-counter-qty]', value: '2'}, {click: '[data-commerce="counter-add"]'}]},
      {role: 'Shop owner', title: 'Take payment', say: 'Cash, UPI or card — or split between two. Discounts need a reason.', do: [{click: '[data-commerce="counter-prepare"]'}, {see: '[data-commerce="counter-confirm"]'}, {click: '[data-commerce="counter-confirm"]'}]},
      {role: 'Shop owner', title: 'Receipt and stock', say: 'The sale is recorded, stock goes down at this branch and it shows in Sales.', at: 'business.html#/shopSales?ws=grocery', focus: 'main', do: [{see: 'main h1'}]},
    ]},
});

// Roles shown in the role picker, the testing panel and the guide (batch 1 adds the logistics roles).
export const ROLES = [
  {id: 'customer', label: 'Customer', app: 'MoveAI', around: 'role-customer', tasks: ['customer', 'task-booking']},
  {id: 'shop-owner', label: 'Shop owner', app: 'MoveAI Business', around: 'role-shop-owner', tasks: ['seller-up', 'seller-bihar', 'task-counter']},
  {id: 'store-manager', label: 'Store manager', app: 'MoveAI Business', around: 'role-store-manager', tasks: ['task-counter']},
  {id: 'store-staff', label: 'Store staff / picker', app: 'MoveAI Business', around: 'role-store-staff', tasks: ['picker']},
  {id: 'admin', label: 'MoveAI admin', app: 'MoveAI Admin', around: 'role-admin', tasks: ['seller-bihar']},
];

// ---------- batch 1: logistics roles ----------
// Some roles can't be opened with ?ws= while another role has a live job (the app blocks switching mid-trip),
// so these tours switch with the app's own function after loading the demo.
const enterAs = (role, ws, label) => ({role, title: `Open MoveAI as ${label}`, say: 'We load the full demo and switch to this role, the same way a person with several roles switches in the menu.', at: 'index.html#/home',
  do: [{run: () => { window.MoveAIVNextTest?.reset(); if (ws === 'staff') window.MoveAIVNextTest?.openStaff('transporter', 'STAFF-001'); else window.MoveAIVNextTest?.switchWorkspace(ws); }, reload: true}]});
const aroundAs = ({role, ws, label, file, items}) => [enterAs(role, ws, label), ...items.map(([route, title, say, focus]) => ({role, title, say, at: `${file}#/${route}`, focus: focus || 'main h1', do: [{see: focus || 'main h1'}]}))];
const LOGI_COMMON = {
  people: ['people', 'People', 'The team: invite staff by link, hiring, roles and temporary cover when the owner is away.'],
  staff: ['easyStaff', 'Staff', 'Simple staff tools: add a worker, today\'s attendance, pay and advances — or just say "Raju aaj present".'],
  messages: ['messages', 'Messages', 'Every chat belongs to one job, branch and role — nothing gets mixed up.'],
  money: ['money', 'Money', 'Every payment once: what is due, approved, paid and confirmed by the other side, linked to its trip or job.'],
  invoices: ['invoices', 'Billing', 'Freight invoices, credit terms, GST and TDS. Money moves by your own bank transfer; MoveAI records it.'],
  business: ['business', 'Business', 'Legal business, services enabled, branches and payout account.'],
  branches: ['branchesTeams', 'Branches & teams', 'Home branch for each person, temporary cover and teams.'],
  pay: ['staffPay', 'Pay workers', 'One balance per worker: wages, trip allowances, advances and payments.'],
  payroll: ['monthlyPayroll', 'Monthly payroll', 'Lock attendance and pay everyone for the month (simulated).'],
  help: ['helpDesk', 'Help', 'Raise a problem with MoveAI and follow it.'],
};
const L = k => LOGI_COMMON[k];
const GOODS = [['home', 'Goods owner home', 'Loads to ship, trips on the road and payments due across every branch.'], L('staff'),
  ['work', 'Loads', 'Create the goods first, then choose how to move them: your own truck, selected transporters, or the open market.'],
  ['trips', 'Trips', 'One trip per load, seen by everyone involved — pickup, weighment, transit, delivery and proof.'],
  ['fleet', 'Fleet', 'Your own vehicles: documents, availability and one calendar.'], L('people'), L('messages'), L('money'), L('invoices'), L('business'), L('branches'), L('pay'), L('payroll'), L('help')];
const TRANSPORTER = [['home', 'Transporter home', 'Work to quote, trips running today, trucks free and money due.'], L('staff'),
  ['work', 'Load marketplace', 'Loads from goods owners, your own capacity posts, and matches — send an offer or take a load.'],
  ['trips', 'Trips', 'Assign truck and driver, follow milestones (pickup, dharamkata, transit, delivery) and settle.'],
  ['fleet', 'Fleet', 'Trucks with documents and expiry alerts, availability and a shared calendar that stops double-booking.'], L('people'), L('messages'), L('money'), L('invoices'), L('business'), L('branches'), L('pay'), L('payroll'), L('help')];
const TRUCK_OWNER = [['home', 'Truck owner home', 'Your trucks, where they are, and the next loads that fit them.'], L('staff'),
  ['fleet', 'My trucks', 'RC, insurance, permit and PUC with expiry reminders; mark a truck available.'],
  ['work', 'Work and next loads', 'Publish an idle truck and see matching loads near where it is or will be, with a match score.'],
  ['trips', 'Trips', 'Trips your trucks are on, with driver and milestones.'], L('people'), L('messages'), L('money'), L('invoices'), L('business'), L('branches'), L('pay'), L('payroll'), L('help')];
const MOVERS = [['home', 'Movers home', 'Moving requests, crew and vehicles for today.'], L('staff'),
  ['work', 'Moving jobs', 'Customers see a fixed package price; MoveAI assigns the request to a branch. Open a job to run it stage by stage.'],
  ['fleet', 'Fleet', 'Vehicles and one calendar for moving work.'], L('people'), L('messages'), L('money'), L('business'), L('branches'), L('pay'), L('payroll'), L('help')];
const DRIVER = (kind) => [['home', `${kind} home`, 'Today\'s work, availability and money.'],
  ['myJobs', kind === 'Personal driver' ? 'Bookings' : 'My jobs', kind === 'Personal driver' ? 'Customer requests near you and confirmed bookings.' : 'Offers and invites to accept or decline, and the trips you are assigned to.'],
  ['work', 'Find work', 'Openings from businesses and customers that match your profile.'], L('messages'),
  ['money', 'My money', 'Wages, trip allowances, advances and what you have been paid — your khata.'],
  ['profile', 'Work profile', 'What businesses see: work type, area, availability and expected pay.'],
  ['myWork', 'My work & pay', 'One MoveAI profile for every job: attendance, leave, pay and documents.'], L('help')];
const STAFF = [['home', 'Staff home', 'Invited staff see only their branch, role and work.'],
  ['work', 'My work', 'Tasks assigned to me and attendance ("I\'m here").'],
  ['trips', 'Trips', 'Trips in my branches (what I can do depends on my role).'], L('messages'),
  ['money', 'My money', 'My wages, advances and payments.'],
  ['profile', 'My profile', 'My joining details and approval status.'],
  ['myWork', 'My work & pay', 'Attendance, leave and pay in one place.'], L('help')];
const DELIVERY = [['home', 'Delivery home', 'Store deliveries assigned to me, and whether I am online.'],
  ['deliveryJobs', 'My deliveries', 'Accept an offer, collect sealed bags with the store\'s code, deliver with the customer\'s code; report a problem on the route.'],
  ['deliveryEarnings', 'Money', 'Earnings per delivery, wallet and payouts (instant transfer for a small fee).'],
  ['deliveryCash', 'COD cash', 'Cash collected on delivery is handed over and checked before earnings are released.'],
  ['deliveryProfile', 'Delivery profile', 'ID, licence, vehicle papers and payout details, with expiry reminders.'], L('help')];
const trip = (c, id) => (c.state().trips || []).find(x => x.id === id);
Object.assign(JOURNEYS, {
  'role-goods-owner': {title: 'Goods owner: every function', who: 'Goods owner', kind: 'around', minutes: 2, done: 'Goods owners create loads, choose who moves them and follow every trip and payment.', steps: aroundAs({role: 'Goods owner', ws: 'goods', label: 'a goods owner (Sharma Foods)', file: 'business.html', items: GOODS})},
  'role-transporter': {title: 'Transporter: every function', who: 'Transporter', kind: 'around', minutes: 2, done: 'Transporters take loads, assign trucks and drivers, run trips and settle money.', steps: aroundAs({role: 'Transporter', ws: 'transporter', label: 'a transporter (Raj Logistics)', file: 'business.html', items: TRANSPORTER})},
  'role-truck-owner': {title: 'Truck owner: every function', who: 'Truck owner', kind: 'around', minutes: 2, done: 'Truck owners keep papers valid, publish free trucks and get matched to loads.', steps: aroundAs({role: 'Truck owner', ws: 'vehicle', label: 'a truck owner (Raj Transport)', file: 'business.html', items: TRUCK_OWNER})},
  'role-movers': {title: 'Packers & movers: every function', who: 'Packers & movers', kind: 'around', minutes: 2, done: 'Movers receive assigned requests and run each move stage by stage with proof.', steps: aroundAs({role: 'Packers & movers', ws: 'movers', label: 'packers & movers (SafeMove)', file: 'business.html', items: MOVERS})},
  'role-commercial-driver': {title: 'Commercial driver: every function', who: 'Commercial driver', kind: 'around', minutes: 1, done: 'Drivers accept work, run trips with milestones and see every rupee in their khata.', steps: aroundAs({role: 'Commercial driver', ws: 'commercialDriver', label: 'a commercial driver', file: 'partner.html', items: DRIVER('Commercial driver')})},
  'role-personal-driver': {title: 'Personal driver: every function', who: 'Personal driver', kind: 'around', minutes: 1, done: 'Personal drivers take customer bookings by the hour, day or month.', steps: aroundAs({role: 'Personal driver', ws: 'personalDriver', label: 'a personal driver', file: 'partner.html', items: DRIVER('Personal driver')})},
  'role-helper': {title: 'Khalasi & helper: every function', who: 'Khalasi / helper', kind: 'around', minutes: 1, done: 'Helpers find loading and moving work and track their pay and advances.', steps: aroundAs({role: 'Helper', ws: 'helper', label: 'a khalasi / helper', file: 'partner.html', items: DRIVER('Helper')})},
  'role-business-staff': {title: 'Business staff: every function', who: 'Business staff', kind: 'around', minutes: 1, done: 'Staff invited by a business see only their branch, role and work.', steps: aroundAs({role: 'Business staff', ws: 'staff', label: 'staff of Raj Logistics (Ravi Kumar, manager)', file: 'business.html', items: STAFF})},
  'role-delivery-partner': {title: 'Delivery partner: every function', who: 'Delivery partner', kind: 'around', minutes: 1, done: 'Delivery partners accept offers, collect and deliver with codes, and get paid to their wallet.', steps: aroundAs({role: 'Delivery partner', ws: 'deliveryPartner', label: 'a delivery partner', file: 'delivery.html', items: DELIVERY})},

  'task-freight': {title: 'Ship goods: goods owner → transporter → truck owner', who: 'Goods owner · Transporter · Truck owner', minutes: 2,
    verify: s => (s.transportRequirements || []).some(r => r.status === 'published') && (s.availableLoads || []).length ? '' : 'Load was not published to the market',
    done: 'The goods owner created the goods and a transport request, sent it to a chosen transporter, the transporter published it, and truck owners see it as a match.',
    steps: [enterAs('Goods owner', 'goods', 'a goods owner'),
      {role: 'Goods owner', title: 'What is being shipped', say: 'Goods, quantity, weight and value — created once and reused for transport, billing and proof.', at: 'business.html#/goodsOrder', do: [{see: '#goods-order-form'}, {submit: '#goods-order-form'}]},
      {role: 'Goods owner', title: 'Where and when', say: 'Pickup, drop, date and truck type needed.', do: [{see: '#transport-requirement-form'}, {submit: '#transport-requirement-form'}]},
      {role: 'Goods owner', title: 'Choose who moves it', say: 'Own truck, selected transporters you trust, or the open market. Here: one selected transporter.', do: [{check: '#arrangement-form input[name="arrangement"][value="selected_transporters"]'}, {check: '#arrangement-form input[name="transporters"]'}, {submit: '#arrangement-form'}]},
      {role: 'Transporter', title: 'The transporter takes it to the market', say: 'Raj Logistics publishes the load so truck owners can offer a truck for it.', at: 'index.html#/home', do: [{run: () => window.MoveAIVNextTest?.switchWorkspace('transporter'), reload: true}]},
      {role: 'Transporter', title: 'Publish the load', say: 'Pick the goods owner\'s request and publish it as an available load.', at: 'business.html#/postAvailableLoad',
        do: [{select: 'select[name="requirementId"]', value: c => (c.state().transportRequirements || [])[0]?.id}, {submit: '#available-load-form'}]},
      {role: 'Truck owner', title: 'Truck owners see matching loads', say: 'A truck owner with a free truck nearby sees the load with a match score and can offer the truck.', at: 'index.html#/home', do: [{run: () => window.MoveAIVNextTest?.switchWorkspace('vehicle'), reload: true}]},
      {role: 'Truck owner', title: 'Matches near my truck', say: 'Sorted by how well route, truck type and timing fit.', at: 'business.html#/routeOpportunities', focus: 'main', do: [{see: 'main h1'}]},
    ]},
  'task-trip': {title: 'Run a trip: assign, drive, get paid', who: 'Transporter · Commercial driver', minutes: 2,
    verify: s => (s.trips || []).find(x => x.id === 'TRP-501')?.milestones?.some(m => m.key === 'dharamkata' && m.status === 'done') ? '' : 'Dharamkata milestone not done',
    done: 'The transporter assigned the trip, the driver accepted work and confirmed a milestone with proof, and the payment was approved and paid.',
    steps: [enterAs('Transporter', 'transporter', 'a transporter'),
      {role: 'Transporter', title: 'Assign truck and driver', say: 'Open a trip and assign a truck and driver. Overlapping bookings are blocked by the shared calendar.', at: 'business.html#/trips',
        do: [{click: '[data-op="open-trip"][data-id="TRP-503"]'}, {click: '[data-op="open-assign"]'}, {see: 'form[data-op-form="assign-trip"]'}]},
      {role: 'Commercial driver', title: 'The driver accepts work', say: 'Offers and invites arrive in My jobs.', at: 'index.html#/home', do: [{run: () => window.MoveAIVNextTest?.switchWorkspace('commercialDriver'), reload: true}]},
      {role: 'Commercial driver', title: 'Accept an offer', say: 'Accept or decline; accepted work appears with the trip.', at: 'partner.html#/myJobs', do: [{click: '[data-op="offer-accept"]'}]},
      {role: 'Commercial driver', title: 'Confirm a milestone with proof', say: 'At the dharamkata (weighbridge) the driver adds the slip photo and weight; without proof the step is refused.', at: 'partner.html#/myJobs',
        do: [{click: '[data-op="open-trip"][data-id="TRP-501"]'}, {file: '#milestone-proof-file', value: 'weighbridge-slip.jpg'}, {fill: '#milestone-proof', value: 'Slip 4471'}, {click: '[data-op="trip-milestone"][data-key="dharamkata"]'}]},
      {role: 'Transporter', title: 'Approve and pay', say: 'Payments wait for approval, then are paid and confirmed by the person paid.', at: 'index.html#/home', do: [{run: () => window.MoveAIVNextTest?.switchWorkspace('transporter'), reload: true}]},
      {role: 'Transporter', title: 'Money', say: 'Open a pending payment, approve it, then pay.', at: 'business.html#/money',
        do: [{run: c => { const x = (c.state().ledger || []).find(e => e.status === 'pending_approval' && e.owner === 'transporter'); c.set('pay', x?.id || ''); }},
          {click: c => c.vars().pay ? `[data-op="open-payment"][data-id="${c.vars().pay}"]` : 'main h1'}, {click: c => c.vars().pay ? '[data-op="money-action"][data-action-name="approve"]' : 'main h1'}, {click: c => c.vars().pay ? '[data-op="money-action"][data-action-name="pay"]' : 'main h1'}], focus: 'main'},
    ]},
  'task-receive': {title: 'Receive goods, pay the seller, close the order', who: 'Goods owner (buyer)', minutes: 1,
    verify: s => (s.goodsOrders || []).find(o => o.id === 'GO-403')?.status === 'closed' ? '' : 'Order GO-403 not closed',
    done: 'The buyer confirmed receipt, paid the seller with a bank reference, and closed the order — it cannot close before the seller is paid.',
    steps: [enterAs('Goods owner', 'goods', 'a goods owner'),
      {role: 'Goods owner', title: 'Confirm receipt', say: 'When the truck arrives, the buyer confirms what was received.', at: 'business.html#/trips', do: [{click: '[data-op="open-trip"][data-id="TRP-502"]'}, {click: 'form[data-op-form="trip-receipt"] button[type=submit]'}]},
      {role: 'Goods owner', title: 'Pay the seller', say: 'Record the bank transfer with its UTR reference, then approve and pay.', do: [{click: '[data-op="pay-seller"]'}, {fill: 'form[data-op-form="create-payment"] [name="reference"]', value: 'UTR-BIHAR-7781'}, {click: 'form[data-op-form="create-payment"] button.primary'},
        {click: '[data-op="money-action"][data-action-name="approve"]'}, {click: '[data-op="money-action"][data-action-name="pay"]'}]},
      {role: 'Goods owner', title: 'Close the order', say: 'Only now can the order be closed.', at: 'business.html#/trips', do: [{click: '[data-op="open-trip"][data-id="TRP-502"]'}, {click: '[data-op="close-order"]'}]},
    ]},
  'task-moving': {title: 'Run a move from slot to OTP', who: 'Packers & movers', minutes: 2,
    verify: s => (s.movingJobs || []).find(j => j.id === 'MOV-601')?.status === 'otp_verified' ? '' : 'Move did not reach OTP verified',
    done: 'Slot confirmed, crew and vehicle allocated, inventory packed, loading proof, transit, unloading and the customer\'s OTP — each stage needs its proof.',
    steps: [enterAs('Packers & movers', 'movers', 'packers & movers'),
      {role: 'Packers & movers', title: 'Open the assigned move', say: 'MoveAI assigned this request to the branch at the price the customer saw.', at: 'business.html#/work', do: [{click: '[data-op="open-moving"][data-id="MOV-601"]'}]},
      {role: 'Packers & movers', title: 'Confirm the slot', say: 'Pick the time slot with the customer.', do: [{click: '[data-op="moving-step"]'}]},
      {role: 'Packers & movers', title: 'Allocate vehicle and crew', say: 'Only free vehicles and staff are offered.', do: [{run: () => { const c = document.querySelector('#moving-crew'); if (c) [...c.options].slice(0, 2).forEach(o => { o.selected = true; }); const v = document.querySelector('#moving-vehicle'); if (v && v.options.length > 1 && !v.value) v.selectedIndex = 1; }}, {click: '[data-op="moving-step"]'}]},
      {role: 'Packers & movers', title: 'Inventory and packing', say: 'Tick each item as it is packed; extra items can be added and charged with the customer\'s approval.', do: [{run: () => document.querySelectorAll('main input[type=checkbox]').forEach(x => { if (!x.checked && x.offsetParent) x.click(); })}, {click: '[data-op="moving-step"]'}]},
      {role: 'Packers & movers', title: 'Loading proof', say: 'A photo of the loaded vehicle.', do: [{file: '#moving-proof-file', value: 'loaded-truck.jpg'}, {fill: '#moving-proof', value: 'Loaded 14:20'}, {click: '[data-op="moving-step"]'}]},
      {role: 'Packers & movers', title: 'In transit and unloaded', say: 'GPS follows the vehicle; the crew unloads and unpacks at the new home.', do: [{click: '[data-op="moving-step"]'}, {click: '[data-op="moving-step"]'}]},
      {role: 'Packers & movers', title: 'Customer OTP', say: 'The job completes only with the customer\'s 4-digit OTP. Then the customer pays and payouts are released.', do: [{fill: '#moving-otp', value: c => (c.state().movingJobs || []).find(j => j.id === 'MOV-601')?.customerOtp}, {click: '[data-op="moving-step"]'}]},
    ]},
  'task-worker-join': {title: 'Sign up as a driver or helper', who: 'Driver / helper', minutes: 1,
    verify: s => (s.candidates || []).some(c => c.name === 'Raju Kumar' && c.workerType === 'helper' && (c.skills || []).length) ? '' : 'Helper profile was not saved',
    done: 'One sign-up, a short work profile, and the person can browse jobs straight away. Licence checks happen before driving work.',
    steps: [...signUp('9123456791', 'work', 'New worker'),
      {role: 'New worker', title: 'What work do you want?', say: 'Commercial driver, personal driver, khalasi/helper or office staff; area, availability and expected pay.', at: 'partner.html#/candidateProfile',
        do: [{check: 'input[name=workerType][value=helper]'}, {fill: 'input[name=name]', value: 'Raju Kumar'}, {fill: 'input[name=location]', value: 'Patna'}, {check: 'input[name=skills][value="Loading / unloading"]'}, {check: 'input[name=skills][value="Moving helper / packer"]'}, {fill: 'input[name=expectedPay]', value: '600'}, {submit: '#candidate-profile-form'}]},
      {role: 'New worker', title: 'Browse jobs', say: 'Openings that match the profile; apply in one tap. Businesses can also invite the worker as staff.', focus: 'main', do: [{see: 'main h1'}]},
    ]},
  'task-staff': {title: 'Business staff: open my work and check in', who: 'Business owner · Staff', minutes: 1,
    done: 'The owner opens a staff member\'s workspace (in real life the worker signs in on their own phone), who sees only their tasks and marks attendance.',
    steps: [enterAs('Transporter', 'transporter', 'a transporter'),
      {role: 'Transporter', title: 'The team', say: 'Each person has one profile; open one to see their work and pay.', at: 'business.html#/people', do: [{click: '[data-action="open-staff"][data-staff="WORKER-001"]'}, {click: '[data-action="open-staff-workspace"]'}]},
      {role: 'Business staff', title: 'My work', say: 'Only assigned tasks and branches are visible. Mark attendance for the day.', at: 'business.html#/work', do: [{see: 'main h1'}, {click: '[data-op="attendance-in"]'}]},
    ]},
  'task-delivery-join': {title: 'Become a delivery partner', who: 'Delivery partner · MoveAI admin', minutes: 2,
    verify: s => ['approved', 'active'].includes(s.deliveryPartners?.deliveryPartner2?.status) ? '' : `Delivery partner status is ${s.deliveryPartners?.deliveryPartner2?.status}`,
    done: 'ID, licence, vehicle papers and payout account checked, then MoveAI approved — the partner can now receive delivery offers.',
    steps: [enterAs('Delivery partner', 'deliveryPartner2', 'a new delivery partner'),
      {role: 'Delivery partner', title: '1. My ID', say: 'Aadhaar by OTP with a live selfie (or upload ID photos for manual review).', at: 'delivery.html#/deliveryProfile',
        do: [{fill: 'form[data-delivery-form=request] input[name=aadhaar]', value: '234567890123'}, {check: 'form[data-delivery-form=request] input[name=consent]'}, {submit: 'form[data-delivery-form=request]'},
          {fill: 'form[data-delivery-form=otp] input[name=otp]', value: '123456'}, {fill: 'form[data-delivery-form=otp] input[name=dob]', value: '1995-04-12'}, {file: 'form[data-delivery-form=otp] input[name=selfie]', value: 'selfie.jpg'}, {submit: 'form[data-delivery-form=otp]'}]},
      {role: 'Delivery partner', title: '2. My licence', say: 'Vehicle type and driving licence, checked with Sarathi.', do: [{select: 'form[data-delivery-form=driving] select[name=vehicleType]', value: 'two_wheeler'}, {fill: 'form[data-delivery-form=driving] input[name=licenceNumber]', value: 'RJ1420220012345'}, {fill: 'form[data-delivery-form=driving] input[name=licenceExpiry]', value: '2031-12-31'},
        {file: 'form[data-delivery-form=driving] input[name=licenceFront]', value: 'licence-front.jpg'}, {file: 'form[data-delivery-form=driving] input[name=licenceBack]', value: 'licence-back.jpg'}, {submit: 'form[data-delivery-form=driving]'}]},
      {role: 'Delivery partner', title: '3. My vehicle', say: 'Number, RC, insurance and PUC with expiry dates (permission letter if the vehicle is someone else\'s).', do: [{fill: 'form[data-delivery-form=vehicle] input[name=vehicleNumber]', value: 'BR01AB1234'}, {file: 'form[data-delivery-form=vehicle] input[name=rc]', value: 'rc.pdf'}, {file: 'form[data-delivery-form=vehicle] input[name=insurance]', value: 'insurance.pdf'},
        {fill: 'form[data-delivery-form=vehicle] input[name=insuranceExpiry]', value: '2031-12-31'}, {file: 'form[data-delivery-form=vehicle] input[name=puc]', value: 'puc.jpg'}, {fill: 'form[data-delivery-form=vehicle] input[name=pucExpiry]', value: '2030-12-31'}, {submit: 'form[data-delivery-form=vehicle]'}]},
      {role: 'Delivery partner', title: '4. My payment', say: 'PAN and bank account checked with ₹1 (UPI optional).', do: [{fill: 'form[data-delivery-form=payout] input[name=pan]', value: 'ABCDE1234F'}, {fill: 'form[data-delivery-form=payout] input[name=accountName]', value: 'Sana Delivery'}, {fill: 'form[data-delivery-form=payout] input[name=accountNumber]', value: '123456789012'},
        {fill: 'form[data-delivery-form=payout] input[name=ifsc]', value: 'SBIN0001234'}, {submit: 'form[data-delivery-form=payout]'}]},
      {role: 'Delivery partner', title: '5. Submit for review', say: 'Everything is sent to MoveAI in one go.', do: [{run: () => { const b = [...document.querySelectorAll('main button')].find(x => /Submit for platform review/.test(x.textContent)); if (!b) throw new Error('Submit button not found'); b.click(); }}]},
      {role: 'MoveAI admin', title: 'MoveAI approves', say: 'The reviewer checks each document; the vehicle papers were flagged for manual review.', at: 'index.html#/home', do: [{run: () => window.MoveAIVNextTest?.switchWorkspace('admin'), reload: true}]},
      {role: 'MoveAI admin', title: 'Approve the partner', say: 'Approve, ask for a correction, or reject with a reason.', at: 'admin.html#/commercePartners', do: [{click: '[data-delivery-review="deliveryPartner2"]'}, {check: '#delivery-review-form [name=background]'}, {check: '#delivery-review-form [name=training]'}, {click: '[data-commerce="delivery-review-approve"]'}]},
    ]},
  'task-delivery': {title: 'Deliver an order with codes', who: 'Delivery partner', minutes: 1,
    verify: s => (s.customerOrders || []).some(o => o.id === 'ORD-TOUR' && o.status === 'delivered') ? '' : 'Order not delivered',
    done: 'Offer accepted, live location shared, sealed bag collected with the store\'s code, and delivered with the customer\'s code. Earnings go to the wallet.',
    steps: [enterAs('Delivery partner', 'deliveryPartner', 'a delivery partner'),
      {role: 'Delivery partner', title: 'A delivery offer arrives', say: 'A store has packed an order; MoveAI offers it to a nearby partner.', at: 'index.html#/home',
        do: [{async: true, patch: async s => {
          // A real store order, made with the app's own counter-delivery code, packed and offered to Ravi.
          const C = await import('./commerce.js'), I = await import('./grocery-inventory.js');
          const prod = I.forStore(s, 'grocery').find(p => I.published(p) && I.available(p) > 0) || I.forStore(s, 'grocery')[0];
          const r = C.createCounterDelivery(s, 'grocery', prod.id, 1, '14 Pusa Road, Karol Bagh', 'Asha (tour)', false, 'cash', '', 'Karol Bagh, Delhi');
          if (r.error) throw new Error(r.error);
          const o = r.order, old = o.id; o.id = 'ORD-TOUR'; for (const e of s.ledger || []) if (e.orderId === old) { e.orderId = 'ORD-TOUR'; e.sourceId = 'ORD-TOUR'; }
          Object.assign(o, {status: 'ready_for_pickup', bagCount: 1, pickupCode: '4821', deliveryCode: '7350'});
          const err = C.assign(s, 'ORD-TOUR', s.deliveryPartners.deliveryPartner.id); if (err) throw new Error(err);
        }}]},
      {role: 'Delivery partner', title: 'Accept the offer', say: 'Bags, items and earnings are shown before accepting.', at: 'delivery.html#/deliveryJobs', do: [{click: '[data-commerce="accept-job"][data-id="ORD-TOUR"]'}]},
      {role: 'Delivery partner', title: 'Collect from the store', say: 'Share live location, then enter the store\'s pickup code and confirm the number of sealed bags.', do: [{click: '[data-geo-start-demo]'}, {fill: '[data-code="ORD-TOUR"]', value: '4821'}, {fill: '[data-collected-bags="ORD-TOUR"]', value: '1'}, {click: '[data-commerce="pickup"][data-id="ORD-TOUR"]'}]},
      {role: 'Delivery partner', title: 'Deliver with the customer\'s code', say: 'Only the customer has this code, so the order can\'t be marked delivered without them.', do: [{fill: '[data-code="ORD-TOUR"]', value: '7350'}, {click: '[data-commerce="deliver"][data-id="ORD-TOUR"]'}]},
    ]},
});
ROLES.splice(ROLES.findIndex(r => r.id === 'admin'), 0,
  {id: 'goods-owner', label: 'Goods owner', app: 'MoveAI Business', around: 'role-goods-owner', tasks: ['task-freight', 'task-receive']},
  {id: 'transporter', label: 'Transporter', app: 'MoveAI Business', around: 'role-transporter', tasks: ['logistics', 'task-freight', 'task-trip']},
  {id: 'truck-owner', label: 'Truck owner', app: 'MoveAI Business', around: 'role-truck-owner', tasks: ['task-freight']},
  {id: 'movers', label: 'Packers & movers', app: 'MoveAI Business', around: 'role-movers', tasks: ['task-moving', 'task-booking']},
  {id: 'commercial-driver', label: 'Commercial driver', app: 'MoveAI Partner', around: 'role-commercial-driver', tasks: ['task-trip', 'task-worker-join']},
  {id: 'personal-driver', label: 'Personal driver', app: 'MoveAI Partner', around: 'role-personal-driver', tasks: ['task-worker-join']},
  {id: 'helper', label: 'Khalasi / helper', app: 'MoveAI Partner', around: 'role-helper', tasks: ['task-worker-join']},
  {id: 'business-staff', label: 'Business staff', app: 'MoveAI Business', around: 'role-business-staff', tasks: ['task-staff']},
  {id: 'delivery-partner', label: 'Delivery partner', app: 'MoveAI Partner', around: 'role-delivery-partner', tasks: ['task-delivery-join', 'task-delivery']},
);

// ---------- batch 3: work, hiring and helper tours ----------
const dayIso = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const switchTo = ws => ({run: () => { window.MoveAIVNextTest?.switchWorkspace(ws); }, reload: true});
Object.assign(JOURNEYS, {
  'task-hire-worker': {title: 'Post when free, get hired for a trip', who: 'Commercial driver · Transporter', minutes: 2,
    verify: s => { const o = (s.workOffers || []).find(x => x.from === 'transporter' && x.talentKey === 'PW-MOHAN' && x.place === 'Patna → Delhi'); return o?.status === 'done' && (s.workRatings || []).some(r => r.offerId === o.id) ? '' : 'Offer was not accepted, done and rated'; },
    done: 'The driver posted when and where he is free; the transporter found him with filters, sent a one-trip offer, he accepted on his home screen, and after the job the transporter marked it done (pay approved) and rated him.',
    steps: [enterAs('Commercial driver', 'commercialDriver', 'a commercial driver (Mohan)'),
      {role: 'Commercial driver', title: 'Post when I am free', say: 'Like "Available truck", but for people: dates, place, a return route and pay. It expires on its own.', at: 'partner.html#/myAvailability',
        do: [{fill: '#availability-form [name=area]', value: 'Patna'}, {fill: '#availability-form [name=routeTo]', value: 'Delhi'}, {fill: '#availability-form [name=from]', value: () => dayIso(1)}, {fill: '#availability-form [name=to]', value: () => dayIso(3)}, {fill: '#availability-form [name=pay]', value: '3000'}, {select: '#availability-form [name=payType]', value: 'per trip'}, {submit: '#availability-form'}]},
      {role: 'Transporter', title: 'The transporter looks for a driver', say: 'Raj Logistics needs a driver for a Patna → Delhi trip.', at: 'index.html#/home', do: [switchTo('transporter')]},
      {role: 'Transporter', title: 'Find drivers & helpers', say: 'Real filters: work, licence, area or route, free on a date, pay, rating, language. Numbers stay hidden until hiring.', at: 'business.html#/findTalent',
        do: [{fill: '[data-talent-filter] [name=area]', value: 'Patna'}, {check: '[data-talent-filter] [name=postedOnly]'}, {see: '[data-wx="open-talent"][data-id="PW-MOHAN"]'}]},
      {role: 'Transporter', title: 'Open the profile and send an offer', say: 'Rating, experience, licence, checks and when he is free. One trip, one day, or today with same-day pay.', do: [{click: '[data-wx="open-talent"][data-id="PW-MOHAN"]'},
        {fill: '#hire-form [name=date]', value: () => dayIso(1)}, {fill: '#hire-form [name=pay]', value: '3000'}, {fill: '#hire-form [name=place]', value: 'Patna → Delhi'}, {submit: '#hire-form'}]},
      {role: 'Commercial driver', title: 'The offer arrives on his home screen', say: 'Accept or decline in one tap, with the pay shown.', at: 'index.html#/home', do: [switchTo('commercialDriver')]},
      {role: 'Commercial driver', title: 'Accept', say: 'The transporter is told at once.', at: 'partner.html#/home',
        do: [{run: c => c.set('off', (c.state().workOffers || []).find(o => o.from === 'transporter' && o.place === 'Patna → Delhi')?.id || '')}, {click: c => `[data-op="offer-accept"][data-id="${c.vars().off}"]`}]},
      {role: 'Transporter', title: 'After the job: done, pay and rate', say: 'Mark it done (the pay is approved), or report a no-show (a strike). Both sides rate each other.', at: 'index.html#/home', do: [switchTo('transporter')]},
      {role: 'Transporter', title: 'Offers I sent', say: 'Waiting → accepted → done. The driver\'s number is now visible.', at: 'business.html#/hireOffers',
        do: [{click: c => `[data-wx="done"][data-id="${c.vars().off}"]`}, {click: c => `[data-wx="rate"][data-id="${c.vars().off}"][data-stars="5"]`}]},
    ]},
  'task-book-helpers': {title: 'Book helpers for loading', who: 'Customer · Khalasi / helper', minutes: 1,
    verify: s => (s.serviceRequests || []).some(r => r.type === 'helpers' && r.status === 'accepted') ? '' : 'Helpers were not confirmed',
    done: 'The customer booked two helpers by the hour with the price shown, a verified helper accepted on his home screen, and MoveAI filled the second place from nearby helpers.',
    steps: [enterAs('Customer', 'personal', 'a customer'),
      {role: 'Customer', title: 'Book helpers', say: 'Loading, shifting or packing. ₹120 per helper per hour, pay after the work.', at: 'index.html#/home', do: [{click: '[data-customer-service="helpers"]'}]},
      {role: 'Customer', title: 'How many, how long, where', say: 'The price updates as you change the numbers.', do: [{fill: '#book-helpers-form [name=count]', value: '2'}, {fill: '#book-helpers-form [name=hours]', value: '4'}, {fill: '#book-helpers-form [name=location]', value: 'Boring Road, Patna'}, {submit: '#book-helpers-form'}]},
      {role: 'Khalasi / helper', title: 'A helper gets the job', say: 'Verified helpers nearby see it on their home screen.', at: 'index.html#/home', do: [switchTo('helper')]},
      {role: 'Khalasi / helper', title: 'Accept', say: 'Pay and hours are shown before accepting.', at: 'partner.html#/home',
        do: [{run: c => c.set('off', (c.state().workOffers || []).find(o => o.kind === 'helpers' && o.status === 'pending')?.id || '')}, {click: c => `[data-op="offer-accept"][data-id="${c.vars().off}"]`}]},
      {role: 'Customer', title: 'Helpers confirmed', say: 'Names, ID check and a call button that keeps numbers hidden.', at: 'index.html#/home', do: [switchTo('personal')]},
      {role: 'Customer', title: 'The booking', say: 'Status, helpers and the price.', at: 'index.html#/serviceDetail', focus: 'main', do: [{see: 'main h1'}]},
    ]},
  'task-monthly-driver': {title: 'Choose a monthly personal driver', who: 'Customer', minutes: 1,
    verify: s => (s.serviceRequests || []).some(r => r.id === 'SR-MONTHLY' && r.status === 'accepted') && (s.favouriteDrivers || []).length ? '' : 'Driver not chosen or not saved as favourite',
    done: 'For a monthly driver the customer sees three verified drivers near them, books a paid trial day, chooses one, sees the driver card and saves the driver as a favourite to rebook later.',
    steps: [enterAs('Customer', 'personal', 'a customer'),
      {role: 'Customer', title: 'A monthly driver request', say: 'Monthly drivers are chosen, not auto-assigned like hourly ones.', at: 'index.html#/home',
        do: [{patch: s => { s.serviceRequests.unshift({id: 'SR-MONTHLY', customer: 'personal', customerName: 'Shubham Kumar', type: 'driver', title: 'Personal Driver · Monthly · Creta automatic', hireType: 'monthly', duration: 1, carType: 'SUV automatic', location: 'Sector 62, Noida', date: dayIso(5), quote: {total: 22000, driverEarning: 20900}, status: 'searching', provider: null, providerName: null, paid: false, rating: null, conversationId: null, createdAt: 'today'}); s.selectedServiceId = 'SR-MONTHLY'; }}]},
      {role: 'Customer', title: 'Three drivers near you', say: 'Rating, experience, police check and languages; call through MoveAI.', at: 'index.html#/serviceDetail', do: [{click: '[data-route="driverChoice"]'}]},
      {role: 'Customer', title: 'Book a trial day, then choose', say: 'A paid trial day first, then choose the driver you like.', do: [{click: '[data-wx="trial"][data-id="PW-RAJESH"]'}, {click: '[data-wx="choose-driver"][data-id="PW-ANIL"]'}]},
      {role: 'Customer', title: 'Driver card and favourite', say: 'Save a driver you like and book them again from Hire a driver.', do: [{click: '[data-wx="favourite"]'}]},
    ]},
  'task-picker-expiry': {title: 'Pick an order with the expiry check', who: 'Store staff (picker)', minutes: 1,
    verify: s => { const o = (s.customerOrders || []).find(x => x.id === s.tourPickOrder); return o?.pick?.completedAt && Object.keys(o.pick.batches || {}).length ? '' : 'Order not picked with a batch check'; },
    done: 'Asha checked in, opened the order from her home screen, scanned each item, picked the batch MoveAI suggested (earliest safe expiry first) and confirmed the date on the pack. Expired or nearly expired stock can\'t be picked.',
    steps: [enterAs('Store staff', 'picker', 'store staff (Asha at ABC Grocery)'),
      {role: 'Store staff', title: 'The store accepts an order', say: 'ABC Grocery accepted an order and offered it to Asha.', at: 'index.html#/home',
        do: [{async: true, patch: async s => { const O = await import('./product-orders.js'), C = await import('./commerce.js'), G = await import('./grocery-staff.js'), P = await import('./commerce-plus.js'); P.ensurePlus(s);
          const back = s.currentWorkspace; s.currentWorkspace = 'grocery'; const r = O.placeOrder(s, {productId: 'PRD-101', qty: 1, address: '22 Fraser Road, Patna', method: 'cod'}); if (!r.ok) throw new Error(r.error); const e = C.sellerAction(s, 'grocery', r.order.id, 'accept'); if (e) throw new Error(e);
          const a = G.assignPicker(s, 'grocery', r.order.id, 'PICK-001'); if (a) throw new Error(a); s.tourPickOrder = r.order.id; s.currentWorkspace = back; }}]},
      {role: 'Store staff', title: 'Check in', say: 'The home screen says what to do now. Checking in also marks attendance for payroll.', at: 'business.html#/home', do: [{click: '[data-commerce="start-picker-shift"]'}]},
      {role: 'Store staff', title: 'The order is on her home screen', say: 'Next order to pick, items in shelf order, one button to start.', do: [{see: '.wh-now .pick-preview'}, {click: '.wh-now [data-route="pickTasks"]'}]},
      {role: 'Store staff', title: 'Start picking', say: 'Scan each item; MoveAI shows which batch to take.', do: [{click: c => `[data-commerce="pick-start"][data-id="${c.state().tourPickOrder}"]`}]},
      {role: 'Store staff', title: 'Scan and check the date on the pack', say: 'Pick the suggested batch and tick that the date on the pack is that day or later. Freshness checks for fresh food.', do: [
        {click: c => `[data-plus-demo-scan^="${c.state().tourPickOrder}|"]`}, {check: c => `[data-expiry-ok^="${c.state().tourPickOrder}|"]`},
        {run: c => document.querySelectorAll(`[data-quality^="${c.state().tourPickOrder}|"]`).forEach(x => { if (!x.checked) x.click(); })},
        {click: c => `[data-commerce="pick-check"][data-id="${c.state().tourPickOrder}"]`}]},
      {role: 'Store staff', title: 'Complete picking', say: 'The store packs and seals the bag next.', do: [{click: c => `[data-commerce="pick-complete"][data-id="${c.state().tourPickOrder}"]`}]},
    ]},
  'task-driver-safety': {title: 'Driver safety: training, selfie, SOS', who: 'Commercial driver', minutes: 1,
    verify: s => s.workerStatus?.commercialDriver?.trainingDone && s.workerStatus?.commercialDriver?.selfieDate && (s.cases || []).some(c => /SOS/.test(c.subject)) ? '' : 'Training, selfie or SOS missing',
    done: 'A 3-minute safety training once, a selfie check each day so no one else uses the account, and an SOS button during a trip that alerts MoveAI and the business.',
    steps: [enterAs('Commercial driver', 'commercialDriver', 'a commercial driver'),
      {role: 'Commercial driver', title: 'Safety training', say: '3 short cards and 3 questions, needed once before the first MoveAI trip.', at: 'partner.html#/driverTraining',
        do: [{check: '#training-form input[name=q0][value="0"]'}, {check: '#training-form input[name=q1][value="1"]'}, {check: '#training-form input[name=q2][value="1"]'}, {submit: '#training-form'}]},
      {role: 'Commercial driver', title: 'Today\'s selfie check', say: 'A quick selfie each day confirms it is really him working.', at: 'partner.html#/dailySelfie', do: [{file: '#selfie-form [name=selfie]', value: 'selfie-today.jpg'}, {submit: '#selfie-form'}]},
      {role: 'Commercial driver', title: 'SOS during a trip', say: 'If anything goes wrong, one press alerts MoveAI and the business with his location.', at: 'partner.html#/myJobs', do: [{click: '[data-op="open-trip"][data-id="TRP-501"]'}, {click: '[data-wx="sos"]'}]},
    ]},
  'task-in-person-join': {title: 'Join a worker in person', who: 'Shop owner', minutes: 1,
    verify: s => (s.pickerStaff || []).some(p => p.joinMethod === 'in_person' && p.name === 'Sunita Devi') ? '' : 'Worker not added',
    done: 'For staff without a smartphone, the owner checks the original ID face to face, the worker confirms with an OTP on a family phone, and only the last 4 characters of the ID are kept.',
    steps: [enterAs('Shop owner', 'grocery', 'the owner of ABC Grocery'),
      {role: 'Shop owner', title: 'Order preparation team', say: 'Invite by link as usual, or join a worker who is standing with you.', at: 'business.html#/shopTeam', do: [{click: '[data-route="inPersonJoin"]'}]},
      {role: 'Shop owner', title: 'Check the ID face to face', say: 'Name as on the ID, an OTP to their (or a family) phone, the ID type and last 4 characters, and a photo.', do: [
        {fill: '#in-person-form [name=name]', value: 'Sunita Devi'}, {fill: '#in-person-form [name=mobile]', value: '9876500011'}, {fill: '#in-person-form [name=otp]', value: '123456'}, {select: '#in-person-form [name=idType]', value: 'voter'},
        {fill: '#in-person-form [name=idLast4]', value: '4321'}, {file: '#in-person-form [name=photo]', value: 'sunita.jpg'}, {check: '#in-person-form [name=sawOriginal]'}, {submit: '#in-person-form'}]},
    ]},
  'task-regular-crew': {title: 'Regular crew for a truck', who: 'Transporter', minutes: 1,
    verify: s => (s.ownedVehicles?.transporter || []).some(v => v.regularCrew?.driverId === 'WORKER-001') ? '' : 'Regular crew not saved',
    done: 'The driver and khalasi who usually work on a truck are saved once; when the truck is assigned to a trip they are picked automatically.',
    steps: [enterAs('Transporter', 'transporter', 'a transporter'),
      {role: 'Transporter', title: 'Open a truck', say: 'Each truck has its documents, uses and now its regular crew.', at: 'business.html#/fleet', do: [{click: '[data-op="open-vehicle"][data-id="VEH-T01"]'}]},
      {role: 'Transporter', title: 'Save the regular crew', say: 'Mohan drives it; Ramesh is the khalasi.', do: [{select: '[data-crew-driver]', value: 'WORKER-001'}, {select: '[data-crew-helper]', value: 'WORKER-002'}, {click: '[data-wx="save-crew"]'}]},
      {role: 'Transporter', title: 'Assign the truck to a trip', say: 'Choosing the truck fills in its crew.', at: 'business.html#/trips', do: [{click: '[data-op="open-trip"][data-id="TRP-503"]'}, {click: '[data-op="open-assign"]'}, {check: 'input[name=vehicleId][value="VEH-T01"]'}, {see: '.avail-chip'}]},
    ]},
  'task-practice-delivery': {title: 'Try a practice delivery', who: 'Delivery partner', minutes: 1,
    verify: s => (s.customerOrders || []).some(o => o.practice && o.status === 'delivered') ? '' : 'Practice order not delivered',
    done: 'A new partner can practise straight from the home screen: a sample packed order, accept, share location, collect with the store code and deliver with the customer code.',
    steps: [enterAs('Delivery partner', 'deliveryPartner', 'a delivery partner'),
      {role: 'Delivery partner', title: 'Try a practice delivery', say: 'When there is no real order, a sample one at ABC Grocery is offered to you.', at: 'delivery.html#/home', do: [{click: '[data-commerce="practice-delivery"]'}]},
      {role: 'Delivery partner', title: 'Accept from home', say: 'Store, drop, bags, items and what you earn are shown.', do: [{click: '.wh-now [data-commerce="accept-job"]'}]},
      {role: 'Delivery partner', title: 'Collect and deliver', say: 'Share location, enter the store code 2468, then the customer code 1357.', at: 'delivery.html#/deliveryJobs', do: [
        {run: c => c.set('po', (c.state().customerOrders || []).find(o => o.practice)?.id || '')}, {click: '[data-geo-start-demo]'}, {fill: c => `[data-code="${c.vars().po}"]`, value: '2468'}, {click: c => `[data-commerce="pickup"][data-id="${c.vars().po}"]`},
        {fill: c => `[data-code="${c.vars().po}"]`, value: '1357'}, {click: c => `[data-commerce="deliver"][data-id="${c.vars().po}"]`}]},
    ]},
});
// New screens in the role tours.
{
  const add = (id, after, item) => { const j = JOURNEYS[id]; if (!j) return; const i = j.steps.findIndex(s => s.at && s.at.endsWith(`#/${after}`)); const file = j.steps.find(s => s.at && s.at.includes('#/') && !s.at.startsWith('index.html'))?.at.split('#')[0] || 'partner.html'; j.steps.splice(i < 0 ? j.steps.length : i + 1, 0, {role: j.steps[1]?.role || j.who, title: item[1], say: item[2], at: `${file}#/${item[0]}`, focus: 'main h1', do: [{see: 'main h1'}]}); };
  for (const id of ['role-goods-owner', 'role-transporter', 'role-truck-owner', 'role-movers']) add(id, 'people', ['findTalent', 'Find drivers & helpers', 'Who is free, when and where, with filters; hire for one trip or one day in one tap.']);
  for (const id of ['role-commercial-driver', 'role-personal-driver', 'role-helper']) add(id, 'work', ['myAvailability', 'When I am free', 'Post dates, place and pay so businesses nearby can send an offer.']);
  add('role-commercial-driver', 'myAvailability', ['driverTraining', 'Safety training', 'A 3-minute training before the first trip.']);
  add('role-commercial-driver', 'driverTraining', ['dailySelfie', 'Today\'s selfie check', 'A selfie each day so only the real driver works.']);
}
const rolesAdd = (id, tasks) => { const r = ROLES.find(x => x.id === id); if (r) r.tasks = [...new Set([...(r.tasks || []), ...tasks])]; };
rolesAdd('transporter', ['task-hire-worker', 'task-regular-crew']); rolesAdd('goods-owner', ['task-hire-worker']); rolesAdd('truck-owner', ['task-regular-crew']);
rolesAdd('commercial-driver', ['task-hire-worker', 'task-driver-safety']); rolesAdd('personal-driver', ['task-monthly-driver']); rolesAdd('helper', ['task-book-helpers']);
rolesAdd('customer', ['task-book-helpers', 'task-monthly-driver']); rolesAdd('store-staff', ['task-picker-expiry']); rolesAdd('shop-owner', ['task-in-person-join']); rolesAdd('delivery-partner', ['task-practice-delivery']);

export const TEST_DATA = [
  ['OTP (sign-up, DigiLocker, staff join)', '123456'],
  ['GSTIN (Uttar Pradesh)', '09ABCDE1234F1Z5 · ending 9 = cancelled'],
  ['GSTIN (Bihar)', '10ABCDE1234F1Z5'],
  ['PAN', 'ABCDE1234F (characters 3–12 of the GSTIN)'],
  ['Bank', 'Any 9–18 digits + IFSC SBIN0001234 · ending 000 = name mismatch'],
  ['FSSAI', 'Any 14 digits · ending 0000 = not found'],
  ['Pincodes', 'Noida 201301 · Patna 800001 · Jaipur 302017 (next-day) · 305001 not covered'],
  ['DigiLocker mobile', 'Any · ending 0000 no account · 1111 name differs · 2222 other district · 3333 under 18'],
  ['Aadhaar (staff joining)', 'Any 12 digits starting 2–9'],
  ['UPI', 'Any UPI ID; then "Demo: bank confirms payment" on My orders'],
];
