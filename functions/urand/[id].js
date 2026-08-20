// GET /urand/:id — serve the saved calculator state for a share link
// On hit: injects the state into the app shell AND rewrites the <title> +
// og:title/og:description so link previews (WhatsApp/Telegram/etc.) show the value.
// On miss: serves the meme 404 page with a real 404 status.

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

function worth(n) {
  if (n >= 1e7) return (n / 1e7).toFixed(n % 1e7 === 0 ? 0 : 2) + " Crore";
  if (n >= 1e5) return (n / 1e5).toFixed(n % 1e5 === 0 ? 0 : 1) + " Lakh";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + " Thousand";
  return String(n);
}

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export const onRequestGet = async ({ env, params, request }) => {
  const id = (params.id || "").toString();
  const url = new URL(request.url);

  const raw = await env.DAHEJ_KV.get("share:" + id);
  if (!raw) {
    const notFound = await env.ASSETS.fetch(url.origin + "/404.html");
    const body = await notFound.text();
    return new Response(body, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  let inputs;
  try {
    inputs = JSON.parse(raw);
  } catch (_) {
    return Response.redirect(url.origin + "/#/", 302);
  }

  const indexHtml = await env.ASSETS.fetch(url.origin + "/index.html");
  let html = await indexHtml.text();

  // dynamic link preview
  const community = isCommunityPuh(inputs);
  const title = community ? "You deserve a community puh" : "My dahej value is ₹" + worth(calcTotal(inputs));
  const desc = community ? "Find out yours on the Dahej Calculator." : "Calculate your own dahej value — it takes 20 seconds.";
  const ogUrl = url.origin + "/og/" + id;
  html = html
    .replace("<title>Dahej Calculator — Calculate your dahej value</title>", "<title>" + escAttr(title) + " — Dahej Calculator</title>")
    .replace("content=\"Dahej Calculator — what's your dahej value?\"", 'content="' + escAttr(title) + '"')
    .replace('content="Calculate your estimated dahej value in seconds."', 'content="' + escAttr(desc) + '"')
    // inject dynamic OG image (after twitter:card meta)
    .replace('<meta name="twitter:card" content="summary">', '<meta name="twitter:card" content="summary_large_image">\n<meta property="og:image" content="' + escAttr(ogUrl) + '">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:image" content="' + escAttr(ogUrl) + '">');

  // embed the saved state for the app shell
  const payload = JSON.stringify(inputs);
  html = html.replace(
    '<script>',
    '<script>window.__SHARE_ID__=' + JSON.stringify(id) + ';window.__SHARE_INPUTS__=' + payload + ';'
  );
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};
