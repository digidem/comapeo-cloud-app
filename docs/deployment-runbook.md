# Deployment Runbook

## Overview

The CoMapeo Cloud App is deployed to Cloudflare Pages. This runbook covers deployment, rollback, and operational procedures.

## Deployment Architecture

| Environment | URL | Branch | Trigger |
|---|---|---|---|
| Production | `https://comapeo-cloud-app.pages.dev` | `main` | Push to `main` |
| Staging | `https://staging.comapeo-cloud-app.pages.dev` | `staging` | Push to `staging` |
| Preview | Per-PR hash URL | PR branch | PR opened/updated |

## Configuration

All deployment constants are centralized in `deployment.config.json`:

- `productionOrigin` — current production URL (starts as Pages URL, switches to custom domain)
- `finalProductionOrigin` — `https://app.comapeo.cloud` (custom domain target)
- `cloudflareProjectName` — `comapeo-cloud-app`
- `stagingBranch` — `staging`

Environment variables are documented in `.env.example`.

## Rollback Procedures

### 1. Instant Rollback via Cloudflare Dashboard

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** > **comapeo-cloud-app**
3. Go to the **Deployments** tab
4. Find the last known-good deployment
5. Click the **...** menu > **Rollback to this deployment**
6. Confirm the rollback

This is the fastest method — takes effect within seconds.

### 2. API Rollback via Cloudflare API

Use the Cloudflare Pages deployment rollback API:

```bash
# List recent deployments to find the target deployment_id
curl -X GET \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/comapeo-cloud-app/deployments" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[] | {id, created_on, latest_stage}'

# Rollback to a specific deployment
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/comapeo-cloud-app/deployments/$DEPLOYMENT_ID/rollback" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

### 3. Redeploy from Git

1. Identify the last good commit on `main`
2. Either:
   - **Revert**: Create a revert commit and merge through the normal PR process
   - **Re-run**: Go to GitHub Actions > CI workflow > "Run workflow" on the specific commit
3. Wait for CI to build and deploy

## Custom Domain Setup (Future)

When switching from `comapeo-cloud-app.pages.dev` to `app.comapeo.cloud`:

1. In Cloudflare Dashboard > **Workers & Pages** > **comapeo-cloud-app** > **Custom domains**
2. Add `app.comapeo.cloud` as a custom domain
3. Cloudflare will configure DNS and SSL automatically if the domain is on Cloudflare DNS
4. Wait for DNS propagation and SSL certificate provisioning
5. Update `deployment.config.json`:
   ```json
   { "productionOrigin": "https://app.comapeo.cloud" }
   ```
6. Update `VITE_PUBLIC_APP_ORIGIN` in GitHub Actions env and `.env`
7. Rebuild and redeploy — metadata (canonical, sitemap, robots, OG) will use the new origin
8. Run production smoke tests against `https://app.comapeo.cloud`

## Access Control

- **Cloudflare Dashboard**: Team members with Cloudflare account access
- **GitHub merge access**: Repository collaborators with write access
- **Secrets**: Managed via GitHub repository secrets and variables

## Monitoring

- **CI Status**: GitHub Actions workflow status badge in README
- **Error Tracking**: Sentry (when `VITE_SENTRY_DSN` is configured)
- **Uptime**: External monitoring recommended (Cloudflare Workers cron, UptimeRobot, or Better Stack)

## Troubleshooting

### Build fails in CI

1. Check the GitHub Actions log for the failing step
2. Reproduce locally: `npm ci && npm run build`
3. Common issues: missing env vars, type errors, lint violations

### Deployment succeeds but app is broken

1. Check browser console for errors
2. Verify the build artifact was uploaded correctly (check `dist/` artifact)
3. Try a rollback to the previous deployment
4. Check if CSP headers are blocking required resources

### Source maps exposed publicly

1. Verify `sourcemap: 'hidden'` in `vite.config.ts`
2. Check that `scripts/clean-sourcemaps.ts` ran in CI
3. Verify the `--assert-only` step passed
4. Check `https://<deploy-url>/assets/*.map` returns 404

### API proxy not working

1. Verify `functions/api/[[path]].ts` is included in the deployment
2. Check `_routes.json` includes `/api` and `/api/*`
3. Test: `curl -i https://<deploy-url>/api/info` should return 400
4. Test: `curl -i -H "x-target-url: <archive-origin>" https://<deploy-url>/api/info` should return 200
