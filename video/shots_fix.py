import asyncio
from playwright.async_api import async_playwright

B = "https://stance.omisaur.app"
INIT = "try { localStorage.setItem('stance.theme','light'); localStorage.setItem('stance.mode','test'); } catch (e) {}"

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 1536, "height": 864}, device_scale_factor=2.5)
        await ctx.add_init_script(INIT)
        pg = await ctx.new_page()
        await pg.goto(B + "/make/review?amount=500&asset=ETH&dir=above&target=3000&date=2026-11-27", wait_until="load")
        await pg.wait_for_timeout(2500)
        await pg.locator("main label").first.click()
        await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await pg.wait_for_timeout(600)
        slider = pg.locator("main").get_by_text("Slide to pay", exact=False)
        box = await slider.bounding_box()
        # the knob sits at the left inside edge of the track
        y = box["y"] + box["height"] / 2
        await pg.mouse.move(box["x"] + 40, y)
        await pg.mouse.down()
        await pg.mouse.move(box["x"] + box["width"] - 44, y, steps=18)
        await pg.mouse.up()
        await pg.wait_for_timeout(3500)
        print("url now", pg.url)
        await pg.screenshot(path="shots/done.png")
        await pg.goto(B + "/positions", wait_until="load")
        await pg.wait_for_timeout(1800)
        await pg.screenshot(path="shots/positions.png")
        await br.close()

asyncio.run(main())
