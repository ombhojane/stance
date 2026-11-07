import base64, json, re, urllib.request
env=open("/Users/omi/products/omisaur/.env").read()
key=re.search(r"^OPENAI_API_KEY=(.+)$",env,re.M).group(1).strip()
STYLE=("vintage copperplate engraving illustration, fine crosshatch and halftone dither, black ink only, "
"on a plain transparent background, no frame, no text, no watermark, classical editorial style like an old newspaper plate")
PROMPTS={
 "art_crowd": f"{STYLE}. A dense crowd of Indian retail traders in a broker hall, all looking up anxiously at a big stock ticker board, some holding phones, one clutching his head.",
 "art_person": f"{STYLE}. A young Indian man sitting at a small table with a cup of chai, holding a phone that shows a rising line chart, thoughtful confident expression, sketchy loose linework.",
}
def gen(name,prompt):
    body=json.dumps({"model":"gpt-image-1.5","prompt":prompt,"size":"1536x1024","quality":"high","background":"transparent","n":1}).encode()
    for attempt in range(4):
        req=urllib.request.Request("https://api.openai.com/v1/images/generations",data=body,headers={"Authorization":f"Bearer {key}","Content-Type":"application/json","Accept-Encoding":"identity","Connection":"close"})
        try:
            with urllib.request.urlopen(req,timeout=600) as r:
                chunks=[]
                while True:
                    c=r.read(1<<18)
                    if not c: break
                    chunks.append(c)
            d=json.loads(b"".join(chunks))
            open(f"{name}.png","wb").write(base64.b64decode(d["data"][0]["b64_json"]))
            print("ok",name); return
        except Exception as e:
            print("retry",name,type(e).__name__,flush=True)
    print("FAIL",name)
for n,p in PROMPTS.items(): gen(n,p)
print("done")
