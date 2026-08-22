// GET /top — dahej leaderboard.
// Reads the top-100 index maintained by /api/save (single KV read), renders a
// static-friendly dark page matching the site's look. Pinned legend entries
// (Bonnie Blue) always occupy rank 1+ regardless of real entries.

const SEEDS = [
  { name: "Bonnie Blue 🐐", v: 137100000, note: "1,057 in 24 hours — undisputed champion" },
];

function worth(n) {
  if (n >= 1e7) return "₹" + (n / 1e7).toFixed(n % 1e7 === 0 ? 0 : 2) + " Crore";
  if (n >= 1e5) return "₹" + (n / 1e5).toFixed(n % 1e5 === 0 ? 0 : 1) + " Lakh";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function rowsHtml(entries, startRank) {
  const medal = ["🥇", "🥈", "🥉"];
  let html = "";
  entries.forEach((e, i) => {
    const rank = startRank + i;
    const r1 = rank <= 3 ? medal[rank - 1] : "#" + rank;
    const inner =
      '<span class="rank">' + r1 + "</span>" +
      '<span class="who">' + (e.name ? esc(e.name) : "Anonymous") + "</span>" +
      '<span class="val">' + worth(e.v || 0) + "</span>" +
      (e.note ? '<span class="note">' + esc(e.note) + "</span>" : "") +
      '<span class="meta">' + esc(e.t || "") + "</span>";
    if (e.id) {
      html +=
        '<a class="row' + (rank <= 3 ? " top3" : "") + '" href="/urand/' + encodeURIComponent(e.id) + '">' + inner +
        '<span class="go">view ↗</span></a>';
    } else {
      html += '<div class="row pinned' + (rank <= 3 ? " top3" : "") + '">' + inner + '<span class="go">👑</span></div>';
    }
  });
  return html;
}

export const onRequestGet = async ({ env }) => {
  let entries = [];
  try {
    const raw = await env.DAHEJ_KV.get("a:board", "json");
    if (Array.isArray(raw)) entries = raw;
  } catch (_) {}

  const seeds = SEEDS.map((s) => ({ ...s }));
  // if a real entry somehow beats a seed's value, still keep seeds first (pinned)
  const rest = entries.slice(0, 99);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dahej Leaderboard — top dahej values</title>
<meta name="description" content="The highest dahej values ever calculated. Can you beat the chart?">
<meta property="og:title" content="Dahej Leaderboard">
<meta property="og:description" content="The highest dahej values ever calculated. Beat them here.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%230b0c10'/%3E%3Ctext x='50' y='68' font-size='52' text-anchor='middle' fill='%23fff' font-family='Arial'%3E₹%3C/text%3E%3C/svg%3E">
<style>
  :root{color-scheme:dark;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:#0b0c10;color:#edeff3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased;}
  main{max-width:640px;margin:0 auto;padding:40px 18px 64px;}
  h1{font-size:30px;font-weight:800;letter-spacing:-.6px;}
  .sub{color:#8d949f;font-size:14.5px;margin:6px 0 26px;}
  .row{display:flex;align-items:center;gap:12px;background:#14161c;border:1px solid #262b34;border-radius:12px;padding:14px 16px;margin-bottom:10px;color:inherit;text-decoration:none;transition:border-color .15s, transform .1s;}
  a.row:hover{border-color:#3a4150;transform:translateX(3px);}
  .row.pinned{border-color:#4d3f1a;background:linear-gradient(135deg,#26200f,#14161c);}
  .row.top3{border-color:#3a4150;}
  .rank{flex:0 0 44px;font-weight:800;font-variant-numeric:tabular-nums;color:#8fb3ff;font-size:13.5px;}
  .who{font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .val{margin-left:auto;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:15.5px;}
  .meta{font-size:11.5px;color:#5d6570;white-space:nowrap;}
  .note{flex-basis:100%;font-size:12px;color:#e3b74a;margin:-6px 0 0 56px;}
  .go{font-size:12px;color:#8d949f;white-space:nowrap;}
  .cta{margin-top:26px;text-align:center;}
  .cta a{display:inline-block;background:#f4f6f9;color:#0b0c10;font-weight:700;font-size:15px;border-radius:10px;padding:12px 22px;text-decoration:none;transition:background .16s;}
  .cta a:hover{background:#fff;}
  @media (max-width:480px){.meta{display:none;}.note{margin-left:0;}}
</style>
</head>
<body>
<main>
  <h1>Dahej Leaderboard</h1>
  <p class="sub">Highest values ever calculated. Anonymous until you name yourself.</p>
  <div id="board">${rowsHtml(seeds, 1)}${rowsHtml(rest, seeds.length + 1) || ""}</div>
  ${rest.length ? "" : '<p class="sub" style="margin-top:4px">No entries yet — be the second name on this board.</p>'}
  <div class="cta"><a href="/">Calculate yours →</a></div>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=60" },
  });
};
