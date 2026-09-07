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

// Real road-network routing via OSRM's public demo server — genuine
// driving distance/time along actual roads, rather than straight-line
// distance divided by a flat assumed speed. This is what makes the ETA a
// true prediction rather than a rough guess: it accounts for the real
// road layout (including a stop like the school driveway loop), even
// though it still doesn't know about live traffic conditions.
//
// The demo server is free and requires no API key, but its usage policy
// asks for no more than ~1 request/second and offers no uptime guarantee
// — reasonable for a handful of personal requests every 20s, so callers
// of this function should be sequenced with a small delay between them
// rather than fired all at once.
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

export default function Home() {
  const [direction, setDirection] = useState<Direction>("stratford");
  const [data, setData] = useState<BusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [routedEtas, setRoutedEtas] = useState<Record<string, RoutedEta | null>>({});

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

  const stops = direction === "stratford" ? STOPS_STRATFORD : STOPS_SOLIHULL;

  const filteredBuses =
    data?.vehicles?.filter((v) =>
      direction === "stratford" ? v.towardsStratford : v.towardsSolihull
    ) || [];

  const stopCards = stops.map((stop) => {
    // For every candidate vehicle, work out both its straight-line
    // distance to this stop and — where a bearing was reported — whether
    // it's actually heading toward the stop or away from it.
    const candidates = filteredBuses.map((v) => {
      const distKm = haversineKm(stop.lat, stop.lon, v.lat, v.lon);
      const distanceMiles = kmToMiles(distKm);
      let approaching: boolean | null = null; // null = heading unknown
      if (v.bearing != null) {
        const toStop = bearingTo(v.lat, v.lon, stop.lat, stop.lon);
        approaching = angleDiff(v.bearing, toStop) <= 90;
      }
      return { v, distanceMiles, approaching };
    });

    // Prefer the nearest vehicle that's approaching (or has unknown
    // heading). Only fall through to a clearly-departing vehicle so we can
    // say it's just gone, rather than showing nothing at all.
    const inbound = candidates
      .filter((c) => c.approaching !== false)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
    const departing = candidates
      .filter((c) => c.approaching === false)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);

    const best = inbound[0] || null;
    const justPassed = !best && departing[0] ? departing[0] : null;

    // Straight-line estimate — always available instantly, used as the
    // fallback while a real routed ETA is being fetched (or if it fails).
    const straightLineMinutes = best ? estimateMinutes(best.distanceMiles) : null;

    const routed = best ? routedEtas[stop.id] : undefined;

    return {
      stop,
      nearest: best?.v || null,
      distanceMiles: routed ? routed.miles : best ? best.distanceMiles : null,
      minutes: routed ? routed.minutes : straightLineMinutes,
      isRouted: !!routed,
      justPassedMiles: justPassed ? justPassed.distanceMiles : null,
    };
  });

  // After each poll, refine the straight-line estimates into real
  // road-routed ETAs for whichever vehicle is actually approaching each
  // stop in the current direction. Sequenced with a short gap between
  // requests to stay well within OSRM's public demo server's fair-use
  // guidance, rather than firing all four at once.
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

        const candidates = currentBuses.map((v) => {
          const distanceMiles = kmToMiles(haversineKm(stop.lat, stop.lon, v.lat, v.lon));
          let approaching: boolean | null = null;
          if (v.bearing != null) {
            const toStop = bearingTo(v.lat, v.lon, stop.lat, stop.lon);
            approaching = angleDiff(v.bearing, toStop) <= 90;
          }
          return { v, distanceMiles, approaching };
        });
        const best = candidates
          .filter((c) => c.approaching !== false)
          .sort((a, b) => a.distanceMiles - b.distanceMiles)[0];

        if (!best) continue; // nothing to route — no live vehicle for this stop right now

        const eta = await fetchDrivingEta(best.v.lat, best.v.lon, stop.lat, stop.lon);
        if (!cancelled) {
          setRoutedEtas((prev) => ({ ...prev, [stop.id]: eta }));
        }
        await sleep(350); // stay comfortably under ~1 req/sec across the batch
      }
    }

    if (data?.vehicles?.length) refineEtas();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, direction]);

  const now = new Date();
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
        {stopCards.map(({ stop, nearest, distanceMiles, minutes, isRouted, justPassedMiles }) => (
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
              <div className="mb-3">
                <p className="text-2xl font-bold text-emerald-400">
                  {minutes <= 1 ? "Due" : `${minutes} min`}
                </p>
                <p className="text-xs text-slate-400">
                  {distanceMiles!.toFixed(1)} miles away
                  {isRouted ? (
                    <span className="text-emerald-500/80"> · road-routed</span>
                  ) : (
                    <span className="text-slate-500"> · straight-line estimate</span>
                  )}
                </p>
              </div>
            ) : justPassedMiles !== null ? (
              <div className="mb-3">
                <p className="text-lg font-semibold text-slate-400">
                  Just passed
                </p>
                <p className="text-xs text-slate-500">
                  Nearest bus ({justPassedMiles.toFixed(1)} mi away) is heading away from this stop
                </p>
              </div>
            ) : (
              <p className="text-slate-500 text-sm mb-3">
                No bus nearby
              </p>
            )}

            {stop.keyTimes && (
              <div className="border-t border-slate-700 pt-2 mt-1">
                {stop.keyTimes.map((t) => (
                  <div key={t} className="flex justify-between text-sm text-slate-300">
                    <span>{t}</span>
                    <span className="text-amber-400/90 text-xs font-medium">
                      SCHEDULED
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      <p className="text-center text-xs text-slate-600 mt-8">
        Data from UK Bus Open Data Service · Routing via OSRM · Refreshes every 20s
      </p>
    </main>
  );
}
