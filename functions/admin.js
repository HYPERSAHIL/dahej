// /admin — password-protected stats dashboard
// GET  /admin        → login form (or dashboard if session cookie is valid)
// POST /admin        → verify password, set session cookie (30 days), redirect
// Requires ADMIN_PASSWORD in the Pages project env; admin stays disabled (503) without it.

const COOKIE_NAME = "dahej_admin";
const COOKIE_TTL = 60 * 60 * 24 * 30;

async function expectedToken(env) {
  const key = env.ADMIN_PASSWORD || "";
  if (!key) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("dahej-admin:" + key));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hasSession(request, token) {
  const cookie = request.headers.get("cookie") || "";
  return cookie.split(";").some((c) => c.trim() === COOKIE_NAME + "=" + token);
}

function loginPage(error) {
  const err = error ? `<p class="err">${error}</p>` : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow"><title>Admin</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0c10;color:#eee;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;}
  .box{background:#15171c;border:1px solid #262a31;border-radius:14px;padding:34px 30px;width:300px;box-shadow:0 24px 60px -20px rgba(0,0,0,.7);}
  h1{font-size:18px;margin:0 0 18px;letter-spacing:.2px;}
  input[type=password]{width:100%;padding:11px 13px;border-radius:9px;border:1px solid #33373f;background:#0b0c10;color:#eee;font-size:14px;outline:none;box-sizing:border-box;transition:border-color .15s;}
  input[type=password]:focus{border-color:#7a8699;}
  button{width:100%;margin-top:14px;padding:11px;border:none;border-radius:9px;background:#fff;color:#0b0c10;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s;}
  button:hover{background:#e0e0e0;}
  .err{color:#ff6b6b;font-size:13px;margin:10px 0 0;}
</style></head><body>
  <div class="box">
    <h1>Admin</h1>
    <form method="POST" action="/admin">
      <input type="password" name="password" placeholder="Password" autofocus required>
      <button type="submit">Sign in</button>
    </form>
    ${err}
  </div>
</body></html>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ISO country code → flag emoji (falls back to a white flag)
function flag(cc) {
  if (!/^[A-Za-z]{2}$/.test(cc)) return "🏳️";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function cn(o, decorate) {
  const entries = Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!entries.length) return "";
  return entries
    .map(([k, v]) => `<li><span class="k">${decorate ? flag(k) + " " : ""}${esc(k)}</span><span class="v">${v}</span></li>`)
    .join("");
}

/* ---------- last-14-days bar chart (views + uniques), pure inline SVG ---------- */
function chartSvg(rows) {
  const days = rows.slice(0, 14).reverse(); // oldest → newest
  if (!days.length) return `<p class="empty">no data yet</p>`;

  const W = 600, H = 210, top = 14, base = 160, labelY = 180;
  const plot = base - top;
  const groupW = (W - 20) / days.length;
  const max = Math.max(1, ...days.map((r) => Math.max(r.views || 0, r.uniques || 0)));
  const maxLabel = max >= 1000 ? (max / 1000).toFixed(max % 1000 === 0 ? 0 : 1) + "k" : String(max);

  let bars = "";
  let labels = "";
  days.forEach((r, i) => {
    const x = 10 + i * groupW;
    const cx = x + groupW / 2;
    const vH = Math.round((plot - 8) * ((r.views || 0) / max));
    const uH = Math.round((plot - 8) * ((r.uniques || 0) / max));
    const t = `${esc(r.date)} — ${r.views || 0} views, ${r.uniques || 0} uniques, ${r.shares || 0} share visits`;
    bars += `<g><rect x="${(cx - 16).toFixed(1)}" y="${base - vH}" width="15" height="${vH}" rx="3" fill="#8fb3ff"><title>${t}</title></rect>`;
    if (uH > 0) bars += `<rect x="${(cx + 2).toFixed(1)}" y="${base - uH}" width="9" height="${uH}" rx="2.5" fill="#63d6a2"><title>${t}</title></rect>`;
    bars += `</g>`;
    labels += `<text x="${cx.toFixed(1)}" y="${labelY}" text-anchor="middle" font-size="9.5" fill="#7d8590">${esc(r.date.slice(8, 10))}</text>`;
  });

  let grid = "";
  for (let i = 1; i <= 3; i++) {
    const y = base - Math.round((plot * i) / 4);
    grid += `<line x1="10" y1="${y}" x2="${W - 10}" y2="${y}" stroke="#20242a" stroke-dasharray="3 4"/>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Views and unique visitors for the last 14 days" preserveAspectRatio="none" style="width:100%;height:auto;display:block;">
    ${grid}
    <text x="10" y="${top - 3}" font-size="9" fill="#5d6570">${maxLabel}</text>
    <line x1="10" y1="${base}" x2="${W - 10}" y2="${base}" stroke="#33373f"/>
    ${bars}${labels}
  </svg>
  <div class="legend"><span><i class="dot v"></i>Views</span><span><i class="dot u"></i>Uniques</span><span class="hint">hover bars for exact numbers</span></div>`;
}

async function dashboard(env) {
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

  const avgViews = rows.length ? Math.round(totals.views / rows.length) : 0;
  const best = rows.reduce((m, r) => ((r.views || 0) > (m.views || 0) ? r : m), { date: "—", views: 0 });
  const nf = (n) => n.toLocaleString("en-IN");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>dahej — admin</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0c10;color:#eee;margin:0;padding:32px 20px;}
  .wrap{max-width:820px;margin:0 auto;}
  .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:12px;}
  h1{font-size:24px;margin:0;letter-spacing:-.4px;}
  .sub{color:#888;font-size:13px;margin-bottom:28px;}
  .logout{font-size:13px;color:#888;text-decoration:none;border:1px solid #33373f;border-radius:8px;padding:6px 12px;white-space:nowrap;transition:color .15s,border-color .15s;}
  .logout:hover{color:#fff;border-color:#666;}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:26px;}
  .card{background:#15171c;border:1px solid #262a31;border-radius:12px;padding:18px;transition:border-color .15s;}
  .card:hover{border-color:#3a4150;}
  .card .n{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.5px;}
  .card .n small{font-size:13px;font-weight:600;color:#888;letter-spacing:0;}
  .card .l{font-size:11.5px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-top:4px;}
  h2{font-size:13px;color:#9aa3af;margin:26px 0 10px;text-transform:uppercase;letter-spacing:.12em;}
  ul{list-style:none;margin:0;padding:0;}
  li{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #20242a;font-size:13.5px;}
  li:last-child{border-bottom:none;}
  li .k{color:#ccc;word-break:break-all;padding-right:12px;}
  li .v{font-weight:700;color:#fff;white-space:nowrap;font-variant-numeric:tabular-nums;}
  .panel{background:#15171c;border:1px solid #262a31;border-radius:12px;padding:16px;}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  @media (max-width:640px){.cols{grid-template-columns:1fr;}}
  .legend{display:flex;align-items:center;gap:16px;margin-top:10px;font-size:12px;color:#9aa3af;}
  .legend .hint{margin-left:auto;color:#5d6570;}
  .dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;vertical-align:baseline;}
  .dot.v{background:#8fb3ff;}
  .dot.u{background:#63d6a2;}
  .empty{color:#666;font-size:13px;margin:0;text-align:center;padding:24px 0;}
  @media (prefers-reduced-motion: reduce){*{transition:none!important;}}
</style></head><body><div class="wrap">
  <div class="top"><h1>dahej.sahil.run — admin</h1><a class="logout" href="/admin?logout=1">Log out</a></div>
  <p class="sub">transparent visit metrics · no raw IPs stored · hashed dedupe only</p>
  <div class="cards">
    <div class="card"><div class="n">${nf(totals.views)}</div><div class="l">Page views</div></div>
    <div class="card"><div class="n">${nf(totals.uniques)}</div><div class="l">Unique visitors</div></div>
    <div class="card"><div class="n">${nf(totals.shares)}</div><div class="l">Share-link visits</div></div>
    <div class="card"><div class="n">${nf(avgViews)}</div><div class="l">Avg views / day</div></div>
    <div class="card"><div class="n">${nf(best.views || 0)} <small>${best.date !== "—" ? best.date.slice(5) : ""}</small></div><div class="l">Best day</div></div>
    <div class="card"><div class="n">${nf(rows.length)}</div><div class="l">Days tracked</div></div>
  </div>
  <h2>Last 14 days</h2>
  <div class="panel">${chartSvg(rows)}</div>
  <div class="cols">
    <div><h2>Countries</h2><div class="panel"><ul>${cn(totals.countries, true) || '<li class="k" style="color:#666">no data yet</li>'}</ul></div></div>
    <div><h2>Top referrers</h2><div class="panel"><ul>${cn(totals.referrers) || '<li class="k" style="color:#666">no data yet</li>'}</ul></div></div>
  </div>
</div></body></html>`;
}

export const onRequest = async ({ request, env }) => {
  const url = new URL(request.url);
  const token = await expectedToken(env);

  if (!token) {
    return new Response("Admin disabled: ADMIN_PASSWORD is not configured.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // logout
  if (url.searchParams.get("logout")) {
    return new Response(null, {
      status: 302,
      headers: {
        location: "/admin",
        "set-cookie": COOKIE_NAME + "=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
      },
    });
  }

  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const pass = (form && form.get("password")) || "";
    if (pass === env.ADMIN_PASSWORD) {
      return new Response(null, {
        status: 302,
        headers: {
          location: "/admin",
          "set-cookie": COOKIE_NAME + "=" + token + "; Path=/; Max-Age=" + COOKIE_TTL + "; HttpOnly; SameSite=Lax",
        },
      });
    }
    return new Response(loginPage("Wrong password."), { status: 401, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }

  if (!hasSession(request, token)) {
    return new Response(loginPage(""), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }

  const html = await dashboard(env);
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
};
