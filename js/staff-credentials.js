// Browser-only review records. Never use real identity or payout documents in this demo.
export const fileTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
export async function demoFile(file) {
  if (!file || !file.name) return null;
  if (!fileTypes.includes(file.type)) throw Error('Choose a PNG, JPG, WebP or PDF test file.');
  if (file.size > 120000) throw Error('Demo files must be under 120 KB. Use a small mock file.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('Could not read this test file.')); reader.readAsDataURL(file);
  });
  return {name:file.name, type:file.type, data};
}
export function preview(file, label) {
  if (!file?.data || !/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(file.data)) return '';
  const safe = text(label);
  return `<details><summary class="button secondary compact">View ${safe}</summary>${file.type==='application/pdf'?`<iframe title="${safe}" src="${file.data}" style="width:100%;height:320px;border:0"></iframe>`:`<img alt="${safe}" src="${file.data}" style="display:block;max-width:100%;max-height:320px;margin:12px 0">`}</details>`;
}
export function text(value) { return String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function log(s, personId, kind, status, actor, note='') {
  (s.staffCredentialHistory ||= []).unshift({personId,kind,status,actor,note,at:new Date().toISOString()});
}
export function history(s, personId) {
  return (s.staffCredentialHistory||[]).filter(x=>x.personId===personId);
}
