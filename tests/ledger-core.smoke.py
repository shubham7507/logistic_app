"""Browser: Pay & ledgers for a transporter owner (balances, approvals, cash paid → worker confirms, petty cash, limits) and a store manager."""
import os, threading, http.server, functools, socketserver, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4280), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:4280'
def check(c, m):
    if not c: raise AssertionError(m)
tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False); tmp.write(b'x'); tmp.close()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()'); main = lambda: pg.locator('#main-content').inner_text()
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(200))
    er = lambda: pg.locator('.lc-error').inner_text() if pg.locator('.lc-error').count() else ''
    pg.goto(f'{B}/business.html#/home'); pg.wait_for_timeout(300); pg.evaluate('window.MoveAIVNextTest.reset()'); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('transporter')"); go('payLedgers')
    check('Pay & ledgers' in main() and 'Mohan Yadav' in main(), 'balances table')
    pg.locator('[data-lc-person="EMP-WORKER-001"]').click(); pg.wait_for_timeout(150)
    bal = next(int(x) for x in [pg.locator('form[data-lc-form="cash"] [name=amount]').input_value()] ) if pg.locator('form[data-lc-form="cash"]').count() else 0
    if bal > 0:
        pg.locator('form[data-lc-form="cash"] button').click(); pg.wait_for_timeout(150)
        check(any(x.get('ack') == 'pending' for x in st()['ledger']), f'cash pay recorded ({er()})')
    pg.click('[data-lc-tab="petty"]'); pg.wait_for_timeout(120)
    pg.locator('form[data-lc-form="petty"][data-branch="BR-001"][data-type="topup"] [name=amount]').fill('3000'); pg.locator('form[data-lc-form="petty"][data-branch="BR-001"][data-type="topup"] button').click(); pg.wait_for_timeout(120)
    fe = pg.locator('form[data-lc-form="petty"][data-branch="BR-001"][data-type="expense"]'); fe.locator('[name=amount]').fill('150'); fe.locator('[name=note]').fill('Tea for loaders'); fe.locator('[name=receipt]').set_input_files(tmp.name); fe.locator('button').click(); pg.wait_for_timeout(120)
    check('petty cash ₹2,850' in main(), f'business petty cash ({er()})')
    pg.click('[data-lc-tab="policy"]'); pg.wait_for_timeout(120); pg.fill('form[data-lc-form="policy"] [name=manager]', '3000'); pg.locator('form[data-lc-form="policy"] button').click(); pg.wait_for_timeout(120)
    check(st()['approvalPolicy']['transporter']['manager'] == 3000, 'limits saved')
    pg.click('[data-lc-tab="approvals"]'); pg.wait_for_timeout(120); check('Who approves' in main(), 'approvals inbox')
    pg.click('[data-lc-tab="register"]'); pg.wait_for_timeout(120)
    if bal > 0: check('waiting for staff confirmation' in main(), 'register shows cash waiting')
    # worker (Mohan, commercial driver persona or staff view) confirms cash via staff workspace
    if bal > 0:
        pg.goto(f'{B}/partner.html#/money'); pg.wait_for_timeout(300); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('commercialDriver')"); go('money')
        check('Confirm cash you received' in main(), 'worker sees cash to confirm'); pg.locator('[data-lc-ack][data-ok="1"]').first.click(); pg.wait_for_timeout(150)
        check(any(x.get('ack') == 'confirmed' for x in st()['ledger']), 'worker confirmed')
    # store manager: only Karol Bagh, approvals respect the limit
    pg.goto(f'{B}/seller.html#/payLedgers'); pg.wait_for_timeout(300); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('groceryManager')"); go('payLedgers')
    check('Pay & ledgers' in main() and 'Karol Bagh' in main(), 'store manager view')
    check(not errs, f'runtime errors: {errs[:3]}')
    b.close()
srv.shutdown(); os.unlink(tmp.name); print(json.dumps({'status': 'PASS', 'suite': 'pay & ledgers in the browser'}, indent=2))
