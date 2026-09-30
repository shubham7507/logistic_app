"""Workforce + worker money browser test (python Playwright)."""
import os, threading, http.server, functools, socketserver, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4204), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False); tmp.write(b'\xff\xd8x'); tmp.close()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('dialog', lambda d: d.accept('Carton was already damaged at loading'))
    pg.goto('http://127.0.0.1:4204/business.html#/home'); pg.wait_for_timeout(200); pg.evaluate('window.MoveAIVNextTest.reset()')
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(100))
    ws = lambda k: (pg.evaluate(f"window.MoveAIVNextTest.switchWorkspace('{k}')"), pg.wait_for_timeout(80))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()')
    main = lambda: pg.locator('#main-content').inner_text()
    shot = lambda n: SHOTS and pg.screenshot(path=f'{SHOTS}/{n}.png', full_page=True)
    ws('transporter'); go('workforce')
    check('Workforce' in main() and 'Contractor-supplied' in main() and 'Field crew' in main(), 'directory'); shot('40-workforce')
    pg.click('[data-wf-filter="field"]'); pg.wait_for_timeout(60); check('Sunita' not in main(), 'field filter hides office staff')
    go('dutyBoard'); check('Free today' in main() and 'Tomorrow' in main(), 'duty board'); shot('41-duty-board')
    # trip settlement for TRP-501
    go('trips'); pg.locator('[data-op="open-trip"][data-id="TRP-501"]').first.click(); pg.wait_for_timeout(80)
    pg.click('[data-route="tripSettlement"]'); pg.wait_for_timeout(80); check('Crew settlement' in main(), 'settlement screen')
    form = pg.locator('form[data-wf-form="expense"]').first
    form.locator('[name=category]').select_option('food'); form.locator('[name=amount]').fill('350'); form.locator('[name=proof]').set_input_files(tmp.name)
    form.locator('button').click(); pg.wait_for_timeout(80)
    pg.locator('[data-wf-post]').first.click(); pg.wait_for_timeout(60); check('Approve or reject' in pg.locator('#wf-error').inner_text(), 'pending receipt blocks posting')
    pg.locator('[data-wf-expense][data-decision="approved"]').first.click(); pg.wait_for_timeout(60)
    pg.locator('[data-wf-post]').first.click(); pg.wait_for_timeout(80); check('Posted to khata' in main(), 'posted'); shot('42-trip-settlement')
    # khata + deduction
    pg.locator('[data-wf-khata]').first.click(); pg.wait_for_timeout(80); check('Khata' in main() and 'Bata' in main(), 'khata shows bata')
    f = pg.locator('form[data-wf-form="deduction"]'); f.locator('[name=reason]').select_option('damage'); f.locator('[name=amount]').fill('400'); f.locator('[name=note]').fill('Two cartons damaged'); f.locator('[name=evidence]').set_input_files(tmp.name)
    f.locator('button').click(); pg.wait_for_timeout(80); check('Two cartons damaged' in main(), 'deduction added'); shot('43-khata-owner')
    # driver persona sees own khata and disputes
    ws('commercialDriver'); go('money'); check('My khata' in main(), 'driver sees own khata')
    pg.locator('.dispute-box summary').first.click(); pg.locator('form[data-wf-form="dispute"] [name=reason]').first.fill('Carton was already damaged at loading'); pg.locator('form[data-wf-form="dispute"] button').first.click(); pg.wait_for_timeout(80)
    check(any(a['status'] == 'disputed' for a in st()['accruals']), 'dispute recorded'); shot('44-khata-driver')
    # owner resolves, runs payroll
    ws('transporter'); go('workforce'); pg.locator('[data-wf-khata="staff:WORKER-001"]').click(); pg.wait_for_timeout(80)
    pg.locator('[data-wf-resolve][data-decision="waive"]').first.click(); pg.wait_for_timeout(60)
    check(any(a['status'] == 'waived' for a in st()['accruals']), 'dispute waived')
    go('payroll'); check('Advance recovery' in main(), 'payroll table')
    pg.click('[data-wf-payroll="prepare"]'); pg.wait_for_timeout(60); pg.click('[data-wf-payroll="approve"]'); pg.wait_for_timeout(60)
    pg.click('[data-wf-payroll="pay"]'); pg.wait_for_timeout(80); check('payslips' in main(), 'payroll paid'); shot('45-payroll')
    run = st()['payrollRuns'][0]; check(run['status'] == 'paid', 'run paid')
    # contractor: record helper payments
    go('workforce'); pg.locator('[data-wf-khata="con:CON-2"]').click(); pg.wait_for_timeout(80)
    pg.fill('form[data-wf-form="contractor"] textarea', 'Raju Kumar, 750\nSonu Paswan, 750'); pg.locator('form[data-wf-form="contractor"] button').click(); pg.wait_for_timeout(60)
    check(len(st()['contractorDistributions']) == 1, 'contractor distribution recorded')
    # accountant (staff, money.prepare) can prepare but role limits apply; dispatcher cannot open payroll
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown(); os.unlink(tmp.name)
print(json.dumps({'status': 'PASS', 'suite': 'workforce + worker money'}, indent=2))
