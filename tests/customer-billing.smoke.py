"""Customer billing in the browser: driver breakdown + extras + receipt + bill of supply; movers inventory quote + survey + fixed quote; product receipt/invoice; customer Payments screen."""
import os, threading, http.server, functools, socketserver, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4211), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False); tmp.write(b'\xff\xd8x'); tmp.close()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('http://127.0.0.1:4211/index.html#/home'); pg.wait_for_timeout(200); pg.evaluate('window.MoveAIVNextTest.reset()')
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(100))
    ws = lambda k, prod=None: (pg.evaluate(f"window.MoveAIVNextTest.switchWorkspace('{k}'{', ' + repr(prod) if prod else ''})"), pg.wait_for_timeout(80))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()')
    main = lambda: pg.locator('#main-content').inner_text()
    shot = lambda n: SHOTS and pg.screenshot(path=f'{SHOTS}/{n}.png', full_page=True)
    ws('personal', 'customer')
    # 1. hire a driver: breakdown, rate card, GSTIN validation
    go('home'); pg.click('[data-customer-service="driver"]'); pg.wait_for_timeout(80)
    pg.select_option('#booking-form [name=carType]', 'SUV automatic'); pg.locator('#booking-form button[type=submit]').click(); pg.wait_for_timeout(100)
    t = main(); check('the driver gets all of this' in t and 'MoveAI booking fee' in t and 'GST on booking fee' in t and 'Extra time beyond the booking' in t, 'driver breakdown + rate card'); shot('100-driver-quote')
    pg.fill('#bill-gstin', '12345'); pg.click('[data-op="booking-publish"]'); pg.wait_for_timeout(60); check(len(st()['serviceRequests']) == 4, 'invalid GSTIN blocks booking')
    pg.fill('#bill-gstin', '09ABCDE1234F1Z5'); pg.click('[data-op="booking-publish"]'); pg.wait_for_timeout(100)
    r = st()['serviceRequests'][0]; check(r['billing']['gstin'] == '09ABCDE1234F1Z5', 'billing saved')
    # driver accepts, adds extras, finishes
    ws('personalDriver'); go('myJobs'); pg.locator(f'[data-id="{r["id"]}"]').first.click(); pg.wait_for_timeout(100)
    check('Your earnings' in main() and '₹0 — MoveAI’s booking fee is paid by the customer' in main(), 'driver sees earnings, no commission'); shot('101-driver-earnings')
    f = pg.locator(f'form[data-extra-form="{r["id"]}"]'); f.locator('[name=kind]').select_option('extra_hour'); f.locator('[name=qty]').fill('2'); f.locator('button').click(); pg.wait_for_timeout(80)
    f = pg.locator(f'form[data-extra-form="{r["id"]}"]'); f.locator('[name=kind]').select_option('toll_parking'); f.locator('[name=amount]').fill('60'); f.locator('[name=proof]').set_input_files(tmp.name); f.locator('button').click(); pg.wait_for_timeout(80)
    for _ in range(4):
        btn = pg.locator('[data-op="driver-job-step"]')
        if btn.count(): btn.first.click(); pg.wait_for_timeout(80)
    # customer approves extras, confirms, pays, sees receipt + bill of supply + fee invoice
    ws('personal', 'customer'); go('services'); pg.locator(f'[data-op="open-service"][data-id="{r["id"]}"]').first.click(); pg.wait_for_timeout(100)
    check('needs your approval' in main(), 'extras awaiting approval'); shot('102-extras-approve')
    for _ in range(2): pg.locator('[data-extra="approve"]').first.click(); pg.wait_for_timeout(80)
    if pg.locator('[data-op="service-confirm"]').count(): pg.locator('[data-op="service-confirm"]').first.click(); pg.wait_for_timeout(100)
    pg.click(f'[data-pay-balance="{r["id"]}"]'); pg.wait_for_timeout(120)
    rel = next(x for x in st()['ledger'] if x['type'] == 'wallet_credit' and x.get('serviceId') == r['id']); check(rel['amount'] == 1320 + 300 + 60 and rel['commission'] == 0, 'driver gets 100% + extras + parking')
    check('Bill of supply' in main() and 'MoveAI fee invoice' in main(), 'documents on bill')
    pg.locator('[data-bill-doc="receipt"]').first.click(); pg.wait_for_timeout(100); check('Payment receipt' in main() and 'MR/' in main() and '09ABCDE1234F1Z5' in main(), 'receipt with GSTIN'); shot('103-receipt')
    go('services'); pg.locator(f'[data-op="open-service"][data-id="{r["id"]}"]').first.click(); pg.wait_for_timeout(100)
    pg.locator('[data-bill-doc="invoice"]').first.click(); pg.wait_for_timeout(100); check('Not GST-registered' in main() or 'Tax invoice' in main(), 'invoice document'); shot('104-invoice')
    # 2. movers: inventory quote with floors + insurance; 3 BHK recommends survey
    go('home'); pg.click('[data-customer-service="moving"]'); pg.wait_for_timeout(80)
    pg.select_option('#booking-form [name=size]', '3 BHK'); pg.select_option('#booking-form [name=dropLift]', 'no'); pg.fill('#booking-form [name=dropFloors]', '2'); pg.fill('#booking-form [name=declaredValue]', '300000')
    pg.fill('#booking-form [name=inventory]', '3 beds, 3 wardrobes, Sofa, Fridge, Washing machine, 60 cartons'); pg.locator('#booking-form button[type=submit]').click(); pg.wait_for_timeout(100)
    t = main(); check('Mover’s charges' in t and 'Drop floor 2, no lift' in t and 'Transit insurance' in t and 'video survey' in t, 'inventory quote + survey offer'); shot('105-mover-quote')
    pg.check('#survey-req'); pg.click('[data-op="booking-publish"]'); pg.wait_for_timeout(120)
    mv = st()['serviceRequests'][0]; check(mv['surveyRequested'] and not any(x.get('serviceId') == mv['id'] for x in st()['ledger']), 'survey booking, nothing charged')
    ws('movers'); go('work'); pg.locator(f'[data-op="open-moving"][data-id="{mv["movingJobId"]}"]').first.click(); pg.wait_for_timeout(100)
    check('What you earn' in main() and 'MoveAI commission 10%' in main(), 'mover earnings view')
    pg.fill(f'form[data-survey-quote="{mv["id"]}"] [name=amount]', '52000'); pg.fill(f'form[data-survey-quote="{mv["id"]}"] [name=note]', '110 cartons, TV crates'); pg.locator(f'form[data-survey-quote="{mv["id"]}"] button').click(); pg.wait_for_timeout(80)
    ws('personal', 'customer'); go('services'); pg.locator(f'[data-op="open-service"][data-id="{mv["id"]}"]').first.click(); pg.wait_for_timeout(100)
    check('Fixed quote: ₹52,000' in main(), 'customer sees fixed quote'); pg.click(f'[data-survey-accept="{mv["id"]}"]'); pg.wait_for_timeout(100)
    check(any(x.get('serviceId') == mv['id'] and x['amount'] == 10400 and x['status'] == 'held' for x in st()['ledger']), '20% of fixed quote held')
    # 3. product receipt + invoice after delivery
    go('search'); pg.locator('[data-action="buy-product"]').nth(1).click(); pg.wait_for_timeout(80); pg.locator('form[data-po-form="checkout"] button[type=submit]').click(); pg.wait_for_timeout(100)
    o = st()['customerOrders'][0]
    pg.goto('http://127.0.0.1:4211/seller.html#/shopOrders'); pg.wait_for_timeout(100)
    pg.locator(f'[data-commerce="accept"][data-id="{o["id"]}"]').click(); pg.locator(f'[data-commerce="pack"][data-id="{o["id"]}"]').click()
    order = next(x for x in st()['customerOrders'] if x['id'] == o['id'])
    pg.goto('http://127.0.0.1:4211/delivery.html#/deliveryJobs'); pg.wait_for_timeout(100)
    pg.locator(f'[data-commerce="accept-job"][data-id="{o["id"]}"]').click()
    pg.locator(f'[data-code="{o["id"]}"]').fill(order['pickupCode']); pg.locator(f'[data-commerce="pickup"][data-id="{o["id"]}"]').click()
    pg.locator(f'[data-code="{o["id"]}"]').fill(order['deliveryCode']); pg.locator(f'[data-commerce="deliver"][data-id="{o["id"]}"]').click()
    pg.goto('http://127.0.0.1:4211/index.html#/orders'); pg.wait_for_timeout(100)
    check('Tax invoice' in main() and 'Receipt' in main(), 'order receipt + invoice')
    # 4. customer Payments screen (no business terms)
    go('money'); t = main(); check('Bookings' in t and 'Product orders' in t and 'Refunds' in t and 'Record payment' not in t and 'Your limit' not in t, 'customer Payments screen'); shot('106-customer-payments')
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown(); os.unlink(tmp.name)
print(json.dumps({'status': 'PASS', 'suite': 'customer billing'}, indent=2))
