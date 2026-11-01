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
  {id: 'logistics', label: 'Logistics business', app: 'MoveAI Business', tasks: ['logistics'], soon: 'Goods owner, transporter, truck owner, movers, drivers, helpers and delivery partners are coming next.'},
  {id: 'admin', label: 'MoveAI admin', app: 'MoveAI Admin', around: 'role-admin', tasks: ['seller-bihar']},
];

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
