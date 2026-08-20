// GET /api/push/vapid — return public VAPID key for frontend
export const onRequestGet = async (context) => {
  const pub = context.env.VAPID_PUBLIC_KEY || "";
  if (!pub) return new Response(JSON.stringify({ error: "vapid not configured" }), { status: 503, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ publicKey: pub }), {
    status: 200,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" }
  });
};
