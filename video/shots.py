import asyncio
from playwright.async_api import async_playwright

B = "https://stance.omisaur.app"
INIT = """
try { localStorage.setItem('stance.theme','light'); localStorage.setItem('stance.mode','test'); } catch (e) {}
"""

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 1536, "height": 864}, device_scale_factor=2.5)
        await ctx.add_init_script(INIT)
        pg = await ctx.new_page()

        # home: cone + sentence (give the ascii canvas a moment to paint)
        await pg.goto(B + "/", wait_until="load")
        await pg.wait_for_timeout(5000)
        await pg.screenshot(path="shots/home.png")

        # amount editor open (click the $500 chip)
        await pg.get_by_role("button", name="$500").click()
        await pg.wait_for_timeout(900)
        await pg.screenshot(path="shots/home_amount.png")
        await pg.keyboard.press("Escape")

        # target editor open
        await pg.get_by_role("button", name="$3,000").first.click()
        await pg.wait_for_timeout(900)
        await pg.screenshot(path="shots/home_target.png")
        await pg.keyboard.press("Escape")
        await pg.wait_for_timeout(400)

        # receipt chip popover (the 0G receipt)
        await pg.locator("button[title='How this number was priced']").click()
        await pg.wait_for_timeout(800)
        await pg.screenshot(path="shots/home_receipt.png")
        await pg.keyboard.press("Escape")

        # review page
        await pg.goto(B + "/make/review?amount=500&asset=ETH&dir=above&target=3000&date=2026-11-27", wait_until="load")
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path="shots/review_top.png")
        h = await pg.evaluate("document.body.scrollHeight")
        print("review height", h)
        await pg.screenshot(path="shots/review_full.png", full_page=True)

        # tick the ack and scroll to the slider
        await pg.locator("main label").first.click()
        await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path="shots/review_slide.png")

        # take the stance for real (test money) → done page
        slider = pg.locator("main").get_by_text("Slide to pay", exact=False)
        box = await slider.bounding_box()
        print("slider box", box)
        # the knob sits at the left edge of the slider track
        knob_x = box["x"] - 240
        knob_y = box["y"] + box["height"] / 2
        await pg.mouse.move(knob_x, knob_y)
        await pg.mouse.down()
        await pg.mouse.move(knob_x + 640, knob_y, steps=14)
        await pg.mouse.up()
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path="shots/done.png")
        print("url now", pg.url)

        # positions (should include the fresh one)
        await pg.goto(B + "/positions", wait_until="load")
        await pg.wait_for_timeout(1800)
        await pg.screenshot(path="shots/positions.png")

        # house
        await pg.goto(B + "/house", wait_until="load")
        await pg.wait_for_timeout(2200)
        await pg.screenshot(path="shots/house.png")

        # signals with the live desk card
        await pg.goto(B + "/signals", wait_until="load")
        await pg.wait_for_timeout(2200)
        await pg.screenshot(path="shots/signals.png")

        await br.close()

asyncio.run(main())
