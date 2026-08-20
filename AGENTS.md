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
