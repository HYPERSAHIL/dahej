// GET /api/stats — public, cacheable totals for the social-proof line.
// Sums per-day aggregates (same docs the admin dashboard uses).
// Cached at the edge for 5 min so hammering this costs almost nothing.

export const onRequestGet = async ({ env }) => {
  const kv = env.DAHEJ_KV;
  const out = { views: 0, uniques: 0, calcs: 0, shares: 0 };
  try {
    if (!kv) throw new Error("no kv");
    const list = await kv.list({ prefix: "a:day:" });
    const vals = await Promise.all(list.keys.map((k) => kv.get(k.name, "json")));
    vals.forEach((d) => {
      if (!d || typeof d !== "object") return;
      out.views += d.views || 0;
      out.uniques += d.uniques || 0;
      out.calcs += d.calcs || 0;
      out.shares += d.shares || 0;
    });
  } catch (_) {}
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=120, s-maxage=300",
      "access-control-allow-origin": "*",
    },
  });
};
