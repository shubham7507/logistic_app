# MoveAI staff ID methods — implementation and test guide

## Changed screens

**Store Staff → My work & pay → My ID** has four selectable methods:

1. **Aadhaar OTP (demo):** enter a test 12-digit Aadhaar number, click Send demo OTP, enter `123456` within five minutes, and consent. No card files or selfie are requested. The store owner then confirms that the worker joined the store; this is a separate joining decision. The app does not contact UIDAI or send an SMS.
2. **Aadhaar QR / offline file (demo):** submit a small mock QR image, PDF or XML, test ID suffix, DOB and mock selfie. This demo cannot check UIDAI signatures, so the store receives a manual review task. It does not label the file as UIDAI verified.
3. **Aadhaar document, manual:** submit mock front and back image/PDF, test last four digits, DOB and selfie. No OTP is requested. The store owner approves, asks for a correction or escalates to platform review.
4. **Other ID, manual:** choose Voter ID, Driving licence or Passport, submit front/back mock files, suffix, DOB and selfie. No Aadhaar field or OTP is requested.

A separate **Personal details → Emergency contact** section holds the contact name and mobile. Previously seeded Asha displays **Demo identity prefilled · no document review submitted** until she submits a new ID path.

Seller **People & pay → Team by branch** displays a method-specific task: *Confirm worker joined* for mock OTP, or *Approve documents* for manual methods. Admin **Documents** handles escalated ID cases and returns cleared cases to the owner for a final decision. Worker status and history show corrections and approval.

## Results

| Test | Result |
|---|---|
| New OTP send, wrong OTP, successful OTP without card images, owner confirmation | Passed (`tests/staff-id-methods.e2e.mjs`) |
| Offline submission, correction, resubmission and store review | Passed |
| Aadhaar front/back required in manual path; no OTP needed | Passed |
| Other ID and emergency contact; manager cannot see ID previews or approval controls | Passed |
| Platform escalation and return to owner | Passed |
| Existing staff, bank review and payroll regression suites | Passed |
| Commerce/admin route and navigation integration, JavaScript syntax | Passed |
| Interactive browser smoke | Not run: browser binary is unavailable in this workspace |

## Manual walkthrough in a single browser profile

1. Open `picker.html#/myHR` as Asha. Expand **My ID**, choose **Aadhaar OTP**, enter `234567890123`, click **Send demo OTP**, use `123456`, consent and submit. Open `seller.html#/storeHR` as ABC Grocery, then **Team by branch → Asha → Confirm worker joined**.
2. Return as Asha and choose **Aadhaar QR / offline file**. Upload a small mock image/PDF/XML, enter `0123`, DOB and a test selfie. The owner can request correction, and Asha can resubmit. The platform has not actually validated a signature.
3. Choose **Aadhaar document**. Upload mock front and back files; the owner can review previews and approve or escalate. Repeat using **Another ID** to see the alternate document form.
4. Update the emergency contact independently. Check profile summary, status and review history in both Staff and Seller views.

All ID, OTP, bank and payout checks are simulated and stored in the same browser profile. Use mock files under 120 KB; never enter actual Aadhaar numbers or upload real personal documents. A real deployment needs an authorised identity integration, secure document storage and access controls, consent and deletion handling, and server-side transaction/audit logic.
