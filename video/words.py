import json, re, urllib.request, uuid, concurrent.futures as cf
env=open("/Users/omi/products/omisaur/.env").read()
key=re.search(r"^OPENAI_API_KEY=(.+)$",env,re.M).group(1).strip()
def tr(k):
    b=uuid.uuid4().hex; f=open(f"vo/{k}.wav","rb").read()
    parts=[]
    for n,v in [("model","whisper-1"),("response_format","verbose_json"),("timestamp_granularities[]","word")]:
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{n}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()+f+b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    for attempt in range(5):
        req=urllib.request.Request("https://api.openai.com/v1/audio/transcriptions",data=b"".join(parts),headers={"authorization":"Bearer "+key,"content-type":f"multipart/form-data; boundary={b}","accept-encoding":"identity","connection":"close"})
        try:
            d=json.load(urllib.request.urlopen(req,timeout=300))
            return k,[{"w":w["word"],"s":w["start"],"e":w["end"]} for w in d["words"]]
        except Exception as e:
            print(f"retry {k} ({attempt+1}): {type(e).__name__}", flush=True)
    raise RuntimeError(k+" failed")
with cf.ThreadPoolExecutor(2) as ex:
    W=dict(ex.map(tr,[f"{i:02d}" for i in range(1,11)]))
json.dump(W,open("vo/words.json","w"))
for k,v in W.items(): print(k,len(v)," ".join(x["w"] for x in v)[:90])
