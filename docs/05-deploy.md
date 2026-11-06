# Deploying the Stance web app

Production: **https://stance.omisaur.app** → Google Cloud HTTPS load balancer → Cloud Run (`asia-southeast1`).

| Piece | Value |
|---|---|
| GCP account / project | `tauqeer@mandiplus.com` / `absolute-disk-506110-v4` |
| Cloud Run service | `stance` in `asia-southeast1` (512Mi, 0–3 instances, port 8080) |
| Cloud Run URL | https://stance-766881951480.asia-southeast1.run.app |
| Static IP | `stance-ip` = `136.81.164.214` (global) |
| Certificate | `stance-cert` (Google-managed, `stance.omisaur.app`) |
| DNS | Vercel DNS for `omisaur.app` (account `ombhojane`): `stance A 136.81.164.214` |

## Redeploy the app
From `app/` (builds the Dockerfile with Cloud Build):
```bash
gcloud run deploy stance --source . --account=tauqeer@mandiplus.com --project=absolute-disk-506110-v4 \
  --region=asia-southeast1 --port=8080 --memory=512Mi --min-instances=0 --max-instances=3 --quiet
```
Public build-time config (optional): `--set-build-env-vars` is not used by Dockerfile builds; pass `NEXT_PUBLIC_WC_PROJECT_ID` as a Docker build arg via Cloud Build if WalletConnect is needed.

## Why `--no-invoker-iam-check`
The `mandiplus.com` organization enforces domain-restricted sharing (`iam.allowedPolicyMemberDomains`), so Cloud Run cannot grant `allUsers` the invoker role. The service is made public with:
```bash
gcloud run services update stance --no-invoker-iam-check --region=asia-southeast1 \
  --account=tauqeer@mandiplus.com --project=absolute-disk-506110-v4
```

## Load balancer (one-time setup, already done)
```bash
F="--account=tauqeer@mandiplus.com --project=absolute-disk-506110-v4"
gcloud compute addresses create stance-ip --global --ip-version=IPV4 $F
gcloud compute ssl-certificates create stance-cert --domains=stance.omisaur.app --global $F
gcloud compute network-endpoint-groups create stance-neg --region=asia-southeast1 --network-endpoint-type=serverless --cloud-run-service=stance $F
gcloud compute backend-services create stance-backend --global --load-balancing-scheme=EXTERNAL_MANAGED $F
gcloud compute backend-services add-backend stance-backend --global --network-endpoint-group=stance-neg --network-endpoint-group-region=asia-southeast1 $F
gcloud compute url-maps create stance-urlmap --default-service=stance-backend $F
gcloud compute target-https-proxies create stance-https-proxy --url-map=stance-urlmap --ssl-certificates=stance-cert $F
gcloud compute forwarding-rules create stance-https --global --load-balancing-scheme=EXTERNAL_MANAGED --address=stance-ip --target-https-proxy=stance-https-proxy --ports=443 $F
# HTTP → HTTPS redirect: url map "stance-http-redirect" (defaultUrlRedirect.httpsRedirect=true)
gcloud compute target-http-proxies create stance-http-proxy --url-map=stance-http-redirect $F
gcloud compute forwarding-rules create stance-http --global --load-balancing-scheme=EXTERNAL_MANAGED --address=stance-ip --target-http-proxy=stance-http-proxy --ports=80 $F
vercel dns add omisaur.app stance A 136.81.164.214
```
Cost: roughly $18/month for the forwarding rules, plus Cloud Run usage (scales to zero).

## Tear down
```bash
F="--account=tauqeer@mandiplus.com --project=absolute-disk-506110-v4 --quiet"
gcloud compute forwarding-rules delete stance-https stance-http --global $F
gcloud compute target-https-proxies delete stance-https-proxy $F
gcloud compute target-http-proxies delete stance-http-proxy $F
gcloud compute url-maps delete stance-urlmap stance-http-redirect $F
gcloud compute backend-services delete stance-backend --global $F
gcloud compute network-endpoint-groups delete stance-neg --region=asia-southeast1 $F
gcloud compute ssl-certificates delete stance-cert --global $F
gcloud compute addresses delete stance-ip --global $F
gcloud run services delete stance --region=asia-southeast1 $F
# then remove the `stance` A record from Vercel DNS
```
