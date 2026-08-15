// POST /api/track — transparent visit tracking (no PII stored)
// Counts: page views, unique visitors per day (hashed IP dedupe, no raw IP),
// country via CF-IPCountry, referrer host, and share-link (/urand/*) clicks.
export const onRequest = async (context) => {
  const kv = context.env.DAHEJ_KV;

  // ---------- determine path ----------
  let path = "/";
  try {
    const body = await context.request.json().catch(() => null);
    if (body && typeof body.path === "string") path = body.path;
  } catch (_) {}

  // ---------- day key ----------
  const now = new Date();
  const ymd =
    now.getUTCFullYear() +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0");
  const dayKey = "a:day:" + ymd;

  // ---------- unique visitor dedupe (hash of IP + day, IP never stored) ----------
  const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
  const country = context.request.headers.get("CF-IPCountry") || "unk";
  const salt = context.env.ANALYTICS_SALT || "dahej-default-salt";
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + ip + ":" + ymd));
  const ipHash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  const seenKey = "a:seen:" + ymd + ":" + ipHash;

  // ---------- referrer ----------
  let referrer = "";
  try {
    const ref = context.request.headers.get("Referer") || "";
    referrer = new URL(ref).hostname.replace(/^www\./, "");
  } catch (_) {}

  // ---------- update counters ----------
  const [existing, seen] = await Promise.all([
    kv.get(dayKey, "json"),
    kv.get(seenKey),
  ]);

  const doc = existing && typeof existing === "object" ? existing : { views: 0, uniques: 0, shares: 0, countries: {}, referrers: {} };
  doc.views += 1;

  const isShare = path.indexOf("/urand/") === 0;
  if (isShare) doc.shares += 1;

  if (seen === null) {
    doc.uniques += 1;
    doc.countries[country] = (doc.countries[country] || 0) + 1;
    await kv.put(seenKey, "1", { expirationTtl: 60 * 60 * 24 * 2 });
  }

  if (referrer) {
    referrer = referrer.length > 80 ? referrer.slice(0, 80) : referrer;
    doc.referrers[referrer] = (doc.referrers[referrer] || 0) + 1;
  }

  await kv.put(dayKey, JSON.stringify(doc), { expirationTtl: 60 * 60 * 24 * 400 });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
};