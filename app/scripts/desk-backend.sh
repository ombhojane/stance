#!/usr/bin/env bash
# Flip which brain prices the live desk, without a rebuild (~30s).
#   npm run desk:0g       → 0G Router, 0gm-1.0-35b-a3b (TEE-verified receipts)
#   npm run desk:openai   → OpenAI gpt-5-mini (cheap; saves 0G credits)
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
  status)
    gcloud run services describe stance "${GCP[@]}" \
      --format='value(spec.template.spec.containers[0].env)' | tr ';' '\n' | grep -oE "'name': '(DESK_BACKEND|OPENAI_MODEL|ZG_MODEL)', 'value': '[^']*'" || echo "DESK_BACKEND unset → 0G first, OpenAI fallback" ;;
  *)
    echo "usage: $0 0g|openai|status" >&2; exit 1 ;;
esac
