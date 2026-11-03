// MoveAI One — option C: four products on one login and one backend.
// People see four apps (see APPS in workspace-hub.js): customer, partner (incl. delivery), business (incl.
// seller and store staff) and admin. seller.html, picker.html and delivery.html remain as aliases that open
// the Business or Partner app on that role. In the prototype each app is its own entry page
// sharing the same code and the same saved data. Each product shows only its own roles, menus and home.
import {retailOwnerAndManagers, workerWorkspaces} from './seller-roles.js';

export const PRODUCTS = {
  customer: {name: 'MoveAI', tagline: 'Book moves, drivers and services', file: 'index.html', mark: 'M', roles: ['personal'], defaultWs: 'personal'},
  partner: {name: 'MoveAI Partner', tagline: 'Deliveries, driving, helper and home-service work', file: 'partner.html', mark: 'P', roles: ['personal', 'commercialDriver', 'personalDriver', 'helper', 'homePro'], defaultWs: 'personal'},
  business: {name: 'MoveAI Business', tagline: 'Stores, loads, fleet and teams', file: 'business.html', mark: 'B', roles: ['personal', 'goods', 'transporter', 'vehicle', 'movers', 'staff'], defaultWs: 'transporter'},
  admin: {name: 'MoveAI Admin', tagline: 'Internal console', file: 'admin.html', mark: 'A', roles: ['admin'], defaultWs: 'admin'},
  seller: {name: 'MoveAI Seller', tagline: 'Products, orders, teams and payouts', file: 'seller.html', mark: 'S', get roles() { return retailOwnerAndManagers(); }, defaultWs: 'grocery'},
  picker: {name: 'MoveAI Store Staff', tagline: 'Prepare orders for your store', file: 'picker.html', mark: 'P', get roles() { return workerWorkspaces(); }, defaultWs: 'picker'},
  delivery: {name: 'MoveAI Delivery', tagline: 'Deliveries and COD cash', file: 'delivery.html', mark: 'D', roles: ['deliveryPartner','deliveryPartner2'], defaultWs: 'deliveryPartner'},
};

// Which product owns a workspace (the Personal workspace appears in three products with different purposes).
export function productForWorkspace(ws) {
  if (['commercialDriver', 'personalDriver', 'helper', 'homePro'].includes(ws)) return 'partner';
  if (['goods', 'transporter', 'vehicle', 'movers', 'staff'].includes(ws)) return 'business';
  if (ws === 'admin') return 'admin';
  if (retailOwnerAndManagers().includes(ws)) return 'seller';
  if (workerWorkspaces().includes(ws)) return 'picker';
  if (['deliveryPartner','deliveryPartner2'].includes(ws)) return 'delivery';
  return 'customer';
}

// For the Personal workspace, some routes belong to another product: opening them switches to that product,
// the way a deep link would open the right app.
const PARTNER_ROUTES = ['work', 'workerStatus', 'workerVerify', 'workerDocuments', 'candidateProfile', 'applyOpening', 'openingDetail'];
const BUSINESS_ROUTES = ['sellStart', 'sellStatus', 'businessStart', 'businessDetails', 'businessKyc', 'branches', 'branchEditor', 'bank', 'applicationStatus', 'invitations', 'purposeBusiness'];
const CUSTOMER_ROUTES = ['billDoc', 'productCheckout', 'book', 'bookingReview', 'services', 'serviceDetail', 'search', 'productDetail', 'cartAdded', 'cart', 'orders', 'orderTracking', 'account', 'movingJob', 'payment', 'purpose', 'consentDetails'];
export function personalRouteOwner(route) {
  if (PARTNER_ROUTES.includes(route)) return 'partner';
  if (BUSINESS_ROUTES.includes(route)) return 'business';
  if (CUSTOMER_ROUTES.includes(route)) return 'customer';
  return null; // shared: home, messages, conversation, notifications, money, etc.
}

// Menus for the Personal workspace inside each product.
export const PERSONAL_NAV = {
  customer: [['home', 'Home'], ['search', 'Shop'], ['orders', 'Orders'], ['book', 'Book'], ['services', 'My bookings'], ['messages', 'Messages'], ['account', 'Account']],
  partner: [['home', 'Home'], ['work', 'Find work'], ['workerStatus', 'Verification'], ['messages', 'Messages'], ['candidateProfile', 'Profile']],
  business: [['home', 'Home'], ['businessStart', 'Business setup'], ['applicationStatus', 'Application'], ['sellStatus', 'Seller applications'], ['invitations', 'Invitations'], ['messages', 'Messages']],
};
for(const items of Object.values(PERSONAL_NAV))items.push(['helpDesk','Help']);
export const PERSONAL_LABEL = {
  customer: {label: 'My account', subtitle: 'Customer'},
  partner: {label: 'My partner profile', subtitle: 'New partner'},
  business: {label: 'Register a business', subtitle: 'Business setup'},
};
export const PRODUCT_TITLES = {customer: 'MoveAI — book moves, drivers and services', partner: 'MoveAI Partner — find driving and helper work', business: 'MoveAI Business', admin: 'MoveAI Admin', seller:'MoveAI Seller — grocery orders', picker:'MoveAI Picker — grocery tasks', delivery:'MoveAI Delivery — grocery jobs'};
export const productLink = (product, route = 'home') => `./${PRODUCTS[product].file}#/${route}`;
