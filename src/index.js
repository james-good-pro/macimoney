/**
 * MaciMoney worker.
 *
 * Serves the static app (public/index.html, via the ASSETS binding) and a
 * tiny JSON API backed by D1 (Cloudflare's managed SQLite) for the
 * "Log a shift" feature. No auth — this is a low-stakes personal app whose
 * link is meant to be opened directly, so the API is intentionally open to
 * anyone who has the URL, same as the page itself.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init && init.headers) },
  });
}

async function handleGetShifts(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, date, cc_tips AS ccTips FROM shifts ORDER BY date ASC, id ASC'
  ).all();
  return json(results);
}

async function handlePostShift(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const date = typeof body.date === 'string' ? body.date.slice(0, 10) : '';
  const ccTips = Number(body.ccTips);

  if (!DATE_RE.test(date)) {
    return json({ error: 'date must be an ISO date string (YYYY-MM-DD).' }, { status: 400 });
  }
  if (!Number.isFinite(ccTips) || ccTips < 0 || ccTips > 100000) {
    return json({ error: 'ccTips must be a non-negative number.' }, { status: 400 });
  }

  const rounded = Math.round(ccTips * 100) / 100;
  const result = await env.DB.prepare('INSERT INTO shifts (date, cc_tips) VALUES (?1, ?2)')
    .bind(date, rounded)
    .run();

  return json({ id: result.meta.last_row_id, date, ccTips: rounded }, { status: 201 });
}

async function handlePutShift(request, env, id) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const date = typeof body.date === 'string' ? body.date.slice(0, 10) : '';
  const ccTips = Number(body.ccTips);

  if (!DATE_RE.test(date)) {
    return json({ error: 'date must be an ISO date string (YYYY-MM-DD).' }, { status: 400 });
  }
  if (!Number.isFinite(ccTips) || ccTips < 0 || ccTips > 100000) {
    return json({ error: 'ccTips must be a non-negative number.' }, { status: 400 });
  }

  const rounded = Math.round(ccTips * 100) / 100;
  const result = await env.DB.prepare('UPDATE shifts SET date = ?1, cc_tips = ?2 WHERE id = ?3')
    .bind(date, rounded, id)
    .run();

  if (!result.meta.changes) {
    return json({ error: 'Shift not found.' }, { status: 404 });
  }

  return json({ id, date, ccTips: rounded });
}

async function handleDeleteShift(env, id) {
  const result = await env.DB.prepare('DELETE FROM shifts WHERE id = ?1').bind(id).run();

  if (!result.meta.changes) {
    return json({ error: 'Shift not found.' }, { status: 404 });
  }

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/shifts') {
      if (request.method === 'GET') return handleGetShifts(env);
      if (request.method === 'POST') return handlePostShift(request, env);
      return json({ error: 'Method not allowed.' }, { status: 405 });
    }

    const shiftMatch = url.pathname.match(/^\/api\/shifts\/(\d+)$/);
    if (shiftMatch) {
      const id = Number(shiftMatch[1]);
      if (request.method === 'PUT') return handlePutShift(request, env, id);
      if (request.method === 'DELETE') return handleDeleteShift(env, id);
      return json({ error: 'Method not allowed.' }, { status: 405 });
    }

    // Everything else (the page, fonts CSS import, etc.) is static assets.
    return env.ASSETS.fetch(request);
  },
};
