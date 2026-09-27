export const ARRANGEMENT_MODES = {
  own_vehicle: {label: 'Use my own vehicle', audience: ['goods']},
  selected_transporters: {label: 'Send to selected Transporters', audience: ['goods', 'transporter']},
  eligible_network: {label: 'Publish to eligible Transporters', audience: ['goods', 'transporter']},
};

export function validateGoodsOrder(order) {
  if (!['buy', 'sell'].includes(order.type)) return 'Choose Buy or Sell.';
  if (!String(order.counterparty || '').trim()) return 'Enter the buyer or seller.';
  if (!String(order.goods || '').trim()) return 'Enter the goods.';
  if (Number(order.quantity) <= 0) return 'Quantity must be greater than zero.';
  if (Number(order.goodsPrice) <= 0) return 'Enter the confirmed goods price.';
  if (!['buyer', 'seller'].includes(order.transportResponsibility)) return 'Choose who arranges transport.';
  return '';
}

export function validateTransportRequirement(req) {
  if (!req.goodsOrderId) return 'Select a confirmed goods order.';
  if (!String(req.pickup || '').trim() || !String(req.drop || '').trim()) return 'Enter pickup and delivery locations.';
  if (req.pickup === req.drop) return 'Pickup and delivery locations must be different.';
  if (!req.pickupDate) return 'Select the pickup date.';
  if (!String(req.truckType || '').trim()) return 'Select the required vehicle.';
  if (Number(req.capacity) <= 0) return 'Capacity must be greater than zero.';
  return '';
}

export function validateLoadRequirement(req) {
  if (!String(req.from || '').trim() || !String(req.to || '').trim()) return 'Enter both route locations.';
  if (req.from === req.to) return 'Start and destination must be different.';
  if (!req.date || !req.truckType || Number(req.capacity) <= 0) return 'Date, truck type and capacity are required.';
  return '';
}

export function validateTruckAvailability(post) {
  if (!post.registration || !post.location || !post.availableDate) return 'Truck, current location and available date are required.';
  if (!post.truckType || Number(post.capacity) <= 0) return 'Truck type and capacity are required.';
  if (post.documents !== 'approved') return 'Only a truck with approved documents can be published.';
  return '';
}

export function routeMatch(truck, item) {
  const location = String(truck.location || '').toLowerCase();
  const destination = String(truck.destinationPreference || '').toLowerCase();
  const routeText = `${item.from || item.pickup || ''} ${item.to || item.drop || ''} ${item.route || ''}`.toLowerCase();
  return truck.status === 'available' && truck.documents === 'approved' &&
    routeText.includes(location) && (!destination || routeText.includes(destination.split(' ')[0])) &&
    String(truck.truckType).toLowerCase() === String(item.truckType).toLowerCase() &&
    Number(truck.capacity) >= Number(item.capacity);
}

export function canConvertOpportunity(opportunity) {
  return Boolean(opportunity && ['discussion', 'matched', 'terms_agreed'].includes(opportunity.status) && !opportunity.canonicalLoadId);
}

export function privatePartyLabel(post, workspace) {
  return post.status === 'accepted' || workspace === post.workspace ? post.goodsOwnerPrivate : post.goodsOwnerDisplay;
}

