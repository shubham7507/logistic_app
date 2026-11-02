"""Real browser cross-role product order smoke. Requires Python Playwright and Chromium."""
import functools, http.server, json, os, socketserver, threading
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
socketserver.TCPServer.allow_reuse_address=True
server=socketserver.TCPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as playwright:
    browser=playwright.chromium.launch()
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    base=f'http://127.0.0.1:{server.server_address[1]}'
    def open_app(name,route):
        page.goto(f'{base}/{name}.html#/{route}')
        page.locator('#main-content h1').first.wait_for()
    def state():return page.evaluate('window.MoveAIVNextTest.state()')
    open_app('index','search');page.evaluate('window.MoveAIVNextTest.reset()')
    def ws(k,prod=None):page.evaluate(f"window.MoveAIVNextTest.switchWorkspace('{k}'"+(f",'{prod}'" if prod else '')+")")
    def search(q):
        page.evaluate("location.hash='#/search'");page.locator('#product-query').wait_for()
        page.locator('#product-query').fill(q);page.locator('#product-search-form button').click();page.wait_for_timeout(150)
    # customer: search, add two products, change quantity, checkout; the bank confirms the UPI payment (demo)
    search('rice');assert page.locator('[data-po-add="PRD-101"]').count()>=1,'rice found';page.locator('[data-po-add="PRD-101"]').first.click()
    search('salt');page.locator('[data-po-add="PRD-103"]').first.click()
    page.evaluate("location.hash='#/cart'");page.wait_for_timeout(200)
    page.locator('[data-po-cart-qty="PRD-101"]').select_option('2');page.wait_for_timeout(100)
    page.locator('[data-po-checkout]').click();page.wait_for_timeout(150)
    assert '₹1,448' in page.locator('form[data-po-form="checkout"]').inner_text()
    page.locator('[name=address]').fill('42 MG Road, Delhi 110001')
    page.locator('form[data-po-form="checkout"] button[type=submit]').click();page.wait_for_timeout(200)
    o=state()['customerOrders'][0]
    assert o['total']==1448 and len(o['items'])==2 and state()['productCart']==[]
    page.evaluate('window.MoveAIVNextTest.confirmPayments()');page.wait_for_timeout(100)
    assert next(x for x in state()['customerOrders'] if x['id']==o['id'])['status']=='paid'
    # store: accept, pick each item (scan, expiry, checks), pack
    ws('grocery');open_app('seller','shopOrders')
    page.locator(f'[data-commerce="accept"][data-id="{o["id"]}"]').click();page.wait_for_timeout(150)
    page.locator(f'[data-commerce="pick-start"][data-id="{o["id"]}"]').first.click();page.wait_for_timeout(150)
    for it in o['items']:
        pid=it['productId'];page.locator(f'[data-plus-demo-scan="{o["id"]}|{pid}"]').first.click()
        for cb in page.locator(f'[data-expiry-ok="{o["id"]}|{pid}"]').all(): cb.check()
        for cb in page.locator(f'[data-quality^="{o["id"]}|{pid}|"]').all(): cb.check()
        page.locator(f'[data-commerce="pick-check"][data-id="{o["id"]}"][data-product="{pid}"]').click();page.wait_for_timeout(150)
    page.locator(f'[data-commerce="pick-complete"][data-id="{o["id"]}"]').click();page.wait_for_timeout(150)
    if page.locator(f'[data-bags="{o["id"]}"]').count(): page.fill(f'[data-bags="{o["id"]}"]','1')
    page.locator(f'[data-commerce="pack"][data-id="{o["id"]}"]').click();page.wait_for_timeout(150)
    packed=next(x for x in state()['customerOrders'] if x['id']==o['id'])
    assert packed['status']=='ready_for_pickup' and packed['deliveryAssignment']['partnerId']=='DP-001',packed['status']
    # rider: accept, share location, collect with the store code, deliver with the customer code
    ws('deliveryPartner');open_app('delivery','deliveryJobs')
    page.locator(f'[data-commerce="accept-job"][data-id="{o["id"]}"]').first.click();page.wait_for_timeout(150)
    page.locator(f'[data-geo-start-demo="{o["id"]}"]').first.click();page.wait_for_timeout(150)
    page.locator(f'[data-code="{o["id"]}"]').fill(packed['pickupCode'])
    if page.locator(f'[data-collected-bags="{o["id"]}"]').count(): page.fill(f'[data-collected-bags="{o["id"]}"]',str(packed.get('bagCount') or 1))
    page.locator(f'[data-commerce="pickup"][data-id="{o["id"]}"]').click();page.wait_for_timeout(150)
    page.locator(f'[data-code="{o["id"]}"]').fill(packed['deliveryCode'])
    page.locator(f'[data-commerce="deliver"][data-id="{o["id"]}"]').click();page.wait_for_timeout(150)
    done=next(x for x in state()['customerOrders'] if x['id']==o['id'])
    assert done['status']=='delivered' and done['deliveryPayoutStatus']=='wallet_credited',(done['status'],done['deliveryPayoutStatus'])
    # admin: settle the store after the reserve period
    ws('admin');open_app('admin','commercePayments')
    page.locator('[data-commerce="advance-clock"]').first.click();page.wait_for_timeout(150)
    page.locator(f'[data-commerce="settle"][data-id="{o["id"]}"]').first.click();page.wait_for_timeout(150)
    assert next(x for x in state()['customerOrders'] if x['id']==o['id'])['settlementStatus']=='paid'
    ws('personal','customer');open_app('index','orders')
    assert page.locator('#main-content').get_by_text(o['id']).count()>0
    assert any(i['ref']==o['id'] and i['total']==1448 for i in state()['customerInvoices'])
    assert not errors,errors
    browser.close()
server.shutdown()
print(json.dumps({'status':'PASS','suite':'Browser customer → seller → delivery → admin → customer'}))
