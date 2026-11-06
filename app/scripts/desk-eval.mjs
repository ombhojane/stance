#!/usr/bin/env node
// Prompt-iteration harness: hammer the desk route and score what comes back.
// Run a dev server first (any backend), then:  npm run desk:eval
// Scores: schema validity, vol sanity, term-structure shape, stability across
// runs, and latency. Use DESK_BACKEND=openai on the server to iterate cheaply,
// then flip to 0G and re-run the same checks.
const BASE = process.env.DESK_URL || "http://localhost:3100";
const RUNS = Number(process.env.RUNS || 5);

const reads = [];
for (let i = 0; i < RUNS; i++) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/desk?fresh=1`);
  const j = await r.json();
  j._wall = Date.now() - t0;
  reads.push(j);
  const vols = Object.values(j.vols ?? {}).map((v) => Math.round(v * 100) + "%");
  console.log(`#${i + 1} [${j.source}/${j.model}] ${j._wall}ms vols=[${vols.join(" ")}] bias=${j.bias} conf=${j.confidence} req=${(j.requestId ?? "—").slice(0, 12)}`);
  console.log(`   "${j.headline}"`);
}

let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? "  ok" : "FAIL"} ${name}`);
  if (!ok) fails++;
};

const expiries = Object.keys(reads[0]?.vols ?? {});
check("has 4 expiries", expiries.length === 4);
for (const r of reads) {
  const vs = expiries.map((e) => r.vols[e]);
  check(`vols in [0.25,1.60] (${r.source})`, vs.every((v) => v >= 0.25 && v <= 1.6));
  check("term structure sane (no >2x jump between buckets)", vs.every((v, i) => i === 0 || v / vs[i - 1] < 2));
  check("headline <= 120 chars, no hype words", r.headline.length <= 120 && !/🚀|moon|guarantee/i.test(r.headline));
  check("bias valid", ["up", "down", "neutral"].includes(r.bias));
}
// stability: same context minutes apart shouldn't swing the 1w vol wildly
const v1w = reads.map((r) => r.vols[expiries[0]]).filter(Boolean);
const spread = Math.max(...v1w) - Math.min(...v1w);
check(`1w vol stable across runs (spread ${(spread * 100).toFixed(1)}pp <= 12pp)`, spread <= 0.12);
const lat = reads.map((r) => r.latencyMs);
console.log(`\nllm latency ms: min ${Math.min(...lat)} avg ${Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)} max ${Math.max(...lat)}`);
console.log(fails ? `\n${fails} checks failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
