// /admin — password-protected analytics dashboard
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
<meta name="robots" content="noindex, nofollow"><title>dahej — sign in</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#fcfcfc;color:#101828;
    min-height:100vh;display:flex;align-items:center;justify-content:center;-webkit-font-smoothing:antialiased;}
  main{width:280px;}
  h1{font-size:14px;font-weight:600;margin-bottom:20px;}
  input{width:100%;height:36px;padding:0 11px;font-size:14px;color:#101828;background:#fff;
    border:1px solid #d0d5dd;border-radius:6px;outline:none;transition:border-color .12s,box-shadow .12s;}
  input:focus{border-color:#101828;box-shadow:0 0 0 1px #101828;}
  button{width:100%;height:36px;margin-top:10px;font-size:13.5px;font-weight:600;color:#fff;background:#101828;
    border:none;border-radius:6px;cursor:pointer;transition:background .12s;}
  button:hover{background:#2a2f3a;}
  .err{color:#d92d20;font-size:13px;margin-top:12px;}
</style></head><body>
  <main>
    <h1>Sign in to dahej</h1>
    <form method="POST" action="/admin">
      <input type="password" name="password" placeholder="Password" autofocus required>
      <button type="submit">Continue</button>
    </form>
    ${err}
  </main>
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

/* ---------- compact user-agent parser ---------- */
function parseUA(s) {
  const u = s || "";
  const bot = /bot|crawl|spider|slurp|preview|curl|wget|python|facebookexternalhit|twitterbot|telegrambot/i.test(u);
  let device = "Desktop";
  if (/iPhone/i.test(u)) device = "iPhone";
  else if (/iPad/i.test(u)) device = "iPad";
  else if (/Android.*Mobile/i.test(u)) device = "Android phone";
  else if (/Android/i.test(u)) device = "Android tablet";
  else if (/Windows/i.test(u)) device = "Windows PC";
  else if (/Macintosh|Mac OS X/i.test(u)) device = "Mac";
  else if (/Linux/i.test(u)) device = "Linux";
  const ver = (re) => (u.match(re) || [])[1];
  const inApp = u.match(/(Instagram|WhatsApp|Snapchat|FBAN|FBAV|Messenger|LinkedIn)/);
  let browser = "Unknown";
  if (/curl|wget|python/i.test(u)) browser = "Script";
  else if (inApp) browser = (/fban|fbav|messenger/i.test(inApp[1]) ? "Facebook" : inApp[1]) + " in-app";
  else if (/Edg\//.test(u)) browser = "Edge " + ver(/Edg\/(\d+)/);
  else if (/SamsungBrowser\//.test(u)) browser = "Samsung Internet " + ver(/SamsungBrowser\/(\d+)/);
  else if (/OPR\//.test(u)) browser = "Opera " + ver(/OPR\/(\d+)/);
  else if (/Firefox\//.test(u)) browser = "Firefox " + ver(/Firefox\/(\d+)/);
  else if (/Chrome\//.test(u)) browser = "Chrome " + ver(/Chrome\/(\d+)/);
  else if (/Version\/\d.*Safari/.test(u)) browser = "Safari " + ver(/Version\/(\d+)/);
  return { device, browser: browser.replace(/ undefined/, ""), bot };
}

/* ---------- latest visit records (reverse-timestamp keys → newest first) ---------- */
async function recentVisits(env) {
  const kv = env.DAHEJ_KV;
  const list = await kv.list({ prefix: "a:v:", limit: 300 });
  const vals = await Promise.all(list.keys.map((k) => kv.get(k.name, "json")));
  const out = [];
  list.keys.forEach((k, i) => { if (vals[i]) out.push(vals[i]); });
  return out;
}

function visitRows(visits) {
  if (!visits.length) return `<tr><td colspan="7" class="empty" style="text-align:left">No visits recorded yet.</td></tr>`;
  return visits.map((v) => {
    const p = parseUA(v.ua);
    const dt = String(v.t || "");
    const time = dt.slice(0, 10) + " " + dt.slice(11, 19);
    const map = v.lat && v.lon ? `https://www.google.com/maps?q=${encodeURIComponent(v.lat + "," + v.lon)}` : "";
    const loc = [v.city, v.region].filter(Boolean).join(", ") || v.tz || "—";
    const locHtml = map
      ? `<a href="${map}" target="_blank" rel="noopener">${flag(v.country)} ${esc(loc)}, ${esc(v.country)}</a>`
      : `${flag(v.country)} ${esc(loc)}${v.country && v.country !== "unk" ? ", " + esc(v.country) : ""}`;
    const path = v.path === "/" ? "home" : esc(String(v.path).replace("/urand/", "share:"));
    return `<tr>
      <td class="mono">${esc(time)}</td>
      <td class="mono">${esc(v.ip || "")}</td>
      <td>${locHtml}</td>
      <td>${esc(p.device)} · ${esc(p.browser)}${p.bot ? ' <span class="bot">bot</span>' : ""}</td>
      <td>${esc(v.ref || "direct")}</td>
      <td>${esc(path)}</td>
      <td class="mono dim">${esc(String(v.vid || "").slice(0, 6))}</td>
    </tr>`;
  }).join("");
}

/* ---------- last-14-days bar chart (views + uniques), pure inline SVG ---------- */
function chartSvg(rows) {
  const days = rows.slice(0, 14).reverse(); // oldest → newest
  if (!days.length) return `<p class="empty">No traffic yet.</p>`;

  const W = 980, H = 200, top = 12, base = 168, labelY = 186;
  const plot = base - top;
  const groupW = (W - 8) / days.length;
  const max = Math.max(1, ...days.map((r) => Math.max(r.views || 0, r.uniques || 0)));
  const maxLabel = max >= 1000 ? (max / 1000).toFixed(max % 1000 === 0 ? 0 : 1) + "k" : String(max);

  let bars = "";
  let labels = "";
  days.forEach((r, i) => {
    const cx = 4 + i * groupW + groupW / 2;
    const vH = Math.round((plot - 6) * ((r.views || 0) / max));
    const uH = Math.round((plot - 6) * ((r.uniques || 0) / max));
    const t = `${esc(r.date)} — ${r.views || 0} views, ${r.uniques || 0} uniques, ${r.shares || 0} share visits`;
    bars += `<rect x="${(cx - 14).toFixed(1)}" y="${base - vH}" width="13" height="${vH}" fill="#4f46e5"><title>${t}</title></rect>`;
    if (uH > 0) bars += `<rect x="${(cx + 1).toFixed(1)}" y="${base - uH}" width="7" height="${uH}" fill="#c7d2fe"><title>${t}</title></rect>`;
    labels += `<text x="${cx.toFixed(1)}" y="${labelY}" text-anchor="middle" font-size="10" fill="#98a2b3">${esc(r.date.slice(8, 10))}</text>`;
  });

  let grid = "";
  for (let i = 1; i <= 3; i++) {
    const y = base - Math.round((plot * i) / 4);
    grid += `<line x1="4" y1="${y}" x2="${W - 4}" y2="${y}" stroke="#f0f1f3"/>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Views and unique visitors for the last 14 days" preserveAspectRatio="none" style="width:100%;height:auto;display:block;">
    ${grid}
    <text x="4" y="${top - 1}" font-size="9.5" fill="#98a2b3">${maxLabel}</text>
    <line x1="4" y1="${base}" x2="${W - 4}" y2="${base}" stroke="#e3e6ea"/>
    ${bars}${labels}
  </svg>
  <div class="legend"><span><i class="dot v"></i>Views</span><span><i class="dot u"></i>Uniques</span><span>· hover for exact numbers · dates are UTC</span></div>`;
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
  const visits = await recentVisits(env);

  const countryList = Object.entries(totals.countries).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, v]) => `<li><span>${flag(k)} ${esc(k)}</span><span>${v}</span></li>`).join("");
  const referrerList = Object.entries(totals.referrers).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, v]) => `<li><span>${esc(k)}</span><span>${v}</span></li>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>dahej — analytics</title>
<style>
  :root{
    --bg:#fcfcfc; --ink:#101828; --gray:#667085; --faint:#98a2b3;
    --line:#eef0f3; --line-strong:#e3e6ea; --hover:#f7f8fa; --link:#3538cd;
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:var(--bg);color:var(--ink);
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
  a{color:var(--link);text-decoration:none;}
  a:hover{text-decoration:underline;}
  .wrap{max-width:1040px;margin:0 auto;padding:28px 24px 80px;}
  .mono{font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;}
  .dim{color:var(--faint);}

  header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--line-strong);}
  .brand{display:flex;align-items:baseline;gap:10px;min-width:0;}
  .brand strong{font-size:14px;font-weight:600;letter-spacing:-.01em;}
  .brand span{font-size:13px;color:var(--gray);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .logout{font-size:13px;color:var(--gray);padding:5px 10px;margin:-5px -10px;border-radius:6px;white-space:nowrap;}
  .logout:hover{color:var(--ink);background:#f2f3f5;text-decoration:none;}

  .stats{display:grid;grid-template-columns:repeat(6,1fr);border-bottom:1px solid var(--line-strong);}
  .stat{padding:22px 18px 18px;border-left:1px solid var(--line);}
  .stat:first-child{border-left:none;padding-left:0;}
  .stat b{display:block;font-size:24px;font-weight:600;letter-spacing:-.02em;line-height:1.25;font-variant-numeric:tabular-nums;}
  .stat b small{font-size:12px;font-weight:500;color:var(--faint);letter-spacing:0;}
  .stat i{display:block;font-style:normal;font-size:12.5px;color:var(--gray);margin-top:3px;}

  .h2row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:40px 0 14px;}
  .h2row h2{font-size:13px;font-weight:600;letter-spacing:-.005em;}
  .h2row span{font-size:12.5px;color:var(--faint);}
  .legend{display:flex;align-items:center;gap:14px;margin-top:8px;font-size:12px;color:var(--gray);}
  .dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;vertical-align:baseline;}
  .dot.v{background:#4f46e5;}
  .dot.u{background:#c7d2fe;}

  .cols{display:grid;grid-template-columns:1fr 1fr;gap:0 48px;}
  .cols ul{list-style:none;}
  .cols li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px;color:#344054;}
  .cols li span:last-child{font-variant-numeric:tabular-nums;font-weight:500;color:var(--ink);}

  .filterrow{display:flex;justify-content:flex-end;margin-bottom:10px;}
  input[type=search]{width:280px;max-width:100%;height:32px;padding:0 10px;font-size:13px;color:var(--ink);background:#fff;
    border:1px solid var(--line-strong);border-radius:6px;outline:none;transition:border-color .12s,box-shadow .12s;}
  input[type=search]::placeholder{color:var(--faint);}
  input[type=search]:focus{border-color:var(--ink);box-shadow:0 0 0 1px var(--ink);}

  .tablewrap{border:1px solid var(--line-strong);border-radius:8px;overflow:hidden;background:#fff;}
  .scroll{overflow-x:auto;}
  table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap;}
  th{font-size:11.5px;font-weight:500;color:var(--gray);text-align:left;padding:9px 14px;background:#fafbfc;border-bottom:1px solid var(--line-strong);}
  td{padding:7px 14px;border-bottom:1px solid var(--line);color:#344054;}
  tbody tr:last-child td{border-bottom:none;}
  tbody tr:hover{background:var(--hover);}
  td.mono{font-size:12px;}
  .bot{font-size:10.5px;color:var(--gray);border:1px solid var(--line-strong);border-radius:4px;padding:0 4px;}
  .empty{color:var(--faint);font-size:13px;padding:28px 0;text-align:center;}

  @media (max-width:820px){
    .stats{grid-template-columns:repeat(3,1fr);}
    .stat{padding:16px 12px 14px;border-top:1px solid var(--line);}
    .stat:nth-child(-n+3){border-top:none;}
    .stat:nth-child(3n+1){border-left:none;padding-left:0;}
    .cols{grid-template-columns:1fr;}
    .brand span{display:none;}
  }
  @media (prefers-reduced-motion: reduce){*{transition:none!important;}}
</style></head><body><div class="wrap">

  <header>
    <div class="brand"><strong>dahej</strong><span>dahej.sahil.run · visit-level analytics</span></div>
    <a class="logout" href="/admin?logout=1">Log out</a>
  </header>

  <div class="stats">
    <div class="stat"><b>${nf(totals.views)}</b><i>Page views</i></div>
    <div class="stat"><b>${nf(totals.uniques)}</b><i>Unique visitors</i></div>
    <div class="stat"><b>${nf(totals.shares)}</b><i>Share-link visits</i></div>
    <div class="stat"><b>${nf(avgViews)}</b><i>Avg views / day</i></div>
    <div class="stat"><b>${nf(best.views || 0)} <small>${best.date !== "—" ? best.date.slice(5) : ""}</small></b><i>Best day</i></div>
    <div class="stat"><b>${nf(rows.length)}</b><i>Days tracked</i></div>
  </div>

  <div class="h2row"><h2>Traffic</h2><span>last 14 days</span></div>
  ${chartSvg(rows)}

  <div class="h2row"><h2>Visits</h2><span>latest ${nf(visits.length)} · IP, location, device &amp; referrer · kept forever</span></div>
  <div class="filterrow"><input id="f" type="search" placeholder="Filter IP, city, device…" autocomplete="off"></div>
  <div class="tablewrap"><div class="scroll">
    <table id="vis">
      <thead><tr><th>Time (UTC)</th><th>IP</th><th>Location</th><th>Device</th><th>Referrer</th><th>Path</th><th>ID</th></tr></thead>
      <tbody>${visitRows(visits)}</tbody>
    </table>
  </div></div>

  <div class="h2row"><h2>Countries</h2></div>
  <div class="cols"><ul>${countryList || '<li><span class="empty" style="padding:12px 0;text-align:left">No data yet.</span></li>'}</ul></div>

  <div class="h2row"><h2>Referrers</h2></div>
  <div class="cols"><ul>${referrerList || '<li><span class="empty" style="padding:12px 0;text-align:left">No data yet.</span></li>'}</ul></div>

</div>
<script>
(function () {
  var f = document.getElementById("f");
  if (!f) return;
  f.addEventListener("input", function () {
    var q = f.value.toLowerCase();
    document.querySelectorAll("#vis tbody tr").forEach(function (tr) {
      tr.style.display = tr.textContent.toLowerCase().indexOf(q) > -1 ? "" : "none";
    });
  });
})();
</script>
</body></html>`;
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
