// Voice is an optional input method. Only a reviewed draft can change the cart or catalogue.
const normal = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const numbers = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,ek:1,do:2,teen:3,char:4,panch:5,dus:10,'एक':1,'दो':2,'तीन':3,'चार':4,'पांच':5,'पाँच':5};
const aliases={'चावल':'rice','नमक':'salt','दूध':'milk','आटा':'atta','दाल':'dal','पानी':'water','चीनी':'sugar','चाय':'tea','दही':'curd'};
const quantity = word => numbers[word] || (/^\d+$/.test(word) ? Number(word) : 0);
const unit = /\b(kg|kilogram|kilograms|g|gram|grams|l|litre|liter|litres|liters|ml|packet|packets|packs|pack|units|unit|pieces|piece)\b/gi;

export function productDraft(transcript) {
 const source=String(transcript||'').trim();
 const price=source.match(/(?:₹|rs\.?|rupees?|price(?:\s+of)?|at)\s*(\d+(?:\.\d+)?)/i);
 const stock=source.match(/(?:stock|quantity|units?|opening(?:\s+quantity)?)\s*(?:of|is|at)?\s*(\d+)/i);
 const low=source.match(/(?:low[ -]?stock(?:\s+alert)?|alert)\s*(?:at|is)?\s*(\d+)/i);
 const size=source.match(/\b(\d+(?:\.\d+)?)\s*(kg|kilogram|g|gram|l|litre|liter|ml|packets?|pieces?)\b/i);
 const name=source.replace(/^(?:add|create|new|publish)\s+/i,'').split(/(?:₹|\brs\.?\b|\brupees?\b|\bprice\b|\bat\s+(?:₹|rs\.?\s*)?\d+\b|\bstock\b|\bquantity\b|\bopening\b|\blow[ -]?stock\b|\balert\b)/i)[0].replace(/\bat\s*$/i,'').replace(/[,;]+$/,'').trim().replace(size?new RegExp(`\\s+${size[1]}\\s*${size[2]}$`,'i'):/^$/,'').trim();
 return {name,size:size?`${size[1]} ${size[2].toLowerCase()}`:'',price:price?.[1]||'',quantity:stock?.[1]||'',lowStockAt:low?.[1]||'5',transcript:source};
}
export function productUpdateDraft(transcript,products){
 const source=String(transcript||'').trim();
 const a=source.match(/^(change|update|set|add)\s+(.+?)\s+(price|stock)\s+(to|at|by)\s*(?:₹|rs\.?\s*)?(\d+)$/i);
 const b=source.match(/^(change|update|set)\s+(?:the\s+)?(price|stock)\s+(?:of|for)\s+(.+?)\s+(to|at)\s*(?:₹|rs\.?\s*)?(\d+)$/i);
 if(!a&&!b)return {transcript:source,error:'Say “change Tata Salt price to 30” or “add Tata Salt stock by 10”.'};
 const field=(a?.[3]||b[2]).toLowerCase(),term=a?.[2]||b[3],value=Number(a?.[5]||b[5]);
 const tokens=normal(term).split(' '),matches=(products||[]).filter(p=>tokens.every(t=>normal(`${p.name} ${p.size} ${p.brand||''}`).split(' ').includes(t)));
 return {transcript:source,field,value,delta:/^add\s/i.test(source),options:matches.map(p=>({id:p.id,name:p.name,size:p.size,price:p.price,quantity:p.quantity})),productId:matches.length===1?matches[0].id:'',error:matches.length?'':'Product not found.'};
}

const countPrefix = segment => {
 const m=segment.trim().match(/^(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|char|panch|dus|एक|दो|तीन|चार|पांच|पाँच)\s*(?:x|×|packets?|packs?|pieces?|units?)?\s+)(.+)$/i);
 return m?{qty:quantity(m[1].toLowerCase()),term:m[2]}:{qty:1,term:segment.trim()};
};
export function orderDraft(transcript, products) {
 const source=String(transcript||'').trim();
 const segments=source.replace(/^(?:add|give me|i want|i need|mujhe|please add|मुझे)\s+/i,'').split(/\s*(?:,|;|\band\b|\baur\b|और)\s*/i).filter(Boolean);
 const lines=[];
 for(const segment of segments){
  const {qty,term}=countPrefix(segment.replace(/^(?:add|give me)\s+/i,''));
  const target=normal(term),tokens=target.split(' ').filter(Boolean).map(t=>aliases[t]||t),matches=(products||[]).filter(p=>{
   const searchable=normal(`${p.brand||''} ${p.name} ${p.size} ${p.category}`);
   return tokens.length&&tokens.every(t=>searchable.split(' ').some(x=>x===t||x.startsWith(t)&&t.length>=3));
  });
  lines.push({term,quantity:qty,options:matches.map(p=>({id:p.id,name:p.name,size:p.size,price:p.price})),productId:matches.length===1?matches[0].id:'',issue:qty<1||qty>10?'Choose 1 to 10 units.':matches.length?'':'No matching product; try another name.'});
 }
 return {transcript:source,lines};
}

// Browser recognition may be unavailable or remote. Typed transcript always remains usable.
export function bindMicrophones(root,toast){
 root.querySelectorAll('[data-voice-target]').forEach(button=>button.onclick=()=>{
  const target=root.querySelector(button.dataset.voiceTarget);
  const Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
  if(!target||!Recognition){toast?.('Microphone recognition is unavailable here. Type the words in the box.');target?.focus();return;}
  const recognizer=new Recognition();recognizer.lang=root.querySelector('[data-voice-language]')?.value||'en-IN';recognizer.interimResults=false;
  button.disabled=true;button.textContent='Listening…';
  recognizer.onresult=e=>{target.value=e.results[0][0].transcript;target.dispatchEvent(new Event('input',{bubbles:true}));};
  recognizer.onerror=()=>toast?.('Could not hear clearly. Speak again or type your words.');
  recognizer.onend=()=>{button.disabled=false;button.textContent='🎤 Speak';};
  try{recognizer.start()}catch{recognizer.onend();toast?.('Microphone unavailable. Type your words.');}
 });
}
