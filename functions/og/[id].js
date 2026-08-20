// GET /og/:id — dynamic OG image (SVG) for share links
// Returns 1200x630 image for WhatsApp/Telegram/Twitter previews.
// No external deps — pure SVG, fast, edge-cached.

const W = {
  bodycout: 3, depthPuh: 2.5, widthPuh: 2.5, ipill: 2, unsafe: 4,
  talking: 1.5, situationships: 3, exbf: 5, relationships: 4,
  oyo: 1.2, gooning: 1.5
};
function isCommunityPuh(d) {
  return d.bodycout === 0 && d.unsafe === 0 && d.talking === 0 &&
    d.situationships === 0 && d.exbf === 0 && d.relationships === 0 &&
    d.oyo === 0 && d.gooning === 0;
}
function calcTotal(d) {
  let score = 0;
  for (const k in W) score += (d[k] || 0) * W[k];
  if (d.age > 0) score += Math.max(0, d.age - 22) * 1.4;
  return Math.max(50000, Math.round(150000 + score * 18500));
}
function fmt(n) {
  if (n >= 1e7) return "₹" + (n / 1e7).toFixed(n % 1e7 === 0 ? 0 : 2) + " Cr";
  if (n >= 1e5) return "₹" + (n / 1e5).toFixed(n % 1e5 === 0 ? 0 : 1) + " Lakh";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

export const onRequestGet = async ({ env, params }) => {
  const id = String(params.id || "").slice(0, 12);
  const raw = env.DAHEJ_KV ? await env.DAHEJ_KV.get("share:" + id) : null;
  let titleLine = "Dahej Calculator";
  let valueLine = "Calculate your dahej value";
  let subLine = "sahil.run · 20 seconds · share with friends";

  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (isCommunityPuh(d)) {
        titleLine = "You deserve a";
        valueLine = "community puh";
        subLine = "Find out yours → dahej.sahil.run";
      } else {
        const v = calcTotal(d);
        titleLine = "My dahej value is";
        valueLine = fmt(v);
        subLine = "Calculate yours → dahej.sahil.run";
      }
    } catch (_) {}
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0c10"/>
      <stop offset="100%" stop-color="#1a1f2b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8fb3ff"/>
      <stop offset="100%" stop-color="#63d6a2"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="18" flood-opacity="0.35"/></filter>
  </defs>
  <rect width="1200" height="630" rx="0" fill="url(#bg)"/>
  <!-- subtle grid -->
  <g opacity="0.06" stroke="#fff" stroke-width="1">
    ${Array.from({length: 12}, (_,i)=>`<line x1="${100+i*90}" y1="0" x2="${100+i*90}" y2="630"/>`).join("")}
    ${Array.from({length: 6}, (_,i)=>`<line x1="0" y1="${90+i*90}" x2="1200" y2="${90+i*90}"/>`).join("")}
  </g>
  <!-- top pill -->
  <g transform="translate(48,36)">
    <rect x="0" y="0" width="170" height="36" rx="18" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.14)"/>
    <text x="85" y="23" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="13" font-weight="700" letter-spacing="0.14em" fill="#9aa3af">DAHEJ CALCULATOR</text>
  </g>
  <!-- value block -->
  <g transform="translate(48,150)">
    <text x="0" y="0" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="28" font-weight="600" fill="#8d949f">${esc(titleLine)}</text>
    <text x="0" y="84" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="78" font-weight="800" letter-spacing="-0.04em" fill="#fff">${esc(valueLine)}</text>
    <rect x="0" y="108" width="84" height="4" rx="2" fill="url(#accent)"/>
    <text x="0" y="148" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="18" font-weight="500" fill="#7d8590">${esc(subLine)}</text>
  </g>
  <!-- right card hint -->
  <g transform="translate(780,120)">
    <rect x="0" y="0" width="372" height="390" rx="24" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)"/>
    <rect x="24" y="24" width="324" height="18" rx="9" fill="rgba(255,255,255,0.08)"/>
    <rect x="24" y="56" width="220" height="14" rx="7" fill="rgba(255,255,255,0.06)"/>
    <g transform="translate(24,100)">
      ${["Defender OCTA","Fortuner GR-S","Scorpio N 4×4","10 Cr Cash","5 Trips × 5 yrs","10 Acre land"].map((t,i)=>`
        <g transform="translate(0,${i*44})">
          <rect x="0" y="0" width="28" height="28" rx="8" fill="#1c2027" stroke="rgba(255,255,255,0.08)"/>
          <text x="14" y="19" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="800" fill="#8fb3ff">${i+1}</text>
          <text x="44" y="19" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="#c6cbd3">${esc(t)}</text>
        </g>`).join("")}
    </g>
    <text x="186" y="370" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" letter-spacing="0.12em" fill="#5d6570">DAHEJ.SAHIL.RUN</text>
  </g>
  <!-- bottom bar -->
  <rect x="0" y="626" width="1200" height="4" fill="url(#accent)"/>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      "access-control-allow-origin": "*",
    },
  });
};
