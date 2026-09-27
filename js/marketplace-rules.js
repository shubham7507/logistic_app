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
  if (typeof req.dharamkata !== 'boolean') return 'Choose whether Dharamkata is required.';
  if (!String(req.paymentTerms || '').trim()) return 'Enter payment terms.';
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
  if (!String(post.destinationPreference || '').trim()) return 'Enter a destination preference.';
  if (!String(post.crew || '').trim()) return 'Choose the crew arrangement.';
  if (post.vehicleStatus && post.vehicleStatus !== 'idle') return 'Only an idle vehicle can be published.';
  return '';
}

export function routeMatch(truck, item) {
  const location = String(truck.location || '').toLowerCase();
  const destination = String(truck.destinationPreference || '').toLowerCase();
  const routeText = `${item.from || item.pickup || ''} ${item.to || item.drop || ''} ${item.route || ''}`.toLowerCase();
  const dateKey=value=>{if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toISOString().slice(0,10)};
  const sameDay=!truck.availableDate||!item.date||dateKey(truck.availableDate)===dateKey(item.date);
  const crewReady=!String(truck.crew||'').toLowerCase().startsWith('need');
  return truck.status === 'available' && truck.documents === 'approved' && sameDay && crewReady &&
    routeText.includes(location) && (!destination || routeText.includes(destination.split(' ')[0])) &&
    String(truck.truckType).toLowerCase() === String(item.truckType).toLowerCase() &&
    Number(truck.capacity) >= Number(item.capacity);
}

export function matchBreakdown(truck,item){
  const routeText=`${item.from||item.pickup||''} ${item.to||item.drop||''} ${item.route||''}`.toLowerCase();
  const dateKey=value=>{if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toISOString().slice(0,10)};
  const checks={
    route:routeText.includes(String(truck.location||'').toLowerCase()),
    destination:!truck.destinationPreference||routeText.includes(String(truck.destinationPreference).toLowerCase().split(' ')[0]),
    date:!truck.availableDate||!item.date||dateKey(truck.availableDate)===dateKey(item.date),
    vehicle:String(truck.truckType||'').toLowerCase()===String(item.truckType||'').toLowerCase(),
    capacity:Number(truck.capacity)>=Number(item.capacity),
    documents:truck.documents==='approved',
    crew:!String(truck.crew||'').toLowerCase().startsWith('need'),
    conflict:!truck.activeAssignment,
  };
  const passed=Object.values(checks).filter(Boolean).length;
  const labels={route:'route',destination:'destination',date:'date',vehicle:'vehicle',capacity:'capacity',documents:'documents',crew:'crew',conflict:'no conflict'};
  return {checks,reasons:Object.entries(checks).filter(([,ok])=>ok).map(([key])=>labels[key]),score:Math.round(passed/Object.keys(checks).length*100),eligible:Object.values(checks).every(Boolean)};
}

export function requirementVisibleTo(req,businessName,businesses=[]){
  if(req.arrangement==='own_vehicle')return false;
  if(req.arrangement==='selected_transporters')return req.selectedTransporters?.includes(businessName);
  const business=businesses.find(x=>x.name===businessName);
  if(req.arrangement==='eligible_network')return Boolean(business?.verified&&business.services.includes('transport')&&business.routes.some(r=>`${req.pickup} ${req.drop}`.includes(r)));
  return false;
}

export function canViewOpportunity(op,workspace){return Boolean(op?.participantWorkspaces?.includes(workspace)||op?.participants?.includes(workspace))}

export function validateOffer(offer){
  if(Number(offer.freight)<=0)return 'Enter a valid freight amount.';
  if(Number(offer.advance)<0||Number(offer.advance)>Number(offer.freight))return 'Advance must be between zero and freight.';
  if(!offer.pickupDate||!offer.expiresAt)return 'Pickup date and offer expiry are required.';
  if(!String(offer.conditions||'').trim())return 'Enter offer conditions.';
  return '';
}

export function canConvertOpportunity(opportunity) {
  if(!opportunity || !['discussion', 'matched', 'terms_agreed'].includes(opportunity.status) || opportunity.canonicalLoadId)return false;
  if(!opportunity.confirmations)return true;
  return (opportunity.participantWorkspaces||opportunity.participants||[]).every(x=>opportunity.confirmations[x]);
}

export function privatePartyLabel(post, workspace) {
  return post.status === 'accepted' || workspace === post.workspace ? post.goodsOwnerPrivate : post.goodsOwnerDisplay;
}
