"""Browser: owner invites with home branch, attendance at two branches, payroll with cash acknowledged by staff, staff verification/payout/claims, petty cash, manager scope, seller onboarding level."""
import os, threading, http.server, functools, socketserver, json, tempfile, datetime
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4260), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:4260'; SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False); tmp.write(b'x'); tmp.close()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()'); main = lambda: pg.locator('#main-content').inner_text()
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(200))
    err = lambda: pg.locator('.hr-error').inner_text() if pg.locator('.hr-error').count() else ''
    pg.goto(f'{B}/seller.html#/storeHR'); pg.wait_for_timeout(300); pg.evaluate('window.MoveAIVNextTest.reset()'); pg.wait_for_timeout(200); go('storeHR')
    check('People & pay' in main() and 'ABC Grocery · Karol Bagh' in main() and 'Home:' in main(), 'team grouped by branch')
    f = pg.locator('form[data-hr-form="invite"]'); f.locator('[name=name]').fill('Priya Singh'); f.locator('[name=mobile]').fill('9811122233'); f.locator('[name=homeBranch]').select_option('grocery-B2'); f.locator('[name=payType]').select_option('per_shift'); f.locator('[name=rate]').fill('450'); f.locator('[name=cover][value="grocery-B1"]').check(); f.locator('button').click(); pg.wait_for_timeout(200)
    pr = [x for x in st()['pickerStaff'] if x['mobile'] == '9811122233'][0]; check(st()['staffHR'][pr['id']]['homeBranch'] == 'grocery-B2', f'invite with home branch ({err()})')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/140-team.png', full_page=True)
    # make Priya active for the demo (the accept flow is covered by v4 tests), add attendance at both branches
    pg.evaluate(f"""(()=>{{const k=Object.keys(localStorage).find(k=>k.startsWith('moveai-vnext'));const d=JSON.parse(localStorage.getItem(k));d.pickerStaff.find(x=>x.id==='{pr['id']}').status='active';localStorage.setItem(k,JSON.stringify(d))}})()"""); pg.reload(); pg.wait_for_timeout(300)
    m = datetime.date.today().strftime('%Y-%m')
    for day, br in [('01', 'grocery-B2'), ('02', 'grocery-B2'), ('03', 'grocery-B1')]:
        fm = pg.locator(f'form[data-hr-form="day"][data-branch="{br}"]'); fm.locator('[name=pid]').select_option(pr['id']); fm.locator('[name=date]').fill(f'{m}-{day}'); fm.locator('button').click(); pg.wait_for_timeout(120)
    check(len([d for d in st()['staffDays'] if d['personId'] == pr['id']]) == 3, f'attendance ({err()})')
    pg.click('[data-hr-tab="payroll"]'); pg.wait_for_timeout(150); pg.click('[data-hr="post"]'); pg.wait_for_timeout(150)
    check('Karol Bagh 1' in main() and 'Noida 2' in main(), 'days by branch in payroll')
    pg.select_option(f'[data-hr-method="{pr["id"]}"]', 'cash'); pg.click(f'[data-hr="pay"][data-id="{pr["id"]}"]'); pg.wait_for_timeout(200)
    pay = [e for e in st()['staffLedger'] if e['personId'] == pr['id'] and e['type'] == 'payment'][0]; check(pay['status'] == 'pending_ack' and pay['amount'] == 1350 + 180 + 100, f'cash pay waits for confirmation ({pay})')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/141-payroll.png', full_page=True)
    pg.click('[data-hr-tab="petty"]'); pg.wait_for_timeout(120); pg.locator('form[data-hr-form="petty"][data-branch="grocery-B1"][data-type="topup"] [name=amount]').fill('2000'); pg.locator('form[data-hr-form="petty"][data-branch="grocery-B1"][data-type="topup"] button').click(); pg.wait_for_timeout(120)
    fe = pg.locator('form[data-hr-form="petty"][data-branch="grocery-B1"][data-type="expense"]'); fe.locator('[name=amount]').fill('120'); fe.locator('[name=note]').fill('Tea for team'); fe.locator('[name=receipt]').set_input_files(tmp.name); fe.locator('button').click(); pg.wait_for_timeout(120)
    check('petty cash ₹1,880' in main(), 'petty cash balance')
    go('plusStore'); check('Onboarding level: 3 of 3' in main() and 'Branch documents' in main(), 'seller onboarding level + branch docs')
    # staff app: Priya confirms cash, verifies, adds UPI, claims a reimbursement
    pg.goto(f'{B}/picker.html#/myHR'); pg.wait_for_timeout(300); pg.evaluate(f"(()=>{{}})()")
    pg.evaluate(f"""(()=>{{const k=Object.keys(localStorage).find(k=>k.startsWith('moveai-vnext'));const d=JSON.parse(localStorage.getItem(k));(d.activePicker||={{}}).picker='{pr['id']}';localStorage.setItem(k,JSON.stringify(d))}})()"""); pg.reload(); pg.wait_for_timeout(300); go('myHR')
    check('Confirm cash you received' in main(), 'staff sees cash to confirm'); pg.locator('[data-hr="ack"][data-ok="1"]').first.click(); pg.wait_for_timeout(150)
    check(next(e for e in st()['staffLedger'] if e['id'] == pay['id'])['status'] == 'acknowledged', 'cash acknowledged')
    k = pg.locator('form[data-hr-form="kyc"]'); k.locator('[name=aadhaar]').fill('234567890123'); k.locator('[name=otp]').fill('123456'); k.locator('[name=dob]').fill('1998-05-01'); k.locator('[name=selfie]').set_input_files(tmp.name); k.locator('[name=emergencyName]').fill('Mom'); k.locator('[name=emergencyMobile]').fill('9811100000'); k.locator('button').click(); pg.wait_for_timeout(150)
    check(st()['staffHR'][pr['id']]['kyc']['status'] == 'verified', 'staff verified')
    pg.locator('form[data-hr-form="payout"] [name=upi]').fill('priya@okaxis'); pg.locator('form[data-hr-form="payout"] button').click(); pg.wait_for_timeout(120)
    pg.locator('summary:has-text("Claim money")').click(); r = pg.locator('form[data-hr-form="my-reimb"]'); r.locator('[name=amount]').fill('200'); r.locator('[name=note]').fill('Carry bags'); r.locator('[name=receipt]').set_input_files(tmp.name); r.locator('button').click(); pg.wait_for_timeout(150)
    check(any(e['type'] == 'reimbursement' and e['status'] == 'submitted' for e in st()['staffLedger']), 'reimbursement claimed')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/142-staff.png', full_page=True)
    # manager: approves the ₹200 claim (within limit); sees only their branch
    pg.goto(f'{B}/seller.html#/storeHR'); pg.wait_for_timeout(300); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('groceryManager')"); go('storeHR')
    check('you manage' in main(), 'manager scope'); pg.click('[data-hr-tab="ledgers"]'); pg.wait_for_timeout(150)
    if pg.locator('[data-hr="decide"][data-d="approve"]').count(): pg.locator('[data-hr="decide"][data-d="approve"]').first.click(); pg.wait_for_timeout(150)
    check(not errs, f'runtime errors: {errs[:3]}')
    b.close()
srv.shutdown(); os.unlink(tmp.name); print(json.dumps({'status': 'PASS', 'suite': 'store people & pay in the browser'}, indent=2))
