#!/usr/bin/env bash
# dahej-notify — send Android notification from Termux Ubuntu (PRoot)
# Usage: dahej-notify "Title" "Body" [url]
# Tries (in order): termux-notification (needs Termux:API app), website Web Push, echo fallback
set -e
TITLE="${1:-Dahej}"
BODY="${2:-Done}"
URL="${3:-/}"

TERMUX_BIN="/data/data/com.termux/files/usr/bin"

# 1. Try Termux:API notification (instant, works offline, no server needed)
# Install: Termux app -> pkg install termux-api + install Termux:API APK from F-Droid
if [ -x "$TERMUX_BIN/termux-notification" ]; then
  "$TERMUX_BIN/termux-notification" --title "$TITLE" --content "$BODY" --button1 "Open" --button1-action "am start -a android.intent.action.VIEW -d https://dahej.sahil.run$URL" 2>/dev/null && exit 0
  # fallback simple notification without button
  "$TERMUX_BIN/termux-notification" --title "$TITLE" --content "$BODY" 2>/dev/null && exit 0
fi

# 2. Try website Web Push (needs VAPID configured + you enabled notifications on site)
# This pings your PWA even if Termux is closed, as long as Chrome has the subscription.
if command -v curl >/dev/null 2>&1; then
  SITE="https://dahej.sahil.run"
  # allow override: DAHEJ_SITE env
  [ -n "$DAHEJ_SITE" ] && SITE="$DAHEJ_SITE"
  RESP=$(curl -s -X POST "$SITE/api/push/notify" -H "content-type: application/json" -d "{\"title\":\"$TITLE\",\"body\":\"$BODY\",\"url\":\"$URL\"}" --max-time 10 2>&1 || true)
  if echo "$RESP" | grep -q '"ok":true'; then
    echo "✓ website push sent: $RESP"
    exit 0
  else
    echo "website push failed (maybe no subscribers or VAPID not set): $RESP" >&2
  fi
fi

# 3. Fallback: just echo + vibrate via termux-vibrate if available
if [ -x "$TERMUX_BIN/termux-vibrate" ]; then
  "$TERMUX_BIN/termux-vibrate" -d 200 2>/dev/null || true
fi
echo "[$TITLE] $BODY (no native notifier — install Termux:API or enable site notifications)"
# Also try to open URL if provided
if [ "$URL" != "/" ] && [ -x "$TERMUX_BIN/termux-open-url" ]; then
  "$TERMUX_BIN/termux-open-url" "https://dahej.sahil.run$URL" 2>/dev/null || true
fi
