// POST /api/track — visit analytics
// Two layers:
//  1. per-day aggregates (views, uniques, countries, referrers) → dashboard chart
//  2. per-visit log (IP, geo, user agent, referrer, visitor id) → admin feed, 90-day retention
// Visit-log keys use a reverse timestamp so KV list() returns newest first.
export const onRequest = async (context) => {
  const kv = context.env.DAHEJ_KV;

  // ---------- payload ----------
  let path = "/";
  let vid = "";
  try {
    const body = await context.request.json().catch(() => null);
    if (body && typeof body.path === "string") path = body.path.slice(0, 120);
    if (body && typeof body.vid === "string") vid = body.vid.slice(0, 16);
  } catch (_) {}

  // ---------- day key ----------
  const now = new Date();
  const ymd =
    now.getUTCFullYear() +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0");
  const dayKey = "a:day:" + ymd;

  // ---------- visitor context ----------
  const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
  const cf = context.request.cf || {};
  const country = cf.country || context.request.headers.get("CF-IPCountry") || "unk";
  const city = cf.city || "";
  const region = cf.region || "";
  const tz = cf.timezone || "";
  const lat = cf.latitude != null ? String(cf.latitude) : "";
  const lon = cf.longitude != null ? String(cf.longitude) : "";
  const ua = (context.request.headers.get("user-agent") || "").slice(0, 250);
  const lang = (context.request.headers.get("accept-language") || "").slice(0, 30);

  // ---------- unique visitor dedupe (hash of IP + day) ----------
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

  // ---------- update aggregates ----------
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

  // ---------- per-visit log record ----------
  // reverse epoch-ms keeps 14 digits and sorts newest-first in KV list()
  const revStamp = String(1e14 - now.getTime());
  const rb = new Uint32Array(1);
  crypto.getRandomValues(rb);
  const visitKey = "a:v:" + revStamp + "-" + rb[0].toString(36).slice(0, 4);
  const visit = {
    t: now.toISOString(),
    ip, country, city, region, tz, lat, lon,
    ua, lang,
    ref: referrer,
    path,
    vid,
  };

  await Promise.all([
    kv.put(dayKey, JSON.stringify(doc), { expirationTtl: 60 * 60 * 24 * 400 }),
    kv.put(visitKey, JSON.stringify(visit), { expirationTtl: 60 * 60 * 24 * 90 }),
  ]);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
};
