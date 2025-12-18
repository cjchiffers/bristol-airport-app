// ---------- Refresh (optional / best-effort) ----------
async function refreshNow(forceFeedback) {
  if (!state.context || !state.current) return;

  const apiKey = getFlightApiKey();
  if (!apiKey) return;

  try {
    // Fetching the flight details from Cloudflare Worker
    const updated = await fetchBestEffortUpdate(state.context, state.current);
    if (!updated) return;

    const prev = state.current;
    state.current = updated;

    if (state.storageKey) {
      safeSetSession(state.storageKey, JSON.stringify({ flight: state.current, context: state.context }));
    }

    render(state.current, prev);
    if (forceFeedback) flashStatus("good", "Updated");
  } catch (e) {
    console.error(e);
    if (forceFeedback) flashStatus("bad", "Refresh failed");
  }
}

async function fetchBestEffortUpdate(context, current) {
  const mode = context.mode || "departures";
  const airport = context.airport || "BRS";
  const day = context.day || 1;

  // Fetch flight data from Cloudflare Worker (this is the Worker URL you set)
  const url = new URL(`https://proud-bonus-5b54.cjchiffers.workers.dev/api/timetable`);
  url.searchParams.set("iataCode", airport);
  url.searchParams.set("type", mode);
  url.searchParams.set("day", String(day));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return null;

  const data = await res.json();

  // Process and return the data here (same as before)
  const list =
    (Array.isArray(data) && data) ||
    (data && Array.isArray(data.data) && data.data) ||
    (data && Array.isArray(data.result) && data.result) ||
    null;

  if (!list) return null;

  const curId = deriveIdentity(current);

  let best = null;
  let bestScore = -1;
  for (const f of list) {
    const candId = deriveIdentity(f);
    const score = scoreMatch(curId, candId);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  if (bestScore < 3) return null;
  return best;
}
