import json, re, urllib.request, concurrent.futures as cf, subprocess
env=open("/Users/omi/products/omisaur/.env").read()
key=re.search(r"^OPENAI_API_KEY=(.+)$",env,re.M).group(1).strip()
INSTR=("Calm, confident Indian English narrator. Conversational, like a sharp friend explaining something over chai. "
"Slightly wry on the punchlines, never salesy, never hyped. Medium pace, clear pauses between sentences.")
S={
"01":"Last September, SEBI published a number. Ninety three percent of individual options traders in India lost money. Over three years, one point eight lakh crore rupees. Gone.",
"02":"And here's the strange part. Most of them weren't wrong about the market. Options lose you money even when you're right. Time decay. Volatility crush. Margin calls. The product was built for professionals, and retail pays for it.",
"03":"Now, say you're sure ETH will pump two hundred dollars in the next three weeks. Acting on that means buying a whole ETH at twenty five hundred, which you don't have lying around. Or decoding an options chain, which nobody should have to. So your opinion just... stays an opinion.",
"04":"This is Stance. You type what you think happens next. I want to make five hundred dollars, if ETH ends above three thousand, by November twenty seven.",
"05":"And you get the only three numbers that matter. You pay about one ninety. You make five hundred if you're right. And your live odds. That one ninety is the most you can ever lose. No margin calls. No liquidation. The full payout is locked in the contract the moment you trade.",
"06":"Review it like a bet slip, not a Greek exam. A hundred ways the month could end, green where you win. Slide to pay. Done.",
"07":"Every number on this screen has a receipt. The odds come from a model running inside a secure enclave on 0G. Tap the chip. Request id. Provider. Signature verified. We cannot make these numbers up.",
"08":"And settlement isn't ours to touch either. On the date, Chainlink reads the official price and the contract pays winners by itself. On chain. In public.",
"09":"One more thing. On every trading app you've used, the house is them. On Stance, the house is a vault anyone can fund. Deposit once, back both sides, earn the spread on every trade. The seat that wins on average is finally open to everyone.",
"10":"Stance. Trade what you think happens next. Live on Base. Priced by 1inch Aqua. Settled by Chainlink. Explained by 0G.",
}
def tts(k):
    body=json.dumps({"model":"gpt-4o-mini-tts","voice":"ash","input":S[k],"instructions":INSTR,"response_format":"wav"}).encode()
    for attempt in range(5):
        req=urllib.request.Request("https://api.openai.com/v1/audio/speech",data=body,headers={"authorization":"Bearer "+key,"content-type":"application/json","accept-encoding":"identity","connection":"close"})
        try:
            with urllib.request.urlopen(req,timeout=300) as r:
                chunks=[]
                while True:
                    c=r.read(1<<18)
                    if not c: break
                    chunks.append(c)
            open(f"vo/{k}.wav","wb").write(b"".join(chunks))
            d=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"vo/{k}.wav"],capture_output=True,text=True).stdout.strip()
            if d: return f"{k} {d}"
        except Exception as e:
            print(f"retry {k} ({attempt+1}): {type(e).__name__}", flush=True)
    return k+" FAIL"
import sys, os
only=sys.argv[1:] or list(S)
with cf.ThreadPoolExecutor(2) as ex:
    res=list(ex.map(tts,only))
print("\n".join(res))
D=json.load(open("vo/durations.json")) if os.path.exists("vo/durations.json") else {}
D.update({r.split()[0]:float(r.split()[1]) for r in res if "FAIL" not in r})
json.dump(D,open("vo/durations.json","w"))
