# Push notifications — VAPID setup (one-time, 2 min)

These are already generated locally in `.dev.vars` (gitignored).
You must add them to Cloudflare so the live site can send pushes.

## 1. Get your keys (already generated in `.dev.vars` on this device)
```bash
cat .dev.vars  # copy VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
# keep PRIVATE_KEY secret — never commit it
```

## 2. Cloudflare Dashboard
- Open https://dash.cloudflare.com -> Workers & Pages -> dahej -> Settings -> Variables and Secrets
- Add 3 variables (Environment: Production, Type: Plain text):
  - VAPID_PUBLIC_KEY
  - VAPID_PRIVATE_KEY
  - VAPID_SUBJECT
- Save -> Redeploy (Pages -> Deployments -> Retry latest)

## 3. Test
- Visit https://dahej.sahil.run on Android Chrome -> Install app (⋮ -> Install app)
- Open installed app -> tap 🔔 Enable -> Allow notifications
- Trigger test: `curl -X POST https://dahej.sahil.run/api/push/notify -H "content-type: application/json" -d '{"title":"Dahej test","body":"push works 🔔"}'`
- Or from Termux Ubuntu: `dahej-notify "done" "pushed latest commit"`

Local dev: `npx wrangler pages dev .` will read `.dev.vars` automatically.
