// GET /api/push/last — return last notification payload for SW to display (tickle workaround)
export const onRequestGet = async (context) => {
  const kv = context.env.DAHEJ_KV;
  if (!kv) return new Response(JSON.stringify({ title: "Dahej", body: "Tap to open" }), { status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  const raw = await kv.get("push:last", "json");
  if (!raw) return new Response(JSON.stringify({ title: "Dahej Calculator", body: "Hisab ready — tap to open", url: "/" }), { status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  return new Response(JSON.stringify(raw), { status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" } });
};
