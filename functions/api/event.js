// POST /api/event — lightweight funnel event (calc, share)
// Body: { type: "calc" | "share", vid?: string }
// Updates per-day aggregate without per-visit log — 1 KV write per event.
// Rate-limited per-IP via hashed dedupe (1 calc per 5s burst).

export const onRequestPost = async (context) => {
  try {
    const kv = context.env.DAHEJ_KV;
    if (!kv) return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "content-type": "application/json" } });
    const body = await context.request.json().catch(() => null);
    const type = body && body.type;
    if (type !== "calc" && type !== "share") return new Response(JSON.stringify({ error: "bad type" }), { status: 400, headers: { "content-type": "application/json" } });

    const now = new Date();
    const ymd = now.getUTCFullYear() + String(now.getUTCMonth() + 1).padStart(2, "0") + String(now.getUTCDate()).padStart(2, "0");
    const dayKey = "a:day:" + ymd;

    // light burst limit: share 1/2s, calc 1/5s per IP
    const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
    const salt = context.env.ANALYTICS_SALT || "dahej-default-salt";
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":ev:" + ip + ":" + type));
    const ipHash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
    const rlKey = "a:evrl:" + type + ":" + ipHash;
    const last = await kv.get(rlKey);
    if (last) return new Response(JSON.stringify({ ok: true, throttled: true }), { status: 200, headers: { "content-type": "application/json" } });
    await kv.put(rlKey, "1", { expirationTtl: type === "calc" ? 5 : 2 });

    const doc = (await kv.get(dayKey, "json")) || { views: 0, uniques: 0, shares: 0, countries: {}, referrers: {} };
    if (type === "calc") doc.calcs = (doc.calcs || 0) + 1;
    if (type === "share") doc.shares = (doc.shares || 0) + 1;
    await kv.put(dayKey, JSON.stringify(doc));

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "content-type": "application/json" } });
  }
};
