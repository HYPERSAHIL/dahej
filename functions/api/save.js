// POST /api/save — save a calculator state, return a short id
export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => null);
    const inputs = body && body.inputs;
    if (!inputs || typeof inputs !== "object") {
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Whitelist only known keys and coerce to numbers
    const KEYS = ["bodycout", "depthPuh", "widthPuh", "ipill", "unsafe", "talking",
      "situationships", "exbf", "relationships", "age", "oyo", "gooning"];
    const clean = {};
    for (const k of KEYS) {
      const v = Number(inputs[k]);
      clean[k] = isFinite(v) && v >= 0 ? v : 0;
    }

    // Collision-resistant short id (base62, 5 chars)
    const kv = context.env.DAHEJ_KV;
    if (!kv) {
      return new Response(JSON.stringify({ error: "kv binding missing" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    let id = "";
    let attempts = 0;
    let existing = null;
    const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const crypto = globalThis.crypto;
    do {
      const bytes = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      let n = bytes[0];
      id = "";
      for (let i = 0; i < 5; i++) {
        id += ALPHABET[n % 62];
        n = Math.floor(n / 62);
      }
      existing = await kv.get("share:" + id);
      attempts++;
      if (attempts > 10) return new Response(JSON.stringify({ error: "could not allocate id" }), {
        status: 500, headers: { "content-type": "application/json" },
      });
    } while (existing !== null);

    await kv.put("share:" + id, JSON.stringify(clean), {
      expirationTtl: 60 * 60 * 24 * 90, // 90 days
    });

    return new Response(JSON.stringify({ id }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "exception: " + (e && e.message ? e.message : String(e)) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}