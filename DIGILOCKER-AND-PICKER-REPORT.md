# DigiLocker verification and picker joining — 1 November 2026

## 1. Aadhaar through DigiLocker (identity and shop checks step)

**Before:** the step showed Aadhaar and OTP boxes with no "Send OTP" or "Verify" button. The check ran only on "Save and continue", together with the selfie and shop photos.

**Now:** built the way a KYC provider (Cashfree, HyperVerge, Signzy, Decentro) delivers DigiLocker. The seller never types the Aadhaar number into MoveAI.

1. **Verify with DigiLocker** opens the DigiLocker window (simulated): Aadhaar-linked mobile → **Send OTP** → OTP (valid 10 minutes, 3 tries) → consent screen listing what MoveAI receives → **Allow / Deny**.
2. **The result appears at once** as a card: name, year of birth, district and state, and the masked number (XXXX-XXXX-1234), with three automatic matches:
   - the name compared with the PAN / bank name;
   - age 18 or over;
   - the address district compared with the store.
3. **Mismatches are flagged, not blocked.** A name or district mismatch becomes a risk flag for the reviewer, raises the application to high risk and may add the police certificate. Under 18 is refused.
4. **Every outcome is handled:** wrong OTP, expired OTP, too many tries, no DigiLocker account, consent denied, under 18.
5. **Can't use DigiLocker?**
   - **Aadhaar QR or offline XML:** a photo of the secure QR, or the offline e-KYC ZIP/XML from myAadhaar with its 4-digit share code. Old files (more than 3 days) and invalid signatures are refused.
   - **Check on the video call:** for no smartphone or an Aadhaar mobile that isn't linked. The seller can continue; the reviewer must mark it **Passed** after scanning the Aadhaar QR on the call.
6. **Each other item has its own Verify button** (selfie, shop photos, supplier invoices, police certificate) with an instant result. The selfie needs Aadhaar first, so there is a photo to match against.
7. **Only the masked number and a reference ID are stored.**

Prototype test numbers: any mobile, OTP 123456. Mobile ending 0000 → no account; 1111 → name differs; 2222 → other district; 3333 → under 18. Offline file: any `*.zip` + 4-digit code, or a QR photo; a name containing "old" → too old; "fake" or "edit" → bad signature.

## 2. Adding a picker to a new electrical shop

**Gaps found and fixed**
| Gap | Effect | Fix |
|---|---|---|
| The invite created a staff record but sent nothing to the worker | The worker had no way to join; the new shop's staff app wasn't even reachable | The invite now sends an **SMS/WhatsApp link** (`#/pickJoin/<token>`, valid 7 days). Owner's Staff page shows "invitation sent · opened / not opened", **Resend**, and a demo-only "open invite as the worker" |
| "Save and submit" on the joining form always failed with "Take a photo (JPG or PNG)" | **No picker in any store could finish joining** in the browser | The selfie file name is now passed correctly |
| Checking in from **My work & pay** didn't count as on shift | A present worker was never offered orders | Auto-assignment accepts today's check-in (until they mark leaving) as well as the older "Start shift" |

**The flow now (tested end to end in `tests/picker-join.e2e.cjs`)**
1. Owner → **Staff → Add worker**: name, mobile, role (electrical shops: fulfilment), home branch, pay → **Send invitation**.
2. Worker gets an SMS/WhatsApp link → opens it → enters the invited mobile + OTP + consent → lands in **"<Store> staff"**.
3. **Accept store invitation** → joining details: Aadhaar OTP + date of birth, live selfie, bank/UPI (₹1 check), optional emergency contact. No smartphone? The owner can verify on their behalf (assisted).
4. Owner → **Team → Review joining details** → Approve (or ask for a correction or reject).
5. Owner sets the work days (Sunday is a rest day by default). The worker taps **I'm here today** in My work & pay. The owner approves attendance for pay.
6. When the owner accepts a paid order, it is **offered to an on-shift worker** → **Tasks → Accept task** → check each item → pack → hand to the rider.
7. Pay: monthly, per shift or per order, with advances and payroll under **Pay workers**.

## Tests
| Command | Result |
| --- | --- |
| `node tests/seller-digilocker.unit.mjs` | PASS |
| `node tests/picker-join.unit.mjs` | PASS |
| `node tests/seller-trust.unit.mjs`, `node tests/seller-trust.e2e.cjs` (now clicks through DigiLocker, no-account fallback, wrong OTP, consent, per-item Verify) | PASS |
| `node tests/picker-join.e2e.cjs` (new electrical shop: invite → link → OTP → accept → Aadhaar/selfie/bank → approve → check-in → order offered → task) | PASS |
| Full suite before vs after | Same 23 pre-existing failures before and after, first error identical; no new failures |

## Still needed on the server
1. **DigiLocker through a KYC provider:** consent URL, status polling or webhooks (PENDING / AUTHENTICATED / EXPIRED / CONSENT_DENIED), document fetch, and storing only the reference.
2. **Offline XML/QR signature check** against the UIDAI certificate.
3. **Face match and liveness** through a provider.
4. **Invite SMS/WhatsApp:** through an SMS/WhatsApp provider with approved templates, and an OTP to the invited mobile from the auth service. The worker's account is tied to that mobile, not to the owner's browser.
5. **One attendance system:** merge the old "Start shift" with My work & pay check-ins on the server.
