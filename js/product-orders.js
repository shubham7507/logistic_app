// MoveAI One — buying products with MoveAI Pay.
// Checkout: quantity, delivery address, price (items + delivery fee under ₹499), pay by UPI / card (held until
// delivered) or cash on delivery (up to ₹5,000). Cancel before dispatch → full refund. Return within 7 days of
// delivery → refund after pickup. Delivered → released to the store partner minus commission.
// COD → the delivery partner collects cash; commission becomes the store partner's wallet debt.
import {esc, pill, inr} from './ops.js';
import {gateway, record, TEST, clock} from './pay.js';
import {issueInvoice, billingFieldsHtml, readBilling} from './customer-billing.js';
import * as Commerce from './commerce.js';

export const PRODUCT_POLICY = {commission: 0.08, freeDeliveryAbove: 499, deliveryFee: 40, codLimit: 5000, returnDays: 7};
const DAY = 86400000;
const stamp = () => new Date(clock()).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'});
const head = (t, x, a = '') => `<div class="page-header"><div><h1>${esc(t)}</h1><p>${esc(x)}</p></div>${a}</div>`;
const partyOf = name => `store:${String(name || 'store').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const STEPS = ['paid', 'accepted', 'packed', 'out_for_delivery', 'delivered'];

export function quote(p, qty) {
  const lines = Array.isArray(p) ? p : [{price:p.price, quantity:qty}];
  const items = lines.reduce((n, line) => n + line.price * line.quantity, 0), delivery = items >= PRODUCT_POLICY.freeDeliveryAbove ? 0 : PRODUCT_POLICY.deliveryFee;
  return {items, delivery, total: items + delivery};
}
export function cartLines(state) {
  return (state.productCart || []).map(i => ({...i, product:state.products.find(p => p.id === i.productId)})).filter(i => i.product && Number.isInteger(i.quantity) && i.quantity > 0);
}
export function addToCart(state, productId, quantity=1) {
  const p = state.products.find(x => x.id === productId);
  if (!p || p.stock !== 'In stock') return 'This product is unavailable.';
  if (!Object.values(state.shopPartners||{}).some(x=>x.name===p.fulfilmentPartner&&x.status==='approved')) return 'This store is unavailable right now.';
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return 'Choose 1 to 10 items.';
  state.productCart ||= [];
  const line = state.productCart.find(i => i.productId === productId);
  if (line && line.quantity + quantity > 10) return 'Maximum 10 per product.';
  if (line) line.quantity += quantity; else state.productCart.push({productId, quantity});
  return '';
}
export function updateCart(state, id, quantity) {
  const line = (state.productCart || []).find(i => i.productId === id);
  if (!line) return 'Product is no longer in the cart.';
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10) return 'Choose 0 to 10 items.';
  if (quantity === 0) state.productCart = state.productCart.filter(i => i !== line); else line.quantity = quantity;
  return '';
}
export function placeOrder(state, v) {
  if (v.fromCart && (!state.productCart?.length || cartLines(state).length !== state.productCart.length)) return {error: 'Cart changed. Review your items before placing the order.'};
  const lines = v.fromCart ? cartLines(state).map(i => ({productId:i.productId, quantity:i.quantity, product:i.product})) : [{productId:v.productId, quantity:Number(v.qty), product:state.products.find(x => x.id === v.productId)}];
  if (!lines.length || lines.some(i => !i.product)) return {error: 'Product not found.'};
  if (lines.some(i => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 10 || i.product.stock !== 'In stock')) return {error: 'Check product availability and quantity.'};
  if (lines.some(i=>!Object.values(state.shopPartners||{}).some(x=>x.name===i.product.fulfilmentPartner&&x.status==='approved'))) return {error:'A store is unavailable. Review your cart.'};
  if (!String(v.address || '').trim()) return {error: 'Enter the delivery address.'};
  const q = quote(lines.map(i => ({price:i.product.price, quantity:i.quantity})));
  if (v.method === 'cod' && q.total > PRODUCT_POLICY.codLimit) return {error: `Cash on delivery is available up to ${inr(PRODUCT_POLICY.codLimit)}. Pay online for this order.`};
  const gatewayResult = v.method === 'cod' ? null : gateway.collect({method:v.method, vpa:v.vpa, card:v.card, amount:q.total});
  if (gatewayResult && !gatewayResult.ok) return {error:gatewayResult.reason};
  const checkoutId = `CHK-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
  const stores = [...new Set(lines.map(i => i.product.fulfilmentPartner))];
  const orders = stores.map((name,index) => {
    const own = lines.filter(i => i.product.fulfilmentPartner === name);
    const itemTotal = own.reduce((n,i) => n+i.product.price*i.quantity,0), deliveryFee=index===0?q.delivery:0;
    const id=`ORD-${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2,5).toUpperCase()}`,party=partyOf(name);
    const order={id,checkoutId,billing:v.billing,customer:state.person?.name,items:own.map(i=>({productId:i.productId,quantity:i.quantity,name:i.product.name,unitPrice:i.product.price})),itemTotal,deliveryFee,total:itemTotal+deliveryFee,fulfilmentPartner:name,party,address:v.address.trim(),method:v.method,eta:'Today, 6:30 PM',substitution:v.substitution||'contact',history:[{at:stamp(),text:'Order placed · awaiting store acceptance'}],status:v.method==='cod'?'confirmed':gatewayResult.pending?'payment_pending':'paid',cod:v.method==='cod'};
    if (gatewayResult) record(state,{owner:'personal',orderId:id,checkoutId,sourceType:'order',sourceId:id,type:'customer_payment',purpose:'order',payer:'personal',payee:party,responsible:'personal',amount:order.total,method:v.method,reference:gatewayResult.ref,status:gatewayResult.pending?'pending':'held',gatewayFinal:gatewayResult.final||null,note:`Checkout ${checkoutId} · order ${id}`},'Customer');
    Commerce.initializeOrder(state,order);return order;
  });
  state.customerOrders.unshift(...orders);
  if (v.fromCart) state.productCart = [];
  return {ok:true,order:orders[0],orders,checkoutId,total:q.total};
}
const orderPayments = (state, o) => state.ledger.filter(x => x.orderId === o.id);
export function checkPayment(state, o) {
  const x = orderPayments(state, o).find(e => e.status === 'pending'); if (!x) return 'Nothing pending.';
  const group=state.customerOrders.filter(y=>y.checkoutId===o.checkoutId),success=x.gatewayFinal==='success';
  group.forEach(y=>{const p=orderPayments(state,y).find(e=>e.status==='pending');if(!p)return;p.status=success?'held':'failed';y.status=success?'paid':'cancelled';y.paymentStatus=success?'paid':'failed';if(!success)y.cancelReason='Payment failed — nothing was charged';y.history.push({at:stamp(),text:success?'Payment confirmed by the bank':y.cancelReason});});return '';
}
function refund(state, o, amount, why) {
  const src = orderPayments(state, o).find(e => e.type === 'customer_payment' && e.status === 'held'); if (!src) return;
  src.status = 'refunded';
  const g = gateway.refund(src.reference, amount);
  record(state, {owner: 'personal', orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'refund', payer: 'moveai', payee: 'personal', responsible: o.party, amount, method: src.method, reference: g.ref, status: 'refund_initiated', expectedBy: clock() + 5 * DAY, gatewayFinal: 'refunded', note: `${why} · ${o.id}`});
}
export function cancelOrder(state, o) {
  if (!['paid', 'confirmed', 'accepted', 'packed', 'payment_pending'].includes(o.status)) return 'The order has left the store. Refuse it at the door or return it after delivery.';
  if (o.status === 'payment_pending') return 'Wait for the payment to confirm or fail first.';
  if (!o.cod) refund(state, o, o.total, 'Cancelled before dispatch — full refund');
  o.status = 'cancelled'; o.history.push({at: stamp(), text: o.cod ? 'Cancelled (cash on delivery, nothing to refund)' : 'Cancelled · full refund started'});
  return '';
}
export function advanceOrder(state, o) {
  const i = STEPS.indexOf(o.status === 'confirmed' ? 'paid' : o.status);
  if (i < 0 || i >= STEPS.length - 1) return 'No further step.';
  o.status = STEPS[i + 1]; o.history.push({at: stamp(), text: ({accepted:'Store accepted order',packed:'Store packed order',out_for_delivery:'Delivery partner collected order',delivered:'Delivered to customer'})[o.status]});
  if (o.status === 'delivered') {
    o.deliveredAt = clock();
    issueInvoice(state, {kind: 'order', o, party: o.party});
    const rate = PRODUCT_POLICY.commission, commission = Math.round(o.total * rate);
    if (o.cod) {
      record(state, {owner: 'personal', orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'customer_payment', purpose: 'order', payer: 'personal', payee: o.party, responsible: 'personal', amount: o.total, method: 'cash', channel: 'cash', reference: `COD-${o.id}`, status: 'confirmed', note: `Cash collected on delivery · ${o.id}`}, 'Delivery partner');
      record(state, {owner: o.party, orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'cash_commission', payer: o.party, payee: 'moveai', responsible: o.party, amount: commission, method: 'wallet', reference: `COMM-${o.id}`, status: 'confirmed', note: `8% commission on cash order ${o.id}`});
    } else {
      const held = orderPayments(state, o).filter(e => e.type === 'customer_payment' && e.status === 'held');
      held.forEach(e => { e.status = 'released'; });
      record(state, {owner: o.party, orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'wallet_credit', payer: 'moveai', payee: o.party, responsible: 'moveai', amount: o.total - commission, method: 'wallet', reference: `REL-${o.id}`, status: 'confirmed', gross: o.total, commission, note: `${o.id} delivered: ${inr(o.total)} − 8% commission`});
      record(state, {owner: 'moveai', orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'commission', payer: o.party, payee: 'moveai', responsible: o.party, amount: commission, method: 'wallet', reference: `COM-${o.id}`, status: 'confirmed', note: `Commission ${o.id}`});
    }
  }
  return '';
}
export function returnOrder(state, o, reason) {
  if (o.status !== 'delivered') return 'Only delivered orders can be returned.';
  if (clock() - (o.deliveredAt || 0) > PRODUCT_POLICY.returnDays * DAY) return `Returns are allowed within ${PRODUCT_POLICY.returnDays} days of delivery.`;
  if (!String(reason || '').trim()) return 'Tell us why you are returning it.';
  o.status = 'return_requested'; o.returnReason = reason; o.history.push({at: stamp(), text: `Return requested: ${reason}`});
  return '';
}
export function completeReturn(state, o) {
  if (o.status !== 'return_requested') return 'No return in progress.';
  // Refund from the store's wallet (reverse the release) — to the original method, or by UPI for COD.
  record(state, {owner: o.party, orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'penalty', payer: o.party, payee: 'moveai', responsible: o.party, amount: o.total - Math.round(o.total * PRODUCT_POLICY.commission), method: 'wallet', reference: `RTN-${o.id}`, status: 'confirmed', note: `Return ${o.id}: amount taken back from the store`});
  const g = gateway.refund(`ret_${o.id}`, o.total);
  record(state, {owner: 'personal', orderId: o.id, sourceType: 'order', sourceId: o.id, type: 'refund', payer: 'moveai', payee: 'personal', responsible: o.party, amount: o.total, method: o.cod ? 'upi' : o.method, reference: g.ref, status: 'refund_initiated', expectedBy: clock() + 5 * DAY, gatewayFinal: 'refunded', note: `Return refund · ${o.id}${o.cod ? ' (to your UPI, as it was cash on delivery)' : ''}`});
  o.status = 'returned'; o.history.push({at: stamp(), text: 'Picked up · refund started'});
  return '';
}

