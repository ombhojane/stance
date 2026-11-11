#!/usr/bin/env bash
# Flip which brain prices the live desk, without a rebuild (~30s).
#   npm run desk:0g       → 0G Router, 0gm-1.0-35b-a3b (TEE-verified receipts)
#   npm run desk:openai   → OpenAI gpt-5-mini (cheap; saves 0G credits)
#   npm run desk:replay   → serve a real recorded 0G read, zero inference cost
#   npm run desk:status   → show what production is using now
# Both keys are already set on the service; this only changes DESK_BACKEND.
set -euo pipefail
GCP=(--account=tauqeer@mandiplus.com --project=absolute-disk-506110-v4 --region=asia-southeast1)

case "${1:-status}" in
  0g | zg)
    gcloud run services update stance "${GCP[@]}" --update-env-vars DESK_BACKEND=zg --quiet
    echo "desk → 0G" ;;
  openai)
    gcloud run services update stance "${GCP[@]}" --update-env-vars DESK_BACKEND=openai,OPENAI_MODEL=gpt-5-mini --quiet
    echo "desk → OpenAI gpt-5-mini" ;;
  replay)
    gcloud run services update stance "${GCP[@]}" --update-env-vars DESK_BACKEND=replay --quiet
    echo "desk → replay (recorded 0G read, no inference calls)" ;;
  status)
    gcloud run services describe stance "${GCP[@]}" --format=json | python3 -I -c '
import json, sys
d = json.load(sys.stdin)
env = {e["name"]: e.get("value") for e in d["spec"]["template"]["spec"]["containers"][0].get("env", [])}
b = env.get("DESK_BACKEND")
print("revision:", d["status"].get("latestReadyRevisionName"))
print("desk:", {"zg": "0G (0gm-1.0-35b-a3b)", "replay": "replay of a recorded 0G read (no calls)", "openai": "OpenAI " + (env.get("OPENAI_MODEL") or "gpt-5-mini")}.get(b, "unset -> 0G first, OpenAI fallback"))
' ;;
  *)
    echo "usage: $0 0g|openai|replay|status" >&2; exit 1 ;;
esac
