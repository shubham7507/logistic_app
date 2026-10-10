// Small, local CSV importer. Preview and commit share validation; commit is atomic.
import {categoryFor, categoryOptions, HOUSEHOLD_CATEGORIES} from './grocery-categories.js';
import {selectedBranch} from './seller-branches.js';

export const HEADERS=['sku','name','size','category','subcategory','veg_status','price','quantity','low_stock_at','brand','status'];
export const template=store=>{
 const category=store==='electrical'?'Electrical & lighting':store==='fashion'?'Fashion & clothing':'Pulses, dal & beans';
 const veg=store==='electrical'||store==='fashion'?'not_applicable':'vegetarian';
 return `${HEADERS.join(',')}\r\nEXAMPLE-001,Example item,1 piece,"${category}",,${veg},99,10,3,Example,draft\r\n`;
};
export function parseCsv(input){
 const text=String(input||'').replace(/^\uFEFF/,'');let rows=[],row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;continue;}
  if(c==='"'){if(field)return {error:'A quote must begin a CSV field.'};quoted=true;}
  else if(c===','){row.push(field);field='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(x=>x.trim()))rows.push(row);row=[];}
  else field+=c;
 }
 if(quoted)return {error:'The CSV has an unclosed quote.'};
 row.push(field);if(row.some(x=>x.trim()))rows.push(row);
 if(rows.length<2)return {error:'Add a header and at least one product row.'};
 const header=rows.shift().map(x=>x.trim().toLowerCase());
 if(header.length!==HEADERS.length||HEADERS.some((x,i)=>x!==header[i]))return {error:`Use this header in order: ${HEADERS.join(',')}`} ;
 if(rows.length>100)return {error:'Import at most 100 products at a time.'};
 const values=[];
 for(const [i,fields] of rows.entries()){
  if(fields.length!==header.length)return {error:`Row ${i+2}: expected ${header.length} columns, found ${fields.length}.`};
  values.push(Object.fromEntries(header.map((k,j)=>[k,fields[j].trim()])));
 }
 return {rows:values};
}
export function preview(state,store,text,inventory){
 if(!inventory.canCatalog(state,store))return {error:'Only the store owner can import product details.'};
 if(text.length>100000)return {error:'This file is too large for the demo. Import at most 100 rows.'};
 const parsed=parseCsv(text);if(parsed.error)return parsed;
 const draft=structuredClone(state),seen=new Set(),items=[];
 for(const [index,row] of parsed.rows.entries()){
  const number=index+2,sku=row.sku.toLowerCase(),name=row.name.toLowerCase(),size=row.size.toLowerCase();
  if(!sku)return {error:`Row ${number}: SKU is required so updates remain unambiguous.`};
  if(seen.has(sku))return {error:`Row ${number}: duplicate SKU in this file.`};seen.add(sku);
  if(!['active','draft'].includes(row.status))return {error:`Row ${number}: status must be active or draft.`};
  if(!categoryOptions.includes(row.category))return {error:`Row ${number}: choose an available category.`};
  if(HOUSEHOLD_CATEGORIES.has(row.category)!==(row.veg_status==='not_applicable'))return {error:`Row ${number}: match dietary label to food or non-food category.`};
  const existing=inventory.forStore(draft,store),matches=existing.filter(p=>String(p.sku||'').toLowerCase()===sku),byName=existing.find(p=>p.name.toLowerCase()===name&&p.size.toLowerCase()===size);
  if(matches.length>1)return {error:`Row ${number}: existing SKU is ambiguous. Fix it manually first.`};
  if(byName&&matches[0]&&byName.id!==matches[0].id)return {error:`Row ${number}: SKU belongs to another product with the same name and pack.`};
  if(byName&&!matches.length)return {error:`Row ${number}: this name and pack already exist with another SKU. Edit it manually.`};
  const id=matches[0]?.id||null;
  const v={sku:row.sku,name:row.name,size:row.size,category:row.category,subcategory:row.subcategory,vegStatus:row.veg_status,price:row.price,quantity:row.quantity,lowStockAt:row.low_stock_at,brand:row.brand,status:row.status};
  const error=inventory.saveProduct(draft,store,id,v);
  if(error)return {error:`Row ${number}: ${error}`};
  items.push({number,action:id?'Update':'New',name:row.name,size:row.size,sku:row.sku,price:row.price,quantity:row.quantity,status:row.status,v,id});
 }
 return {store,branchId:selectedBranch(state,store),items};
}
export function commit(state,store,result,inventory){
 if(!result||result.error||result.store!==store||result.branchId!==selectedBranch(state,store))return 'Choose a CSV and preview it for the current branch first.';
 if(!inventory.canCatalog(state,store))return 'Only the store owner can import products.';
 const draft=structuredClone(state);
 for(const item of result.items){
  const matches=inventory.forStore(draft,store).filter(p=>p.sku?.toLowerCase()===item.sku.toLowerCase());
  if(matches.length>1||Boolean(matches[0])!==Boolean(item.id)||matches[0]&&matches[0].id!==item.id)return 'The catalogue changed since preview. Choose the file and preview it again.';
  const error=inventory.saveProduct(draft,store,item.id,item.v);if(error)return `Row ${item.number}: ${error}`;
 }
 Object.assign(state,draft);return '';
}
