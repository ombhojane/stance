import asyncio, sys, os, math
from playwright.async_api import async_playwright
FPS=30
async def worker(p, idx, n, frames, outdir):
    br=await p.chromium.launch(args=["--allow-file-access-from-files"])
    pg=await br.new_page(viewport={"width":1920,"height":1080})
    await pg.goto("file://"+os.path.abspath("scenes.html")); await pg.evaluate("ready()")
    for f in frames[idx::n]:
        if os.path.exists(f"{outdir}/{f:05d}.jpg"): continue
        await pg.evaluate(f"render({f/FPS})")
        await pg.screenshot(path=f"{outdir}/{f:05d}.jpg",type="jpeg",quality=93)
    await br.close()
async def main():
    async with async_playwright() as p:
        if sys.argv[1]=="test":
            ts=[float(x) for x in sys.argv[2:]]
            br=await p.chromium.launch(args=["--allow-file-access-from-files"]); pg=await br.new_page(viewport={"width":1920,"height":1080})
            pg.on("console", lambda m: print("console:",m.text))
            await pg.goto("file://"+os.path.abspath("scenes.html")); tot=await pg.evaluate("ready()")
            for t in ts:
                await pg.evaluate(f"render({t})"); await pg.screenshot(path=f"/tmp/claude-501/t_{t}.jpg",type="jpeg",quality=70)
            print("total",tot); await br.close(); return
        total=float(sys.argv[2]); n=int(sys.argv[3]); os.makedirs("frames",exist_ok=True)
        frames=list(range(int(math.ceil(total*FPS))))
        await asyncio.gather(*[worker(p,i,n,frames,"frames") for i in range(n)])
asyncio.run(main())
