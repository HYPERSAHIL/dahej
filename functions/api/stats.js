// GET /api/stats — private analytics view, requires ?key=<admin password>
export const onRequestGet = async ({ env, request }) => {
  const url = new URL(request.url);
  const provided = url.searchParams.get("key") || request.headers.get("x-analytics-key") || "";
  const expected = env.ADMIN_PASSWORD || "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const kv = env.DAHEJ_KV;
  const list = await kv.list({ prefix: "a:day:" });
  const days = [];
  for (const k of list.keys) {
    const raw = await kv.get(k.name, "json");
    if (raw && typeof raw === "object") {
      days.push({ date: k.name.replace("a:day:", ""), ...raw });
    }
  }
  days.sort((a, b) => (a.date < b.date ? 1 : -1));

  const totals = { views: 0, uniques: 0, shares: 0, countries: {}, referrers: {}, days: {} };
  days.forEach((d) => {
    totals.views += d.views || 0;
    totals.uniques += d.uniques || 0;
    totals.shares += d.shares || 0;
    for (const c in d.countries) totals.countries[c] = (totals.countries[c] || 0) + d.countries[c];
    for (const r in d.referrers) totals.referrers[r] = (totals.referrers[r] || 0) + d.referrers[r];
    totals.days[d.date] = { views: d.views, uniques: d.uniques, shares: d.shares };
  });

  return new Response(JSON.stringify({ totals, recentDays: days.slice(0, 14) }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};