// POST /api/push/subscribe — save Web Push subscription in KV
export const onRequestPost = async (context) => {
  try {
    const kv = context.env.DAHEJ_KV;
    if (!kv) return new Response(JSON.stringify({ ok: false, error: "kv missing" }), { status: 500, headers: { "content-type": "application/json" } });
    const body = await context.request.json().catch(() => null);
    const sub = body && body.subscription;
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return new Response(JSON.stringify({ ok: false, error: "invalid subscription" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    // hash endpoint for key (first 16 hex of sha256)
    const salt = context.env.ANALYTICS_SALT || "dahej-default-salt";
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + sub.endpoint));
    const hash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    const key = "push:sub:" + hash;
    const doc = {
      endpoint: String(sub.endpoint).slice(0, 500),
      keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) },
      exp: sub.expirationTime || null,
      ua: (context.request.headers.get("user-agent") || "").slice(0, 200),
      t: new Date().toISOString(),
      vid: (body.vid || "").toString().slice(0, 16)
    };
    await kv.put(key, JSON.stringify(doc));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
};

export const onRequestOptions = async () => {
  return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" } });
};
