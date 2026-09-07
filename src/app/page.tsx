"use client";

import { useEffect, useState } from "react";
import { STOPS } from "@/lib/stops";

interface Vehicle {
  id: string;
  lat: number;
  lon: number;
  bearing?: number;
  line: string;
  destination?: string;
  recordedAt?: string;
  towardsStratford?: boolean;
}

interface BusData {
  updated: string;
  vehicles: Vehicle[];
  error?: string;
  detail?: string;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
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

function estimateMinutes(distanceKm: number) {
  const speed = 18; // slightly more realistic average
  return Math.max(0, Math.round((distanceKm / speed) * 60));
}

export default function Home() {
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

  const stopCards = STOPS.map((stop) => {
    let nearest: Vehicle | null = null;
    let nearestDist = Infinity;

    if (data?.vehicles?.length) {
      // First try only vehicles going towards Stratford
      const towards = data.vehicles.filter((v) => v.towardsStratford);

      const pool = towards.length > 0 ? towards : data.vehicles;

      for (const v of pool) {
        const d = haversine(stop.lat, stop.lon, v.lat, v.lon);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = v;
        }
      }
    }

    const mins = nearest ? estimateMinutes(nearestDist) : null;

    return {
      stop,
      nearest,
      distanceKm: nearest ? nearestDist : null,
      minutes: mins,
    };
  });

  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const isSchoolWindow = (hour === 15) || (hour === 14 && minute >= 40);

  return (
    <main className="min-h-dvh px-4 py-6 max-w-lg mx-auto">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🚌</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">X20 Tracker</h1>
            <p className="text-sm text-slate-400">
              Towards Stratford · School run focus
            </p>
          </div>
        </div>
        {lastRefresh && (
          <p className="text-xs text-slate-500 mt-2">
            Updated {lastRefresh.toLocaleTimeString()}
          </p>
        )}
      </header>

      {isSchoolWindow && (
        <div className="mb-5 rounded-xl bg-amber-500/15 border border-amber-500/30 px-4 py-3 text-amber-200 text-sm">
          <strong>School run window</strong> — watching for the 15:30 from Henley High School
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

      <div className="space-y-3">
        {stopCards.map(({ stop, nearest, distanceKm, minutes }) => (
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
                  {distanceKm!.toFixed(1)} km away
                  {nearest.destination ? ` · ${nearest.destination}` : ""}
                </p>
              </div>
            ) : (
              <p className="text-slate-500 text-sm mb-3">No live bus nearby</p>
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
