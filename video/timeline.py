import json, re
src = open("vo.py").read()
S = eval(src[src.index("S={") + 2 : src.index("\n}\n") + 2])
D = json.load(open("vo/durations.json"))
W = json.load(open("vo/words.json"))
PRE = 0.45
POST = {"03": 1.0, "05": 1.0, "06": 1.2, "10": 2.8}
t = 0.0
scenes, words, caps = [], {}, []
for k in sorted(S):
    dur = PRE + D[k] + POST.get(k, 0.8)
    vo = t + PRE
    scenes.append({"id": k, "start": round(t, 3), "dur": round(dur, 3), "vo": round(vo, 3)})
    ws = [{"w": x["w"].lower().strip(".,?!:"), "s": round(vo + x["s"], 3), "e": round(vo + x["e"], 3)} for x in W[k]]
    words[k] = ws
    sents = [s.strip() for s in re.split(r"(?<=[.?!])\s+", S[k]) if s.strip()]
    tot = sum(len(s.split()) for s in sents); cum = 0
    for i, s in enumerate(sents):
        a = int(round(cum / tot * len(ws))); cum += len(s.split()); b = int(round(cum / tot * len(ws))) - 1
        a = min(a, len(ws) - 1); b = max(a, min(b, len(ws) - 1))
        caps.append({"scene": k, "t0": ws[a]["s"] - 0.05, "t1": ws[b]["e"] + 0.25, "text": s})
    t += dur
json.dump({"scenes": scenes, "words": words, "caps": caps, "total": round(t, 3)}, open("timeline.json", "w"))
open("timeline.js", "w").write("window.TL=" + json.dumps({"scenes": scenes, "words": words, "caps": caps, "total": round(t, 3)}) + ";")
print("total", round(t, 2))
for s in scenes: print(s)
