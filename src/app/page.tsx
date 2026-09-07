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

export default function Home() {
  const [direction, setDirection] = useState<Direction>("stratford");
  const [data, setData] = useState<BusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

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
    let nearest: Vehicle | null = null;
    let nearestDistMiles = Infinity;

    for (const v of filteredBuses) {
      const distKm = haversineKm(stop.lat, stop.lon, v.lat, v.lon);
      const distMiles = kmToMiles(distKm);
      if (distMiles < nearestDistMiles) {
        nearestDistMiles = distMiles;
        nearest = v;
      }
    }

    const mins = nearest ? estimateMinutes(nearestDistMiles) : null;

    return {
      stop,
      nearest,
      distanceMiles: nearest ? nearestDistMiles : null,
      minutes: mins,
    };
  });

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
        {stopCards.map(({ stop, nearest, distanceMiles, minutes }) => (
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
            </div>

            {nearest && minutes !== null ? (
              <div className="mb-3">
                <p className="text-2xl font-bold text-emerald-400">
                  {minutes <= 1 ? "Due" : `${minutes} min`}
                </p>
                <p className="text-xs text-slate-400">
                  {distanceMiles!.toFixed(1)} miles away
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
        Data from UK Bus Open Data Service · Refreshes every 20s
      </p>
    </main>
  );
}
