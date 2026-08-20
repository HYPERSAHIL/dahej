// POST /api/push/notify — send push to all subscribers (tickle, no payload encryption)
// Body: { title?: string, body?: string, url?: string, tag?: string }
// Rate-limited: 5/min per IP. If VAPID not configured, returns 503.

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function vapidJwt(endpoint, env) {
  const pubB64 = env.VAPID_PUBLIC_KEY;
  const privB64 = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT || "mailto:yo@sahilfucks.com";
  if (!pubB64 || !privB64) throw new Error("vapid not configured");
  // decode public to get x,y
  const pubBytes = b64urlToBytes(pubB64);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) throw new Error("bad public key");
  const x = bytesToB64url(pubBytes.slice(1, 33));
  const y = bytesToB64url(pubBytes.slice(33, 65));
  const d = privB64;
  const jwk = { kty: "EC", crv: "P-256", x, y, d };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 43200;
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({ aud, exp, sub: subject })));
  const unsigned = header + "." + payload;
  const sigBuf = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  // sig is raw r||s (may be 64 bytes or DER). WebCrypto returns DER for ECDSA — need to convert to raw 64
  // Cloudflare's subtle returns DER; convert:
  let sigBytes = new Uint8Array(sigBuf);
  // try to detect DER (0x30...)
  let rawSig = sigBytes;
  if (sigBytes[0] === 0x30) {
    // parse DER sequence
    try {
      let off = 2; // skip 0x30 len
      if (sigBytes[1] & 0x80) off += (sigBytes[1] & 0x7f);
      // r
      if (sigBytes[off] !== 0x02) throw 0;
      const rLen = sigBytes[off + 1];
      let r = sigBytes.slice(off + 2, off + 2 + rLen);
      off += 2 + rLen;
      if (sigBytes[off] !== 0x02) throw 0;
      const sLen = sigBytes[off + 1];
      let s = sigBytes.slice(off + 2, off + 2 + sLen);
      // strip leading zeros and pad to 32
      const strip = (a) => {
        while (a.length > 1 && a[0] === 0) a = a.slice(1);
        while (a.length < 32) a = new Uint8Array([0, ...a]);
        if (a.length > 32) a = a.slice(a.length - 32);
        return a;
      };
      r = strip(r); s = strip(s);
      rawSig = new Uint8Array([...r, ...s]);
    } catch (_) {
      // fallback: if not DER, assume already raw
    }
  }
  const jwt = unsigned + "." + bytesToB64url(rawSig);
  return { jwt, pub: pubB64 };
}

export const onRequestPost = async (context) => {
  try {
    const env = context.env;
    const kv = env.DAHEJ_KV;
    if (!kv) return new Response(JSON.stringify({ ok: false, error: "kv missing" }), { status: 500, headers: { "content-type": "application/json" } });
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "vapid not configured — set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY in Cloudflare dashboard, see VAPID_SETUP.md" }), { status: 503, headers: { "content-type": "application/json" } });
    }
    // rate limit per IP (5/min)
    const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
    const salt = env.ANALYTICS_SALT || "dahej-default-salt";
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":push:" + ip));
    const h = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
    const rlKey = "push:rl:" + h;
    const hits = Number(await kv.get(rlKey)) || 0;
    if (hits >= 5) return new Response(JSON.stringify({ ok: false, error: "too many requests" }), { status: 429, headers: { "content-type": "application/json" } });
    await kv.put(rlKey, String(hits + 1), { expirationTtl: 60 });

    let body = {};
    try { body = await context.request.json(); } catch (_) {}
    const title = String(body.title || "Dahej Calculator").slice(0, 60);
    const b = String(body.body || "Tap to open").slice(0, 120);
    const url = String(body.url || "/").slice(0, 200);
    const tag = String(body.tag || "").slice(0, 40);

    const list = await kv.list({ prefix: "push:sub:" });
    if (!list.keys.length) return new Response(JSON.stringify({ ok: true, sent: 0, note: "no subscribers — enable notifications on site first" }), { status: 200, headers: { "content-type": "application/json" } });

    // optional payload: we send tickle + also include data via fetch header? For tickle we include no body, sw shows title/body from query? Instead we send JSON body encrypted? For simplicity we send empty body and sw will fetch title/body from notification payload via `data`? Actually we can't send body without encryption — so we send no body and sw shows generic. To send title/body we need to include them in the push payload encrypted — complex. Instead we do trick: send push with no body, and sw will show title/body we pass via query? No.

    // Workaround: send push with **no payload** and sw shows title/body that we embed in the endpoint's `data`? Can't. So we send push with **JSON in clear via header**? No.

    // Instead we send a tiny encrypted payload using aes128gcm requires p256dh — but we can cheat: send push with **empty body** and have sw fetch latest title/body from server via `fetch("/api/push/last")`? Simpler: just show title/body we want by making sw show notification with title/body from the push event's `data` if we send it as plain JSON without encryption — some push services allow plain payload if subscription does not require encryption? No, Chrome requires encrypted payload.

    // For MVP without encryption, sw will show generic notification and ignore custom title/body. So we store the last notification in KV and sw fetches it on push.

    await kv.put("push:last", JSON.stringify({ title, body: b, url, tag, t: Date.now() }));

    let sent = 0, failed = 0;
    const results = await Promise.all(
      list.keys.map(async (k) => {
        const sub = await kv.get(k.name, "json");
        if (!sub || !sub.endpoint) return "skip";
        try {
          const { jwt, pub } = await vapidJwt(sub.endpoint, env);
          const res = await fetch(sub.endpoint, {
            method: "POST",
            headers: {
              TTL: "60",
              Urgency: "high",
              Authorization: `vapid t=${jwt}, k=${pub}`
            }
          });
          if (res.status === 410 || res.status === 404) {
            await kv.delete(k.name);
            return "gone";
          }
          if (!res.ok) {
            // log but don't delete
            return "fail:" + res.status;
          }
          return "ok";
        } catch (e) {
          return "err:" + String(e && e.message || e).slice(0, 80);
        }
      })
    );
    results.forEach((r) => { if (r === "ok") sent++; else if (r && r.startsWith("fail")) failed++; });
    return new Response(JSON.stringify({ ok: true, sent, failed, total: list.keys.length, results: results.slice(0, 10) }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
};

export const onRequestOptions = async () => {
  return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" } });
};
