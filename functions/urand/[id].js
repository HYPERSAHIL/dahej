// GET /urand/:id — serve the saved calculator state for a share link
export const onRequestGet = async ({ env, params, request }) => {
  const id = (params.id || "").toString();
  const url = new URL(request.url);

  const raw = await env.DAHEJ_KV.get("share:" + id);
  if (!raw) {
    // Not found: return a 404 page that still loads the app shell
    return Response.redirect(url.origin + "/#/", 302);
  }

  // Return the app shell (index.html) with state embedded
  const indexHtml = await env.ASSETS.fetch(url.origin + "/index.html");
  const html = await indexHtml.text();
  const payload = JSON.stringify(JSON.parse(raw));
  const injected = html.replace(
    '<script>',
    '<script>window.__SHARE_ID__=' + JSON.stringify(id) + ';window.__SHARE_INPUTS__=' + payload + ';'
  );
  return new Response(injected, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};