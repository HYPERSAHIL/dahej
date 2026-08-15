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
  .box{background:#15171c;border:1px solid #262a31;border-radius:14px;padding:34px 30px;width:300px;}
  h1{font-size:18px;margin:0 0 18px;letter-spacing:.2px;}
  input[type=password]{width:100%;padding:11px 13px;border-radius:9px;border:1px solid #33373f;background:#0b0c10;color:#eee;font-size:14px;outline:none;box-sizing:border-box;}
  input[type=password]:focus{border-color:#555;}
  button{width:100%;margin-top:14px;padding:11px;border:none;border-radius:9px;background:#fff;color:#0b0c10;font-size:14px;font-weight:700;cursor:pointer;}
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

function cn(o) {
  return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, v]) => `<li><span class="k">${esc(k)}</span><span class="v">${v}</span></li>`).join("");
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

  const dayRows = rows.slice(0, 14)
    .map((r) => `<tr><td>${r.date}</td><td>${r.views || 0}</td><td>${r.uniques || 0}</td><td>${r.shares || 0}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>dahej — admin</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0c10;color:#eee;margin:0;padding:32px 20px;}
  .wrap{max-width:760px;margin:0 auto;}
  .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
  h1{font-size:24px;margin:0;}
  .sub{color:#888;font-size:13px;margin-bottom:28px;}
  .logout{font-size:13px;color:#888;text-decoration:none;border:1px solid #33373f;border-radius:8px;padding:6px 12px;}
  .logout:hover{color:#fff;border-color:#666;}
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
  <div class="top"><h1>dahej.sahil.run — admin</h1><a class="logout" href="/admin?logout=1">Log out</a></div>
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