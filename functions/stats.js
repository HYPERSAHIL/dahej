// GET /stats?key=... — private stats dashboard (server-rendered, no JS libs)
export const onRequestGet = async ({ env, request }) => {
  const url = new URL(request.url);
  const provided = url.searchParams.get("key") || "";
  const expected = env.ANALYTICS_KEY || "";
  if (!expected || provided !== expected) {
    return new Response("forbidden", { status: 403 });
  }

  const kv = env.DAHEJ_KV;
  const list = await kv.list({ prefix: "a:day:" });
  const rows = [];
  for (const k of list.keys) {
    const raw = await kv.get(k.name, "json");
    if (raw && typeof raw === "object") rows.push({ date: k.name.replace("a:day:", ""), ...raw });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));

  const totals = { views: 0, uniques: 0, shares: 0, countries: {}, referrers: {} };
  rows.forEach((r) => {
    totals.views += r.views || 0;
    totals.uniques += r.uniques || 0;
    totals.shares += r.shares || 0;
    for (const c in r.countries) totals.countries[c] = (totals.countries[c] || 0) + r.countries[c];
    for (const ref in r.referrers) totals.referrers[ref] = (totals.referrers[ref] || 0) + r.referrers[ref];
  });

  const cn = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, v]) => `<li><span class="k">${esc(k)}</span><span class="v">${v}</span></li>`).join("");

  const dayRows = rows.slice(0, 14)
    .map((r) => `<tr><td>${r.date}</td><td>${r.views || 0}</td><td>${r.uniques || 0}</td><td>${r.shares || 0}</td></tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>dahej stats</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0c10;color:#eee;margin:0;padding:32px 20px;}
  .wrap{max-width:760px;margin:0 auto;}
  h1{font-size:24px;margin:0 0 4px;}
  .sub{color:#888;font-size:13px;margin-bottom:28px;}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:28px;}
  .card{background:#15171c;border:1px solid #262a31;border-radius:12px;padding:18px;}
  .card .n{font-size:28px;font-weight:800;}
  .card .l{font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-top:4px;}
  h2{font-size:15px;color:#aaa;margin:24px 0 10px;text-transform:uppercase;letter-spacing:.1em;}
  ul{list-style:none;margin:0;padding:0;}
  li{display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #20242a;font-size:13.5px;}
  li .k{color:#ccc;word-break:break-all;padding-right:12px;}
  li .v{font-weight:700;color:#fff;white-space:nowrap;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #20242a;}
  th{color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.08em;}
  td:first-child{color:#ccc;}
  .panel{background:#15171c;border:1px solid #262a31;border-radius:12px;padding:8px 12px;}
</style></head><body><div class="wrap">
  <h1>dahej.sahil.run — stats</h1>
  <p class="sub">transparent visit metrics · no raw IPs stored · hashed dedupe only</p>
  <div class="cards">
    <div class="card"><div class="n">${totals.views}</div><div class="l">Page views</div></div>
    <div class="card"><div class="n">${totals.uniques}</div><div class="l">Unique visitors</div></div>
    <div class="card"><div class="n">${totals.shares}</div><div class="l">Share-link visits</div></div>
    <div class="card"><div class="n">${rows.length}</div><div class="l">Days tracked</div></div>
  </div>
  <div class="panel">
    <h2>Last 14 days</h2>
    <table><tr><th>Date</th><th>Views</th><th>Uniques</th><th>Shares</th></tr>${dayRows || "<tr><td colspan=4 style='color:#666'>no data yet</td></tr>"}</table>
  </div>
  <div class="panel">
    <h2>Countries</h2>
    <ul>${cn(totals.countries) || "<li style='color:#666'>no data yet</li>"}</ul>
  </div>
  <div class="panel">
    <h2>Top referrers</h2>
    <ul>${cn(totals.referrers) || "<li style='color:#666'>no data yet</li>"}</ul>
  </div>
</div></body></html>`;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
};