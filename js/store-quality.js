// Checks reflect the item category and are saved with the mock order checklist.
export function checksFor(product){
  const category=String(product?.category||'').toLowerCase();
  if(category.includes('electrical'))return ['Model / wattage matches order','Item and packaging are undamaged'];
  if(category.includes('fashion')||category.includes('clothing'))return ['Size and colour match order','Item is clean and undamaged'];
  if(['fresh vegetables','fresh fruits','dairy & eggs','bakery'].some(x=>category.includes(x)))return ['Freshness / expiry checked','Item and packaging are suitable'];
  return [];
}
export function checkError(product,confirmed){
  const checks=checksFor(product);
  return checks.length&&(!Array.isArray(confirmed)||checks.some((_,i)=>confirmed[i]!==true))?'Confirm every product-specific check before marking this item ready.':'';
}
