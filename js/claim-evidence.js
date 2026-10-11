import {esc} from './ops.js';

// A small, browser-local preview for the GitHub Pages demo. Never treat it as a real upload.
const types = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
export async function readEvidence(file, {pdf = false} = {}) {
  if (!file || !file.name || !file.size) return null;
  if (!types[file.type] || (!pdf && file.type === 'application/pdf')) throw new Error(pdf ? 'Choose a JPG, PNG, WebP or PDF file.' : 'Choose a JPG, PNG or WebP photo.');
  if (file.size > 8_000_000) throw new Error('Choose a photo below 8 MB. PDFs must be below 350 KB.');
  if (file.type === 'application/pdf' && file.size > 350_000) throw new Error('Choose a PDF smaller than 350 KB for this browser-local demo.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file. Please try another.'));
    reader.readAsDataURL(file);
  });
  if (file.size <= 350_000) return {name:file.name.slice(0,120),mime:file.type,data};
  // Resize normal phone photos so role switching in one browser does not fill localStorage.
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('This photo needs a browser to shrink it for the demo.');
  const picture=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Could not open that photo.'));img.src=data;});
  const canvas=document.createElement('canvas'),scale=Math.min(1,1100/Math.max(picture.width,picture.height));canvas.width=Math.max(1,Math.round(picture.width*scale));canvas.height=Math.max(1,Math.round(picture.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Photo resizing is unavailable in this browser.');
  ctx.drawImage(picture,0,0,canvas.width,canvas.height);
  let compact=canvas.toDataURL('image/jpeg',.7);
  if(compact.length>470_000)compact=canvas.toDataURL('image/jpeg',.45);
  if(compact.length>470_000)throw new Error('The photo is still too large. Please crop it and try again.');
  return {name:file.name.replace(/\.[^.]+$/,'.jpg').slice(0,120),mime:'image/jpeg',data:compact};
}
export function evidenceHtml(evidence, fallback = '', label = 'Customer damage photo') {
  if (!evidence?.data || !types[evidence.mime] || !evidence.data.startsWith(`data:${evidence.mime};base64,`))
    return fallback ? `<small class="block muted">${esc(label)}: ${esc(fallback)} (older claim: image unavailable)</small>` : '';
  const src = esc(evidence.data), name = esc(evidence.name || label);
  return `<div class="claim-evidence"><b>${esc(label)}</b>${evidence.mime === 'application/pdf' ? '' : `<img src="${src}" alt="${name}" loading="lazy">`}<a class="button secondary compact" href="${src}" target="_blank" rel="noopener" download="${name}">${evidence.mime === 'application/pdf' ? 'Open PDF' : 'Open photo'}</a><small>${name}</small></div>`;
}
