// GET /api/rank?v=123456 — where would this value land on /top?
// Reads the top-100 board index (single KV read). Bonnie Blue is pinned at
// rank 1 on /top, so the best possible human rank is #2 — nobody dethrones her.

const SEED_COUNT = 1;

export const onRequestGet = async ({ env, request }) => {
  const url = new URL(request.url);
  const v = Math.round(Number(url.searchParams.get("v")));
  if (!isFinite(v) || v <= 0) {
    return new Response(JSON.stringify({ error: "bad v" }), {
      status: 400,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  let board = [];
  try {
    const raw = await env.DAHEJ_KV.get("a:board", "json");
    if (Array.isArray(raw)) board = raw;
  } catch (_) {}

  let higher = 0;
  for (const e of board) if ((e.v || 0) > v) higher++;

  return new Response(
    JSON.stringify({ rank: SEED_COUNT + higher + 1, total: board.length + SEED_COUNT }),
    {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=60", "access-control-allow-origin": "*" },
    }
  );
};
