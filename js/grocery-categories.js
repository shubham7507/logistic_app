// One primary category per SKU; search may use names, synonyms and pack sizes.
export const GROCERY_CATEGORIES = {
 'Rice, grains & cereals':['Rice','Oats & grains','Poha, dalia & rava'],
 'Pulses, dal & beans':['Dal','Beans & chickpeas'],
 'Flour & atta':['Atta','Besan & other flours'],
 'Cooking oil & ghee':['Cooking oil','Ghee'],
 'Spices & masala':['Salt','Ground spices','Whole spices'],
 'Fresh vegetables':['Root vegetables','Leafy vegetables','Other vegetables'],
 'Fresh fruits':['Local fruits','Seasonal & imported fruits'],
 'Dairy & paneer':['Milk','Curd','Cheese & paneer','Butter & cream'],
 'Bakery':['Bread & buns','Other egg-free bakery'],
 'Pasta & noodles':['Pasta','Noodles & vermicelli'],
 'Canned & packaged food':['Beans & vegetables','Vegetarian ready meals','Pickles'],
 'Sauces & condiments':['Sauces','Dressings & spreads'],
 'Biscuits & snacks':['Biscuits','Savoury snacks'],
 'Chocolates & sweets':['Chocolate','Vegetarian sweets'],
 'Tea & coffee':['Tea','Coffee','Hot chocolate'],
 'Beverages':['Water','Juices','Soft drinks'],
 'Nuts, seeds & dry fruits':['Nuts','Seeds','Dry fruits'],
 'Breakfast foods':['Cereals','Spreads'],
 'Organic & health foods':['Organic','Vegan','Gluten-free'],
 'Baking ingredients':['Flours & mixes','Raising agents','Chocolate & flavouring'],
 'Personal care':['Bath','Hair','Oral care'], 'Laundry care':['Detergent','Fabric care'],
 'Home cleaning':['Surfaces','Bathroom cleaning'], 'Dishwashing':['Liquid','Bars'],
 'Paper & tissue':['Tissues','Paper rolls'], 'Garbage & waste':['Bin bags'],
 'Cleaning tools':['Brushes','Mops'], 'Pest control':['Repellents'],
 'Kitchen supplies':['Kitchen essentials'], 'Food storage':['Containers','Wraps'],
 'Electrical & lighting':['Bulbs','Batteries'], 'Hardware & repair':['Tools'],
 'Bathroom supplies':['Bathroom accessories'], 'Bedroom & bedding':['Bedding'],
 'Baby care':['Baby supplies'], 'Pet care':['Pet accessories & supplies'],
 'Garden & outdoor':['Garden supplies'], 'Clothing & shoe care':['Shoe care'],
 'Home fragrance':['Fresheners'], 'Home safety':['Safety supplies'],
 'Fashion & clothing':['Shirts','Trousers','Other clothing']
};
export const categoryOptions=Object.keys(GROCERY_CATEGORIES);
export const HOUSEHOLD_CATEGORIES=new Set(categoryOptions.slice(categoryOptions.indexOf('Personal care')));
export const subcategories=category=>GROCERY_CATEGORIES[category]||[];
export const LEGACY_CATEGORY={Rice:'Rice, grains & cereals',Flour:'Flour & atta',Essentials:'Spices & masala'};
export const categoryFor=p=>LEGACY_CATEGORY[p.category]||p.category;
export const excludedProduct=name=>/\b(?:egg|eggs|meat|chicken|seafood|fish|prawn|shrimp|gelatin|gelatine|frozen)\b/i.test(String(name||''));
export function guessCategory(name){
 const text=String(name||'').toLowerCase();
 const rules=[[/rice|oats|poha|rava|quinoa/,'Rice, grains & cereals'],[/salt|masala|spice|turmeric|chilli/,'Spices & masala'],[/atta|flour|maida|besan/,'Flour & atta'],[/milk|paneer|cheese|curd|butter/,'Dairy & paneer'],[/dal|lentil|chana|rajma/,'Pulses, dal & beans'],[/bread|bun|rusk/,'Bakery'],[/oil|ghee/,'Cooking oil & ghee'],[/soap|shampoo|toothpaste/,'Personal care'],[/tomato|potato|onion|spinach/,'Fresh vegetables'],[/apple|banana|mango/,'Fresh fruits']];
 return rules.find(([re])=>re.test(text))?.[1]||'Rice, grains & cereals';
}
