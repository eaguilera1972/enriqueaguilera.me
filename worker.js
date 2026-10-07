const VISITOR_COOKIE = "fav_visitor";
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Keep in sync with the data-fav ids in favorites.html.
const VALID_ITEMS = new Set([
  "dumb-and-dumber",
  "the-office",
  "alfred",
  "obsidian",
  "granola",
  "superhuman",
  "barcelona",
  "boston",
  "michael-jackson",
  "george-michael",
  "fc-barcelona",
  "messi",
]);

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init && init.headers),
    },
  });
}

async function getAllCounts(db) {
  const { results } = await db
    .prepare(
      "SELECT item_id, SUM(vote = 'up') AS up, SUM(vote = 'down') AS down FROM votes GROUP BY item_id"
    )
    .all();
  const counts = {};
  for (const row of results) {
    counts[row.item_id] = { up: row.up || 0, down: row.down || 0 };
  }
  return counts;
}

async function getItemCount(db, itemId) {
  const row = await db
    .prepare(
      "SELECT SUM(vote = 'up') AS up, SUM(vote = 'down') AS down FROM votes WHERE item_id = ?"
    )
    .bind(itemId)
    .first();
  return { up: (row && row.up) || 0, down: (row && row.down) || 0 };
}

async function getMyVotes(db, visitorId) {
  if (!visitorId) return {};
  const { results } = await db
    .prepare("SELECT item_id, vote FROM votes WHERE visitor_id = ?")
    .bind(visitorId)
    .all();
  const mine = {};
  for (const row of results) mine[row.item_id] = row.vote;
  return mine;
}

async function handleGet(request, env) {
  const visitorId = getCookie(request, VISITOR_COOKIE);
  const [counts, mine] = await Promise.all([
    getAllCounts(env.DB),
    getMyVotes(env.DB, visitorId),
  ]);
  return json({ counts, mine });
}

async function handlePost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const itemId = typeof body.item === "string" ? body.item : "";
  const vote = body.vote;

  if (!VALID_ITEMS.has(itemId)) {
    return json({ error: "Unknown item" }, { status: 400 });
  }
  if (vote !== "up" && vote !== "down" && vote !== null) {
    return json({ error: "vote must be 'up', 'down', or null" }, { status: 400 });
  }

  let visitorId = getCookie(request, VISITOR_COOKIE);
  const isNewVisitor = !visitorId;
  if (isNewVisitor) visitorId = crypto.randomUUID();

  const now = Date.now();

  if (vote === null) {
    await env.DB.prepare("DELETE FROM votes WHERE item_id = ? AND visitor_id = ?")
      .bind(itemId, visitorId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO votes (item_id, visitor_id, vote, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, visitor_id)
       DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at`
    )
      .bind(itemId, visitorId, vote, now, now)
      .run();
  }

  const counts = await getItemCount(env.DB, itemId);
  const headers = {};
  if (isNewVisitor) {
    headers["Set-Cookie"] =
      `${VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=${VISITOR_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
  }
  return json({ item: itemId, vote, counts }, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/votes") {
      if (request.method === "GET") return handleGet(request, env);
      if (request.method === "POST") return handlePost(request, env);
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    return env.ASSETS.fetch(request);
  },
};
