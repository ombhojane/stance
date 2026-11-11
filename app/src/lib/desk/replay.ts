// A real desk read, recorded from production on 2026-11-07 while the desk ran on 0G.
// Every field is exactly what 0G returned (model output, request id, TEE provider, chat id)
// and the TEE signature was verified at the time. Replay mode serves this read with its
// original timestamp and makes no inference calls, so the showcase costs nothing.
import type { DeskRead } from "./desk";

export const RECORDED_0G_READ: DeskRead = {
  headline: "ETH has been swinging about 2% a day lately, making near-term options pricier than usual.",
  read: "ETH dropped nearly 2% in the last day and has been moving around 50% annually over the past month. This suggests higher odds of sharp moves in the short term compared to the longer view.",
  bias: "down",
  confidence: 0.65,
  vols: { "2026-11-13": 0.58, "2026-11-27": 0.55, "2026-12-25": 0.52, "2027-03-26": 0.5 },
  source: "0g",
  model: "0gm-1.0-35b-a3b",
  requestId: "bbc7bb70-d110-422d-b9e2-0936b3e19595",
  provider: "0xf4FB8d2bD856e672b5f9848b0eD235A20079B250",
  teeVerified: true,
  chatId: "2571cc0d-d5f5-4529-91ca-194990bf44a0",
  latencyMs: 2666,
  at: 1793981726275,
  context: null,
  replay: true,
};
