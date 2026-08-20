# Sync rule (ALWAYS follow)

This repo is worked on from multiple devices. Before doing anything
in this repo (reading, planning, making changes, running commands):

1. Run `git fetch origin` and compare `HEAD` with `origin/main`.
2. If local is behind, or if there are no uncommitted local changes,
   run `git pull --ff-only` first.
3. Only then inspect the code and start work.

After making changes:
1. Commit with a concise message.
2. Push to `origin/main` immediately, and tell the user the change
   has been pushed so it syncs to their other device.

# Notifications
- You are running on Termux + PRoot Ubuntu (Android). Termux:API may not be installed.
- When you finish a task or need input, run: `dahej-notify "Title" "Body" "/path"` (installed at `/usr/local/bin/dahej-notify`).
  It tries Termux native notification → website Web Push → fallback echo.
- For website push to work: user must Install the PWA (Chrome ⋮ → Install app) and tap 🔔 Enable on the site, and VAPID keys must be set in Cloudflare (see `VAPID_SETUP.md`).
- PWA files: `manifest.json`, `sw.js`, `icon.svg`, `functions/api/push/*`.
