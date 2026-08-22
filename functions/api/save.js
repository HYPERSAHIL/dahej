// POST /api/save — save a calculator state, return a short id

// weights mirror index.html + urand/[id].js (kept in sync manually)
const W_BOARD = {
  bodycout: 3, depthPuh: 2.5, widthPuh: 2.5, ipill: 2, unsafe: 4,
  talking: 1.5, situationships: 3, exbf: 5, relationships: 4,
  oyo: 1.2, gooning: 1.5
};

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

    // Optional share-card PNG generated client-side (data URL). Used by
    // /og/:id to give WhatsApp/Telegram/etc. an image preview.
    let ogData = "";
    if (typeof body.og === "string" && body.og.startsWith("data:image/png;base64,")) {
      // ~300 KB decoded ceiling; flat-color cards land well under this.
      if (body.og.length <= 400000) ogData = body.og;
    }

    // Collision-resistant short id (base62, 5 chars)
    const kv = context.env.DAHEJ_KV;
    if (!kv) {
      return new Response(JSON.stringify({ error: "kv binding missing" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    // Light per-IP rate limit (5 saves per fixed 1-minute window) so the KV
    // namespace can't be spammed. Keyed by minute bucket: slow-drip requests
    // can't extend the window the way a reset-on-every-hit TTL could.
    const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
    const salt = context.env.ANALYTICS_SALT || "dahej-default-salt";
    const rlMinute = Math.floor(Date.now() / 60000);
    const hashBuf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":rl:" + ip + ":" + rlMinute));
    const ipHash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    const rlKey = "a:rl:" + ipHash;
    const hits = Number(await kv.get(rlKey)) || 0;
    if (hits >= 5) {
      return new Response(JSON.stringify({ error: "too many requests" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    }
    await kv.put(rlKey, String(hits + 1), { expirationTtl: 120 });

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

    const TTL_YEAR = 60 * 60 * 24 * 365; // resurfaced old chats keep working previews
    await kv.put("share:" + id, JSON.stringify(clean), {
      expirationTtl: TTL_YEAR,
    });
    if (ogData) {
      await kv.put("og:" + id, ogData, {
        expirationTtl: TTL_YEAR,
      });
    }

    // ---------- leaderboard board (best-effort) ----------
    // Keep a top-100 index at a:board so /top reads one key instead of
    // listing + fetching every share. Last-write-wins on concurrent saves:
    // fine for a meme leaderboard.
    try {
      let score = 0;
      for (const k of KEYS) {
        if (k === "age") continue;
        score += clean[k] * W_BOARD[k];
      }
      if (clean.age > 0) score += Math.max(0, clean.age - 22) * 1.4;
      const value = Math.max(50000, Math.round(150000 + score * 18500));
      const entry = { id, v: value, t: new Date().toISOString().slice(0, 10) };
      const boardRaw = await kv.get("a:board", "json");
      const board = Array.isArray(boardRaw) ? boardRaw : [];
      board.push(entry);
      board.sort((a, b) => (b.v || 0) - (a.v || 0));
      await kv.put("a:board", JSON.stringify(board.slice(0, 100)), { expirationTtl: TTL_YEAR });
    } catch (_) {}

    return new Response(JSON.stringify({ id, og: Boolean(ogData) }), {
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