export const MOCK_OTP='123456';
export const OTP_VALID_MS=2*60*1000;
export const MAX_OTP_ATTEMPTS=5;
export const RESEND_WAIT_MS=30*1000;

export function normalizeMobile(value){return String(value||'').replace(/\D/g,'').replace(/^91(?=\d{10}$)/,'')}
export function validateMobile(value){return /^[6-9]\d{9}$/.test(normalizeMobile(value))}
export function maskMobile(value){const m=normalizeMobile(value);return m.length===10?`+91 ••••••${m.slice(-4)}`:'+91 ••••••••••'}
export function isKnownMobile(value,known=[]){const m=normalizeMobile(value);return known.some(x=>normalizeMobile(x.mobile)===m)}
export function otpStatus({entered,expected=MOCK_OTP,sentAt=0,now=Date.now(),attempts=0}){
  if(attempts>=MAX_OTP_ATTEMPTS)return 'locked';
  if(now-sentAt>OTP_VALID_MS)return 'expired';
  return String(entered||'').trim()===expected?'valid':'invalid';
}
export function canResend(sentAt,now=Date.now()){return now-sentAt>=RESEND_WAIT_MS}
