"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { STOPS_STRATFORD, STOPS_SOLIHULL, Direction } from "@/lib/stops";

const BusMap = dynamic(() => import("@/components/BusMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-52 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-sm mb-5">
      Loading map…
    </div>
  ),
});

interface Vehicle {
  id: string;
  lat: number;
  lon: number;
  bearing?: number;
  line: string;
  destination?: string;
  recordedAt?: string;
  towardsStratford?: boolean;
  towardsSolihull?: boolean;
}

interface BusData {
  updated: string;
  vehicles: Vehicle[];
  error?: string;
  detail?: string;
  count?: number;
}

interface RoutedEta {
  minutes: number;
  miles: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function kmToMiles(km: number) {
  return km / 1.60934;
}

function estimateMinutes(distanceMiles: number) {
  const speedMph = 11;
  return Math.max(0, Math.round((distanceMiles / speedMph) * 60));
}

// Initial compass bearing (0-360°) travelling from point 1 to point 2.
// Used to check whether a vehicle's reported heading actually points
// toward a stop, or away from it — a bus that has looped through a school
// driveway and is heading back onto the main road can be very close to a
// stop while moving away from it, which straight-line distance alone
// can't distinguish.
function bearingTo(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angleDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// When a vehicle doesn't report a bearing, we can't directly tell whether
// it's heading toward a given stop or away from it. As a fallback, this
// estimates the vehicle's rough position along the route by finding which
// stop (in order) it's currently closest to — a vehicle sitting nearest to
// stop 3 has almost certainly already passed stops 1 and 2, regardless of
// straight-line distance to them. Without this, a single no-bearing
// vehicle near the end of the route can appear to be "approaching" every
// earlier stop simultaneously, purely because it's geometrically closer
// to some of them than others.
function estimateRouteOrder(
  v: { lat: number; lon: number },
  stopsInDirection: { lat: number; lon: number; order: number }[]
): number {
  let bestOrder = stopsInDirection[0]?.order ?? 0;
  let bestDist = Infinity;
  for (const s of stopsInDirection) {
    const d = haversineKm(s.lat, s.lon, v.lat, v.lon);
    if (d < bestDist) {
      bestDist = d;
      bestOrder = s.order;
    }
  }
  return bestOrder;
}

// Real road-network routing via OSRM's public demo server — genuine
// driving distance/time along actual roads, rather than straight-line
// distance divided by a flat assumed speed. Free, no API key, but its
// fair-use guidance asks for roughly 1 request/second or fewer, so calls
// are sequenced with a short gap rather than fired all at once.
async function fetchDrivingEta(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<RoutedEta | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const route = json?.routes?.[0];
    if (!route || typeof route.duration !== "number") return null;
    return {
      minutes: Math.max(0, Math.round(route.duration / 60)),
      miles: route.distance ? kmToMiles(route.distance / 1000) : 0,
    };
  } catch {
    return null; // routing is a refinement, not a requirement — fall back silently
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Parses a "HH:MM"-style schedule string into a Date for today. Returns
// null for anything that isn't a plain clock time (e.g. "hourly, on the
// hour" is deliberately left as non-comparable rather than guessed at).
function parseTimeToday(hhmm: string, reference: Date): Date | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(reference);
  d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  return d;
}

// Of a stop's published times, picks whichever is closest to right now —
// that's the specific working the live bus is presumably trying to serve,
// whether it's running early or late against it.
function nearestScheduledTime(keyTimes: string[] | undefined, now: Date): Date | null {
  if (!keyTimes || keyTimes.length === 0) return null;
  let best: Date | null = null;
  let bestDiff = Infinity;
  for (const t of keyTimes) {
    const d = parseTimeToday(t, now);
    if (!d) continue;
    const diff = Math.abs(d.getTime() - now.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = d;
    }
  }
  return best;
}

// A plain "in Xh Ym" / "Xh Ym ago" relative to right now — makes it clear
// at a glance whether a scheduled time is coming up soon or is hours away
// (or already gone), rather than every SCHEDULED entry looking equally
// relevant regardless of how far off it actually is.
function formatRelative(scheduled: Date, now: Date): string {
  const diffMin = Math.round((scheduled.getTime() - now.getTime()) / 60000);
  if (Math.abs(diffMin) < 1) return "now";
  const abs = Math.abs(diffMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const span = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return diffMin > 0 ? `in ${span}` : `${span} ago`;
}

function formatDelay(
  predicted: Date,
  scheduled: Date
): { text: string; tone: "late" | "early" | "onTime" } {
  const diffMin = Math.round((predicted.getTime() - scheduled.getTime()) / 60000);
  if (diffMin >= 2) return { text: `Running ${diffMin} min late`, tone: "late" };
  if (diffMin <= -2) return { text: `${Math.abs(diffMin)} min early`, tone: "early" };
  return { text: "On time", tone: "onTime" };
}

// A position is only treated as "live" if it was reported reasonably
// recently. Without this, a stale last-known GPS fix from hours earlier
// (e.g. after service has finished for the day) gets shown as an active
// bus with a live countdown — technically derived from real data, but
// meaningless. 5 minutes is a judgement call, not a documented BODS
// standard, and can be tightened or loosened based on how the feed
// actually behaves in practice.
const MAX_POSITION_AGE_SEC = 300;

// Comparing a live position against a scheduled time that isn't even
// close to "now" produces a technically-correct but nonsensical result
// (e.g. "Running 377 min late" at 9:30pm against a 15:30 schedule that
// finished hours ago). Only show a delay comparison when the scheduled
// time is within this window of right now.
const MAX_SCHEDULE_COMPARISON_MIN = 90;

// How old the bus's last reported position is. A large age can mean the
// bus's AVL unit has stopped reporting (signal loss, hardware issue, or
// the vehicle has gone off-duty) rather than that it's genuinely
// stationary — worth flagging rather than presenting a possibly-dead
// position as current.
function formatAge(recordedAt: string | undefined, now: Date): { text: string; stale: boolean } | null {
  if (!recordedAt) return null;
  const t = new Date(recordedAt).getTime();
  if (Number.isNaN(t)) return null;
  const ageSec = Math.max(0, Math.round((now.getTime() - t) / 1000));
  const stale = ageSec > 90;
  const text = ageSec < 60 ? `${ageSec}s ago` : `${Math.round(ageSec / 60)}m ago`;
  return { text, stale };
}

export default function Home() {
  const [direction, setDirection] = useState<Direction>("stratford");
  const [data, setData] = useState<BusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [routedEtas, setRoutedEtas] = useState<Record<string, RoutedEta | null>>({});
  const [now, setNow] = useState(new Date());
  const [expandedStops, setExpandedStops] = useState<Record<string, boolean>>({});

  function toggleDetails(stopId: string) {
    setExpandedStops((prev) => ({ ...prev, [stopId]: !prev[stopId] }));
  }

  async function load() {
    try {
      const res = await fetch("/api/buses", { cache: "no-store" });
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (e) {
      setData({ updated: "", vehicles: [], error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

  // Ticks once a second so "Xs ago" / delay-vs-schedule stay live between
  // polls, not just refresh every 20s alongside the data itself.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const stops = direction === "stratford" ? STOPS_STRATFORD : STOPS_SOLIHULL;

  const filteredBuses =
    data?.vehicles?.filter((v) =>
      direction === "stratford" ? v.towardsStratford : v.towardsSolihull
    ) || [];

  const stopCards = stops.map((stop) => {
    // For every candidate vehicle, work out its distance, whether it's
    // heading toward the stop or away, and how old its reported position
    // is. Stale positions (the bus hasn't reported in a while — often
    // because service has ended, or it's gone out of signal) are dropped
    // entirely rather than shown as a misleadingly "live" countdown.
    const candidates = filteredBuses
      .map((v) => {
        const distKm = haversineKm(stop.lat, stop.lon, v.lat, v.lon);
        const distanceMiles = kmToMiles(distKm);
        let approaching: boolean | null = null; // null = heading unknown
        if (v.bearing != null) {
          const toStop = bearingTo(v.lat, v.lon, stop.lat, stop.lon);
          approaching = angleDiff(v.bearing, toStop) <= 90;
        } else {
          // No bearing reported — fall back to route order: only treat
          // this stop as still-ahead if the vehicle's estimated position
          // along the route hasn't already reached (or passed) it.
          const vehicleOrder = estimateRouteOrder(v, stops);
          approaching = stop.order >= vehicleOrder;
        }
        const ageSec = v.recordedAt
          ? Math.round((now.getTime() - new Date(v.recordedAt).getTime()) / 1000)
          : null;
        return { v, distanceMiles, approaching, ageSec };
      })
      .filter((c) => c.ageSec === null || c.ageSec <= MAX_POSITION_AGE_SEC);

    const inbound = candidates
      .filter((c) => c.approaching !== false)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
    const departing = candidates
      .filter((c) => c.approaching === false)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);

    const best = inbound[0] || null;
    const justPassed = !best && departing[0] ? departing[0] : null;

    // When neither of the above applies, work out *why* — so "2 buses
    // detected but nothing shown" is diagnosable instead of a mystery.
    // This looks at the single nearest candidate overall, even ones that
    // got excluded, purely to explain the exclusion.
    let noMatchReason: string | null = null;
    if (!best && !justPassed) {
      const allCandidates = filteredBuses.map((v) => ({
        v,
        distanceMiles: kmToMiles(haversineKm(stop.lat, stop.lon, v.lat, v.lon)),
        ageSec: v.recordedAt
          ? Math.round((now.getTime() - new Date(v.recordedAt).getTime()) / 1000)
          : null,
      }));
      const closest = allCandidates.sort((a, b) => a.distanceMiles - b.distanceMiles)[0];
      if (closest) {
        if (closest.ageSec !== null && closest.ageSec > MAX_POSITION_AGE_SEC) {
          noMatchReason = `Nearest bus on this line (#${closest.v.id}) was last seen ${Math.round(
            closest.ageSec / 60
          )}m ago — too stale to treat as live.`;
        } else {
          noMatchReason = `Nearest bus on this line (#${closest.v.id}, ${closest.distanceMiles.toFixed(
            1
          )} mi away) doesn't appear to be on its way to this stop — likely the regular commercial X20 rather than this school working.`;
        }
      }
    }

    const straightLineMinutes = best ? estimateMinutes(best.distanceMiles) : null;
    const routed = best ? routedEtas[stop.id] : undefined;
    const minutes = routed ? routed.minutes : straightLineMinutes;

    const predictedArrival = best && minutes !== null ? new Date(now.getTime() + minutes * 60000) : null;
    const scheduledTarget = nearestScheduledTime(stop.keyTimes, now);
    const scheduleIsCurrentlyPlausible =
      scheduledTarget !== null &&
      Math.abs(scheduledTarget.getTime() - now.getTime()) <= MAX_SCHEDULE_COMPARISON_MIN * 60000;
    const delay =
      predictedArrival && scheduledTarget && scheduleIsCurrentlyPlausible
        ? formatDelay(predictedArrival, scheduledTarget)
        : null;
    const age = best ? formatAge(best.v.recordedAt, now) : null;

    return {
      stop,
      nearest: best?.v || null,
      distanceMiles: routed ? routed.miles : best ? best.distanceMiles : null,
      minutes,
      isRouted: !!routed,
      justPassedMiles: justPassed ? justPassed.distanceMiles : null,
      delay,
      age,
      noMatchReason,
    };
  });

  // After each poll, refine the straight-line estimates into real
  // road-routed ETAs for whichever vehicle is actually approaching each
  // stop in the current direction.
  useEffect(() => {
    let cancelled = false;

    async function refineEtas() {
      const currentStops = direction === "stratford" ? STOPS_STRATFORD : STOPS_SOLIHULL;
      const currentBuses =
        data?.vehicles?.filter((v) =>
          direction === "stratford" ? v.towardsStratford : v.towardsSolihull
        ) || [];

      for (const stop of currentStops) {
        if (cancelled) return;

        const candidates = currentBuses
          .map((v) => {
            const distanceMiles = kmToMiles(haversineKm(stop.lat, stop.lon, v.lat, v.lon));
            let approaching: boolean | null = null;
            if (v.bearing != null) {
              const toStop = bearingTo(v.lat, v.lon, stop.lat, stop.lon);
              approaching = angleDiff(v.bearing, toStop) <= 90;
            } else {
              const vehicleOrder = estimateRouteOrder(v, currentStops);
              approaching = stop.order >= vehicleOrder;
            }
            const ageSec = v.recordedAt
              ? Math.round((Date.now() - new Date(v.recordedAt).getTime()) / 1000)
              : null;
            return { v, distanceMiles, approaching, ageSec };
          })
          .filter((c) => c.ageSec === null || c.ageSec <= MAX_POSITION_AGE_SEC);

        const best = candidates
          .filter((c) => c.approaching !== false)
          .sort((a, b) => a.distanceMiles - b.distanceMiles)[0];

        if (!best) continue;

        const eta = await fetchDrivingEta(best.v.lat, best.v.lon, stop.lat, stop.lon);
        if (!cancelled) {
          setRoutedEtas((prev) => ({ ...prev, [stop.id]: eta }));
        }
        await sleep(350);
      }
    }

    if (data?.vehicles?.length) refineEtas();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, direction]);

  const hour = now.getHours();
  const minute = now.getMinutes();
  const isSchoolWindowHome = direction === "stratford" && (hour === 15 || (hour === 14 && minute >= 40));
  const isSchoolWindowToSchool = direction === "solihull" && hour === 7;

  return (
    <main className="min-h-dvh px-4 py-6 max-w-lg mx-auto">
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🚌</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">X20 Tracker</h1>
            <p className="text-sm text-slate-400">
              {direction === "stratford"
                ? "Towards Stratford · School run home"
                : "Towards Solihull · To school"}
            </p>
          </div>
        </div>
        {lastRefresh && (
          <p className="text-xs text-slate-500 mt-2">
            Updated {lastRefresh.toLocaleTimeString()}
            {filteredBuses.length > 0 && (
              <span className="ml-2 text-emerald-500">
                · {filteredBuses.length} bus{filteredBuses.length !== 1 ? "es" : ""}
              </span>
            )}
          </p>
        )}
      </header>

      {/* Direction Toggle */}
      <div className="flex rounded-xl bg-slate-800 border border-slate-700 p-1 mb-5">
        <button
          onClick={() => setDirection("stratford")}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
            direction === "stratford"
              ? "bg-sky-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Towards Stratford
        </button>
        <button
          onClick={() => setDirection("solihull")}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
            direction === "solihull"
              ? "bg-sky-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Towards Solihull
        </button>
      </div>

      {/* Live Map */}
      {!loading && !data?.error && (
        <BusMap vehicles={filteredBuses} direction={direction} />
      )}

      {isSchoolWindowHome && (
        <div className="mb-5 rounded-xl bg-amber-500/15 border border-amber-500/30 px-4 py-3 text-amber-200 text-sm">
          <strong>School run window</strong> — watching for the 15:30 from Henley High School
        </div>
      )}

      {isSchoolWindowToSchool && (
        <div className="mb-5 rounded-xl bg-amber-500/15 border border-amber-500/30 px-4 py-3 text-amber-200 text-sm">
          <strong>Morning window</strong> — buses towards school
        </div>
      )}

      {loading && (
        <p className="text-slate-400 text-center py-12">Loading live buses…</p>
      )}

      {data?.error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-red-300 text-sm mb-4">
          {data.error}
          {data.detail && <p className="mt-1 text-xs opacity-80">{data.detail}</p>}
        </div>
      )}

      {!loading && !data?.error && filteredBuses.length === 0 && (
        <div className="mb-5 rounded-xl bg-slate-800 border border-slate-600 px-4 py-3 text-slate-300 text-sm">
          No X20 buses currently heading{" "}
          {direction === "stratford" ? "towards Stratford" : "towards Solihull"}.
        </div>
      )}

      <div className="space-y-3">
        {stopCards.map(({ stop, nearest, distanceMiles, minutes, isRouted, justPassedMiles, delay, age, noMatchReason }) => {
          const isExpanded = !!expandedStops[stop.id];
          // Live cards get distance/routing/vehicle details; "No bus
          // nearby" cards get a "Why?" explanation when we have one —
          // either way, there's something worth being able to expand.
          const hasDetails = !!nearest || !!noMatchReason;
          return (
            <article
              key={stop.id}
              className="rounded-2xl bg-slate-800/80 border border-slate-700 p-4"
            >
              <div className="flex justify-between items-start mb-2">
                <h2 className="font-semibold text-base leading-tight">
                  {stop.shortName}
                </h2>
                {nearest && (
                  <span className="text-[10px] font-medium bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                    LIVE
                  </span>
                )}
                {!nearest && justPassedMiles !== null && (
                  <span className="text-[10px] font-medium bg-slate-500/20 text-slate-400 px-2 py-0.5 rounded-full">
                    PASSED
                  </span>
                )}
              </div>

              {nearest && minutes !== null ? (
                <div className="mb-2">
                  <p className="text-3xl font-bold text-emerald-400">
                    {minutes <= 1 ? "Due" : `${minutes} min`}
                  </p>

                  {/* Kept prominent, not hidden behind Details — this is the
                      one thing that's genuinely new versus a paper timetable,
                      given the whole point is that this bus runs late. */}
                  {delay && (
                    <p
                      className={`text-sm font-medium mt-0.5 ${
                        delay.tone === "late"
                          ? "text-red-400"
                          : delay.tone === "early"
                          ? "text-sky-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {delay.text} vs schedule
                    </p>
                  )}
                </div>
              ) : justPassedMiles !== null ? (
                <div className="mb-2">
                  <p className="text-lg font-semibold text-slate-400">
                    Just passed
                  </p>
                </div>
              ) : (
                <p className="text-slate-500 text-sm mb-2">
                  No bus nearby
                </p>
              )}

              {hasDetails && (
                <button
                  onClick={() => toggleDetails(stop.id)}
                  className="text-[11px] text-slate-500 hover:text-slate-300 transition mb-1"
                >
                  {isExpanded ? "Hide details ▾" : nearest ? "Details ▸" : "Why? ▸"}
                </button>
              )}

              {hasDetails && isExpanded && (
                <div className="text-[11px] text-slate-500 space-y-0.5 mb-2 pl-0.5">
                  {nearest ? (
                    <>
                      <p>
                        {distanceMiles!.toFixed(1)} miles away
                        {isRouted ? (
                          <span className="text-emerald-500/70"> · road-routed</span>
                        ) : (
                          <span> · straight-line estimate</span>
                        )}
                      </p>
                      {age && (
                        <p className={age.stale ? "text-amber-400" : ""}>
                          {age.stale ? "⚠ " : ""}Position from {age.text}
                          {age.stale ? " — may be out of date" : ""}
                        </p>
                      )}
                      {nearest.id && <p>Vehicle #{nearest.id}</p>}
                    </>
                  ) : (
                    noMatchReason && <p>{noMatchReason}</p>
                  )}
                </div>
              )}

              {stop.keyTimes && (
                <div className="border-t border-slate-700 pt-2 mt-1">
                  {stop.keyTimes.map((t) => {
                    const scheduledDate = parseTimeToday(t, now);
                    const relative = scheduledDate ? formatRelative(scheduledDate, now) : null;
                    const imminent =
                      scheduledDate !== null &&
                      Math.abs(scheduledDate.getTime() - now.getTime()) <= MAX_SCHEDULE_COMPARISON_MIN * 60000;
                    return (
                      <div
                        key={t}
                        className={`flex justify-between text-sm ${imminent ? "text-slate-200" : "text-slate-500"}`}
                      >
                        <span>
                          {t}
                          {relative && (
                            <span className={imminent ? "text-slate-400" : "text-slate-600"}> · {relative}</span>
                          )}
                        </span>
                        <span
                          className={`text-xs font-medium ${imminent ? "text-amber-400/90" : "text-slate-600"}`}
                        >
                          SCHEDULED
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-600 mt-8">
        Data from UK Bus Open Data Service · Routing via OSRM · Refreshes every 20s
      </p>
    </main>
  );
}
