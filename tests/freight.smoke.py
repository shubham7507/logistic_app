"""Freight billing browser test: invoice from trip, payer records part payment + TDS, issuer confirms, charge approval, credit rule, export."""
import os, threading, http.server, functools, socketserver, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4207), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False); tmp.write(b'\xff\xd8x'); tmp.close()
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(accept_downloads=True, viewport={'width': 1366, 'height': 900}); pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('http://127.0.0.1:4207/business.html#/home'); pg.wait_for_timeout(200); pg.evaluate('window.MoveAIVNextTest.reset()')
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(100))
    ws = lambda k: (pg.evaluate(f"window.MoveAIVNextTest.switchWorkspace('{k}')"), pg.wait_for_timeout(80))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()')
    main = lambda: pg.locator('#main-content').inner_text()
    shot = lambda n: SHOTS and pg.screenshot(path=f'{SHOTS}/{n}.png', full_page=True)
    ws('transporter'); go('invoices')
    check('Freight billing' in main() and 'new trips paused' in main(), 'billing list with credit rule warning'); shot('60-billing')
    # new invoice for TRP-503
    pg.click('[data-route="invoiceNew"]'); pg.wait_for_timeout(80); pg.select_option('form[data-fr-form="new"] [name=tripId]', 'TRP-503'); pg.wait_for_timeout(40)
    pg.locator('form[data-fr-form="new"] button[type=submit]').click(); pg.wait_for_timeout(100)
    check('Tax invoice' in main() and 'TRP-503' in main(), 'invoice issued'); inv_id = pg.evaluate('window.MoveAIVNextTest.state().selectedInvoiceId')
    f = pg.locator('form[data-fr-form="charge"]'); f.locator('[name=kind]').select_option('detention'); f.locator('[name=amount]').fill('1500'); f.locator('[name=note]').fill('9 hours at gate'); f.locator('[name=evidence]').set_input_files(tmp.name); f.locator('button').click(); pg.wait_for_timeout(80)
    shot('61-invoice-issuer')
    # payer (Sharma Foods) approves charge, pays overdue August invoice partly with TDS
    ws('goods'); go('invoices'); check('To pay' in main(), 'payer tab')
    pg.evaluate(f"(()=>{{}})()"); pg.locator(f'[data-fr-open="{inv_id}"]').first.click(); pg.wait_for_timeout(80)
    pg.locator('[data-fr-charge][data-decision="approve"]').first.click(); pg.wait_for_timeout(80)
    s = st(); inv = next(i for i in s['freightInvoices'] if i['id'] == inv_id); check(inv['charges'][0]['status'] == 'approved' and inv['revision'] == 2, 'charge approved, revision 2')
    old = next(i for i in s['freightInvoices'] if i['tripId'] == 'TRP-488')
    go('invoices'); pg.locator(f'[data-fr-open="{old["id"]}"]').first.click(); pg.wait_for_timeout(80)
    fm = pg.locator('form[data-fr-form="pay"]'); fm.locator('[name=amount]').fill('20000'); fm.locator('[name=tds]').fill('720'); fm.locator('button').click(); pg.wait_for_timeout(60)
    check('UTR' in pg.locator('#fr-error').inner_text(), 'UTR required')
    fm.locator('[name=reference]').fill('UTR88213344'); fm.locator('button').click(); pg.wait_for_timeout(80)
    check('awaiting confirmation' in main(), 'payment waiting for issuer'); shot('62-invoice-payer')
    # issuer confirms
    ws('transporter'); go('invoiceDetail'); pg.evaluate(f"(()=>{{}})()")
    pg.evaluate(f"(()=>{{const s=window.MoveAIVNextTest.state();}})()")
    go('invoices'); pg.locator(f'[data-fr-open="{old["id"]}"]').first.click(); pg.wait_for_timeout(80)
    pg.locator('[data-fr-confirm]').first.click(); pg.wait_for_timeout(80)
    s = st(); check(any(x.get('invoiceId') == old['id'] and x['type'] == 'freight' and x['status'] == 'confirmed' for x in s['ledger']), 'receipt confirmed')
    pg.click(f'[data-fr-remind="{old["id"]}"]'); pg.wait_for_timeout(60)
    check(len(next(i for i in st()['freightInvoices'] if i['id'] == old['id'])['reminders']) == 1, 'reminder sent')
    # export
    go('invoices')
    with pg.expect_download() as dl: pg.click('[data-fr-export]')
    path = dl.value.path(); text = open(path).read(); check('Voucher Type' in text and 'Sales' in text and 'Receipt' in text, 'CSV export')
    # trip detail shows invoice
    go('trips'); pg.locator('[data-op="open-trip"][data-id="TRP-501"]').first.click(); pg.wait_for_timeout(80); check('RL/' in main(), 'invoice on trip')
    # truck owner sees own invoice, TDS exempt
    ws('vehicle'); go('invoices'); check('RT/' in main(), 'truck owner invoice')
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown(); os.unlink(tmp.name)
print(json.dumps({'status': 'PASS', 'suite': 'freight billing'}, indent=2))