// ---------- screens ----------
export function searchScreen(state) {
  const query = String(state.productQuery || '').trim().toLowerCase();
  const found = state.products.filter(p => `${p.name} ${p.category} ${p.size}`.toLowerCase().includes(query));
  const count = cartLines(state).reduce((n, i) => n + i.quantity, 0);
  const categories=[...new Set(state.products.map(p=>p.category))];
  return `${head('Shop products', 'Search groceries and review each item before checkout.')}
    <div class="shop-toolbar"><span>Deliver to ${esc(state.deliveryAddress||'your address at checkout')}</span><button class="button secondary shop-cart-link" data-route="cart" aria-label="Open cart with ${count} item${count===1?'':'s'}">🛒 Cart <b>${count}</b></button></div>
    <form id="product-search-form" class="panel filter-bar"><label class="sr-only" for="product-query">Search products</label><input id="product-query" name="query" value="${esc(state.productQuery || '')}" placeholder="Search rice, flour, salt…"><button class="button primary">Search</button></form>
    <div class="shop-categories" aria-label="Product categories"><button class="${!query?'active':''}" data-po-query="">All</button>${categories.map(c=>`<button class="${query===c.toLowerCase()?'active':''}" data-po-query="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <p class="muted">${found.length} product${found.length === 1 ? '' : 's'} found · Store assigned by MoveAI</p><div class="shop-grid">${found.map(p => `<article class="panel shop-product-card"><button class="shop-product-open" data-po-detail="${esc(p.id)}" aria-label="View ${esc(p.name)} details"><span class="shop-product-visual" aria-hidden="true">${productIcon(p)}</span><strong>${esc(p.name)}</strong></button><small>${esc(p.size)} · ${esc(p.category)}</small><b class="shop-price">${inr(p.price)}</b><span class="stock-label">${esc(p.stock)}</span><div class="row-actions"><button class="button secondary" data-po-detail="${esc(p.id)}">View details</button><button class="button primary" data-po-add="${esc(p.id)}" ${p.stock==='In stock'?'':'disabled'}>＋ Add</button></div></article>`).join('') || '<div class="panel empty-inline"><b>No products found</b><p>Try a different name or category.</p></div>'}</div>`;
}
const productIcon=p=>({Rice:'🍚',Flour:'🌾',Essentials:'🧂'}[p.category]||'🛒');
export function productDetailScreen(state){
  const p=state.products.find(x=>x.id===state.selectedProductId);
  if(!p)return `${head('Product unavailable','Choose another product.')}<button class="button secondary" data-route="search">Back to Shop</button>`;
  const count=cartLines(state).reduce((n,i)=>n+i.quantity,0);
  return `${head('Product details',`${p.category} · ${p.size}`)}<div class="shop-toolbar"><button class="button secondary" data-route="search">← Shop</button><button class="button secondary shop-cart-link" data-route="cart">🛒 Cart <b>${count}</b></button></div>
    <div class="shop-detail"><div class="panel shop-detail-visual" aria-hidden="true">${productIcon(p)}</div><section class="panel shop-detail-info"><h2>${esc(p.name)}</h2><p>${esc(p.size)} · ${esc(p.category)}</p><b class="shop-price">${inr(p.price)}</b><p class="stock-label">${esc(p.stock)}</p><p>Delivery address and available payment methods are confirmed at checkout. MoveAI assigns the store.</p><label for="product-detail-qty">Quantity</label><select id="product-detail-qty" data-po-detail-qty>${Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select><div class="shop-detail-actions"><button class="button primary" data-po-add="${esc(p.id)}" ${p.stock==='In stock'?'':'disabled'}>Add to cart</button><button class="button secondary" data-action="buy-product" data-product="${esc(p.id)}" ${p.stock==='In stock'?'':'disabled'}>Buy now</button></div></section></div>`;
}
export function cartAddedScreen(state){
 const p=state.products.find(x=>x.id===state.lastAddedProductId),lines=cartLines(state),q=quote(lines.map(i=>({price:i.product.price,quantity:i.quantity}))),count=lines.reduce((n,i)=>n+i.quantity,0);
 if(!p||!count)return cartScreen(state);
 return `${head('Added to cart','Your selection is saved in this browser.')}<section class="panel shop-added"><span class="shop-added-mark" aria-hidden="true">✓</span><div><h2>${esc(p.name)} added</h2><p>${count} item${count===1?'':'s'} in cart · Subtotal ${inr(q.items)}</p></div><div class="shop-added-actions"><button class="button primary" data-route="cart">Go to cart</button><button class="button secondary" data-po-checkout>Proceed to checkout</button><button class="button text" data-route="search">Continue shopping</button></div></section>`;
}
export function cartScreen(state) {
  const lines = cartLines(state), q = quote(lines.map(i => ({price:i.product.price, quantity:i.quantity}))); 
  return `${head('Your cart', 'Review quantities before checkout.')}<div class="shop-toolbar"><button class="button secondary" data-route="search">← Continue shopping</button><strong>${lines.reduce((n,i)=>n+i.quantity,0)} item(s)</strong></div>
    <section class="panel form-panel narrow">${lines.map(i => `<div class="cart-line"><div><b>${esc(i.product.name)}</b><small>${esc(i.product.size)} · ${inr(i.product.price)} each</small></div><label><span>Quantity</span><select data-po-cart-qty="${esc(i.productId)}">${Array.from({length:11}, (_, n) => `<option value="${n}" ${n === i.quantity ? 'selected' : ''}>${n === 0 ? 'Remove' : n}</option>`).join('')}</select></label><strong>${inr(i.product.price * i.quantity)}</strong></div>`).join('') || '<div class="empty-inline"><b>Your cart is empty</b></div>'}
    ${lines.length ? `<table class="price-table"><tbody><tr><td>Items</td><td>${inr(q.items)}</td></tr><tr><td>Delivery</td><td>${q.delivery ? inr(q.delivery) : 'Free'}</td></tr><tr class="total"><td>Estimated total</td><td>${inr(q.total)}</td></tr></tbody></table><button class="button primary full" data-po-checkout>Proceed to checkout</button>` : '<button class="button primary full" data-route="search">Shop products</button>'}</section>`;
}
export function checkoutScreen(state) {
  const fromCart = state.checkoutFromCart, lines = fromCart ? cartLines(state) : [{product:state.products.find(x => x.id === state.checkoutProductId) || state.products[0],quantity:Number(state.checkoutQty || 1)}];
  if (!lines.length) return `${head('Checkout', 'Your cart is empty.')}<button class="button primary" data-route="search">Shop products</button>`;
  const q = quote(lines.map(i => ({price:i.product.price,quantity:i.quantity})));
  return `${head('Secure checkout', `${lines.length} product${lines.length === 1 ? '' : 's'} · estimated delivery today, 6:30 PM`)}
  <section class="panel form-panel narrow"><form data-po-form="checkout" class="form-grid two">
    <div class="shop-checkout-steps wide"><span>1 Delivery address</span><span>2 Payment method</span><span>3 Review order</span></div>
    ${fromCart ? '<button type="button" class="button secondary wide" data-route="cart">Edit cart</button>' : `<label><span>Quantity</span><select name="qty" data-po-qty>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option ${n === lines[0].quantity ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}
    <h2 class="wide shop-step-title">1 · Delivery address</h2>
    <label class="wide"><span>Delivery address</span><textarea name="address" rows="2" required placeholder="House, street, landmark, city and PIN code">${esc(state.deliveryAddress || 'Flat 402, Sector 62, Noida 201301')}</textarea></label>
    <label class="wide"><span>If a grocery item is unavailable</span><select name="substitution"><option value="contact">Contact me before replacing</option><option value="refund">Do not replace; refund the item</option></select></label>
    <h2 class="wide shop-step-title">2 · Payment method</h2>
    <div class="pay-box wide"><div class="pay-methods"><label><input type="radio" name="method" value="upi" checked> UPI</label><label><input type="radio" name="method" value="card"> Card</label><label><input type="radio" name="method" value="cod"> Cash on delivery${q.total > PRODUCT_POLICY.codLimit ? ' (not available above ₹5,000)' : ''}</label></div>
    <label class="pay-field" data-for="upi"><span>UPI ID</span><input name="vpa" id="pay-vpa" value="shubham@okaxis"></label><label class="pay-field" data-for="card" hidden><span>Card number</span><input name="card" id="pay-card" inputmode="numeric"></label>
    <p class="muted">Online payments are held by MoveAI Pay until the order is delivered. Cancel before dispatch for a full refund; return within ${PRODUCT_POLICY.returnDays} days of delivery.</p><p class="mock-hint">${esc(TEST)}</p></div>
    <h2 class="wide shop-step-title">3 · Review items and total</h2>
    <table class="price-table wide"><tbody>${lines.map(i => `<tr><td>${i.quantity} × ${esc(i.product.name)} · ${esc(i.product.size)}</td><td>${inr(i.quantity * i.product.price)}</td></tr>`).join('')}<tr><td>Delivery${q.delivery ? ` (free above ${inr(PRODUCT_POLICY.freeDeliveryAbove)})` : ''}</td><td>${q.delivery ? inr(q.delivery) : 'Free'}</td></tr><tr class="total"><td>Total</td><td>${inr(q.total)}</td></tr></tbody></table>
    ${billingFieldsHtml(state)}
    <p id="po-error" class="field-error wide" hidden></p><div class="form-actions wide"><button type="button" class="button secondary" data-route="${fromCart ? 'cart' : 'search'}">Back</button><button class="button primary" type="submit">Place order · ${inr(q.total)}</button></div></form></section>`;
}
export function ordersScreen(state) {
  const name = id => state.products.find(p => p.id === id)?.name || id;
  return `${head('My orders', 'Track each store package separately. Cancel before pickup or request a return after delivery.', '<button class="button primary" data-route="search">Buy products</button>')}
  ${state.customerOrders.map(o => { const refunds = state.ledger.filter(x => x.orderId === o.id && x.type === 'refund'); return `<section class="panel order-card"><div class="panel-header"><div><h2>${esc(o.id)} · ${inr(o.total)}</h2><p>${o.checkoutId?`Checkout ${esc(o.checkoutId)} · `:''}${o.items.map(i => `${i.quantity} × ${esc(name(i.productId))}`).join(', ')} · ${esc(o.fulfilmentPartner || 'Store partner')}${o.method ? ` · ${o.cod ? 'Cash on delivery' : esc(String(o.method).toUpperCase())}` : ''}</p></div>${pill(o.status)}</div>
    ${o.status === 'payment_pending' ? `<div class="info-banner"><b>Payment processing</b><span>Do not pay again.</span><button class="button secondary compact" data-po="check" data-id="${o.id}">Check status</button></div>` : ''}
    ${o.address ? `<p class="muted">Deliver to: ${esc(o.address)} · ETA ${esc(o.eta)}${o.latestLocation?` · Last update: ${esc(o.latestLocation.label)}`:''}</p>` : ''}
    ${o.cancelReason ? `<p class="muted">${esc(o.cancelReason)}</p>` : ''}
    ${refunds.map(x => `<p class="muted">Refund ${inr(x.amount)} · ${x.status === 'refunded' ? 'reached your account' : `expected by ${new Date(x.expectedBy).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})}`}</p>`).join('')}
    ${o.status==='out_for_delivery'?`<p class="info-banner">Delivery code: <b>${esc(o.deliveryCode)}</b> · share it only when the package reaches you.</p>`:''}
    ${o.status==='item_review'?`<div class="info-banner"><b>Item unavailable: ${esc(o.items.find(i=>i.productId===o.pendingItemId)?.name||'Product')}</b><span>Remove it and continue with the remaining order, or cancel this store order.</span><button class="button primary compact" data-po="remove-unavailable" data-id="${esc(o.id)}">Remove item and continue</button></div>`:''}
    <div class="row-actions"><button class="button primary compact" data-po-track="${esc(o.id)}">Track order</button>${['paid', 'confirmed', 'accepted', 'item_review', 'ready_for_pickup'].includes(o.status) ? `<button class="button secondary compact" data-po="cancel" data-id="${o.id}">Cancel order</button>` : ''}${o.status === 'delivered' && o.deliveredAt ? `<details><summary class="button secondary compact">Return</summary><form class="inline-form" data-po-form="return" data-id="${o.id}"><input name="reason" placeholder="Reason (damaged, wrong item…)" required>${o.cod?'<input name="destination" placeholder="UPI ID for refund" required>':''}<button class="button secondary compact">Request return</button></form></details>` : ''}</div>
    <p class="muted">Payment: ${esc(o.paymentStatus||'legacy')} · Delivery: ${esc(o.deliveryAssignment?.partnerName||'Not assigned')} · Seller payout: ${esc(o.settlementStatus||'legacy')}</p>
    <div class="row-actions">${state.ledger.filter(x => x.orderId === o.id && x.receiptNo).map(x => `<button class="button text compact" data-bill-doc="receipt" data-id="${x.id}">Receipt ${esc(x.receiptNo.split('/').pop())}</button>`).join('')}${(state.customerInvoices || []).filter(i => i.ref === o.id).map(i => `<button class="button text compact" data-bill-doc="invoice" data-id="${i.id}">${esc(i.docType)}</button>`).join('')}${refunds.map(x => `<button class="button text compact" data-bill-doc="credit" data-id="${x.id}">Credit note</button>`).join('')}</div>
    <details><summary class="muted">History</summary>${(o.history || []).map(h => `<small class="block">${esc(h.at)} · ${esc(h.text)}</small>`).join('')}</details></section>`; }).join('') || '<div class="empty-inline"><b>No orders yet</b></div>'}`;
}
export function trackingScreen(state){
 const o=state.customerOrders.find(x=>x.id===state.selectedTrackingOrderId);
 if(!o)return `${head('Track order','Select a package from My orders')}<button class="button secondary" data-route="orders">My orders</button>`;
 const steps=[['Order placed',true],['Store accepted',!!o.history?.some(h=>/Store accepted order/.test(h.text))],['Picking',!!o.pick?.startedAt],['Items picked',!!o.pick?.completedAt],['Packed', ['ready_for_pickup','out_for_delivery','delivery_issue','delivered','return_requested','returned'].includes(o.status)],['Courier collected', ['out_for_delivery','delivery_issue','delivered','return_requested','returned'].includes(o.status)],['Delivered', ['delivered','return_requested','returned'].includes(o.status)]];
 if(['cancelled','item_review','delivery_issue','return_requested','returned'].includes(o.status))steps.push([o.status.replaceAll('_',' '),true]);
 return `${head(`Track ${o.id}`,`${o.fulfilmentPartner||'Store'} · ${o.items.length} item line(s)`,'<button class="button secondary" data-route="orders">All orders</button>')}<section class="panel"><h2>${esc(o.status.replaceAll('_',' '))}</h2><p>${esc(o.address||'Address unavailable')}</p><p>Courier: ${esc(o.deliveryAssignment?.partnerName||'Awaiting assignment')}</p><p>${o.latestLocation?`Last shared checkpoint: ${esc(o.latestLocation.label)} · ${new Date(o.latestLocation.at).toLocaleString('en-IN')}`:'No courier checkpoint yet'}</p><p class="muted">Checkpoints are shared manually in this demo; no live GPS or guaranteed ETA.</p>${o.status==='out_for_delivery'?`<p class="info-banner">Delivery code <b>${esc(o.deliveryCode)}</b> · share when the package arrives.</p>`:''}<ol class="order-timeline">${steps.map(([label,done])=>`<li class="${done?'done':''}">${done?'✓':'○'} ${label}</li>`).join('')}</ol><h3>Items</h3>${o.items.map(i=>`<p>${i.quantity} × ${esc(i.name||i.productId)} · ${inr(i.quantity*i.unitPrice)}</p>`).join('')}<p><b>Total ${inr(o.total)}</b> · ${esc(o.cod?'Cash on delivery':o.method||'Payment pending')}</p><details><summary>All updates</summary>${(o.history||[]).map(h=>`<small class="block">${esc(h.at)} · ${esc(h.actor||'MoveAI')}: ${esc(h.text)}</small>`).join('')}</details></section>`;
}
export function bindOrders(root, api) {
  const S = () => api.getState(), find = id => S().customerOrders.find(o => o.id === id);
  const done = (e, ok) => { if (e) return api.toast(e); api.save(); api.render(); if (ok) api.toast(ok); };
  root.querySelectorAll('[data-po-track]').forEach(b=>b.onclick=()=>{S().selectedTrackingOrderId=b.dataset.poTrack;api.save();api.navigate('orderTracking');});
  root.querySelector('#product-search-form')?.addEventListener('submit', e => { e.preventDefault(); S().productQuery = new FormData(e.currentTarget).get('query'); api.save(); api.render(); });
  root.querySelectorAll('[data-po-query]').forEach(b => b.onclick = () => { S().productQuery = b.dataset.poQuery; api.save(); api.render(); });
  root.querySelectorAll('[data-po-detail]').forEach(b => b.onclick = () => { S().selectedProductId = b.dataset.poDetail; api.save(); api.navigate('productDetail'); });
  root.querySelectorAll('[data-po-add]').forEach(b => b.onclick = () => { const s=S(),qty=Number(root.querySelector('[data-po-detail-qty]')?.value||1),error=addToCart(s,b.dataset.poAdd,qty); if (error) return api.toast(error); s.lastAddedProductId=b.dataset.poAdd; api.save(); api.navigate('cartAdded'); });
  root.querySelectorAll('[data-action="buy-product"]').forEach(b => b.onclick = () => { S().checkoutFromCart = false; S().checkoutProductId = b.dataset.product; S().checkoutQty = Number(root.querySelector('[data-po-detail-qty]')?.value||1); api.save(); api.navigate('productCheckout'); });
  root.querySelectorAll('[data-po-cart-qty]').forEach(x => x.onchange = () => { const error = updateCart(S(), x.dataset.poCartQty, Number(x.value)); if (error) return api.toast(error); api.save(); api.render(); });
  root.querySelector('[data-po-checkout]')?.addEventListener('click', () => { S().checkoutFromCart = true; api.save(); api.navigate('productCheckout'); });
  root.querySelector('[data-po-qty]')?.addEventListener('change', e => { S().checkoutQty = Number(e.target.value); api.save(); api.render(); });
  root.querySelectorAll('input[name="method"]').forEach(r => r.onchange = () => root.querySelectorAll('.pay-field').forEach(f => { f.hidden = f.dataset.for !== r.value; }));
  root.querySelectorAll('[data-po]').forEach(b => b.onclick = () => { const s = S(), o = find(b.dataset.id), k = b.dataset.po;
    if (k === 'check') {const error=checkPayment(s,o);o.paymentStatus=o.status==='paid'?'paid':'failed';return done(error,o.status==='paid'?'Payment confirmed':'Payment failed — order cancelled, nothing charged');}
    if (k === 'remove-unavailable') return done(Commerce.removeUnavailable(s,o.id),'Unavailable item removed');
    if (k === 'cancel') return done(Commerce.customerCancel(s, o.id), o.cod ? 'Order cancelled' : `Cancelled · ${inr(o.total)} refund started`); });
  root.querySelectorAll('form[data-po-form]').forEach(f => f.onsubmit = e => { e.preventDefault(); const s = S(), fd = Object.fromEntries(new FormData(f));
    if (f.dataset.poForm === 'return') return done(Commerce.requestReturn(s, f.dataset.id, fd.reason, fd.destination), 'Return requested · under review');
    const b = readBilling(root); if (b.error) { const el = root.querySelector('#po-error'); el.textContent = b.error; el.hidden = false; return; }
    const r = placeOrder(s, {productId: s.checkoutProductId, fromCart: s.checkoutFromCart, ...fd, billing: b.billing}); if (r.error) { const el = root.querySelector('#po-error'); el.textContent = r.error; el.hidden = false; return; }
    s.deliveryAddress = r.order.address; api.save(); api.navigate('orders'); api.toast(r.order.status === 'payment_pending' ? 'Payment processing — we will confirm shortly' : r.order.cod ? `${r.orders.length} store order(s) placed · pay on delivery` : `Paid ${inr(r.total)} · ${r.orders.length} store order(s) placed`); });
}
