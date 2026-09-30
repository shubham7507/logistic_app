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
    page.evaluate("location.hash='#/search'")
    page.locator('#product-query').fill('rice');page.locator('#product-search-form button').click()
    assert page.locator('.candidate-card').count()==1
    page.locator('[data-po-add="PRD-101"]').click()
    page.locator('#product-query').fill('salt');page.locator('#product-search-form button').click()
    page.locator('[data-po-add="PRD-103"]').click()
    page.locator('#main-content [data-route="cart"]').click()
    page.locator('[data-po-cart-qty="PRD-101"]').select_option('2')
    page.locator('[data-po-checkout]').click()
    assert '₹1,448' in page.locator('form[data-po-form="checkout"]').inner_text()
    page.locator('[name=address]').fill('42 MG Road, Delhi 110001')
    page.locator('form[data-po-form="checkout"] button[type=submit]').click()
    o=state()['customerOrders'][0]
    assert o['total']==1448 and len(o['items'])==2 and state()['productCart']==[]
    open_app('seller','shopOrders')
    assert page.locator(f'[data-commerce="accept"][data-id="{o["id"]}"]').count()==1
    page.locator(f'[data-commerce="accept"][data-id="{o["id"]}"]').click()
    page.locator(f'[data-commerce="pack"][data-id="{o["id"]}"]').click()
    packed=next(x for x in state()['customerOrders'] if x['id']==o['id'])
    assert packed['deliveryAssignment']['partnerId']=='DP-001'
    open_app('delivery','deliveryJobs')
    page.locator(f'[data-commerce="accept-job"][data-id="{o["id"]}"]').click()
    page.locator(f'[data-code="{o["id"]}"]').fill(packed['pickupCode'])
    page.locator(f'[data-commerce="pickup"][data-id="{o["id"]}"]').click()
    page.locator(f'[data-code="{o["id"]}"]').fill(packed['deliveryCode'])
    page.locator(f'[data-commerce="deliver"][data-id="{o["id"]}"]').click()
    assert next(x for x in state()['customerOrders'] if x['id']==o['id'])['status']=='delivered'
    open_app('admin','commerceOps')
    assert page.locator(f'[data-commerce="settle"][data-id="{o["id"]}"]').count()==1
    page.locator('[data-commerce="advance-clock"]').click()
    page.locator(f'[data-commerce="settle"][data-id="{o["id"]}"]').click()
    page.locator(f'[data-commerce="pay-driver"][data-id="{o["id"]}"]').click()
    current=next(x for x in state()['customerOrders'] if x['id']==o['id'])
    assert current['settlementStatus']=='paid' and current['deliveryPayoutStatus']=='paid'
    open_app('index','orders')
    assert page.locator('#main-content').get_by_text(o['id']).count()>0
    assert any(i['ref']==o['id'] and i['total']==1448 for i in state()['customerInvoices'])
    assert not errors,errors
    browser.close()
server.shutdown()
print(json.dumps({'status':'PASS','suite':'Browser customer → seller → delivery → admin → customer'}))
