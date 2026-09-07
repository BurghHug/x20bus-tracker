"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STOPS } from "@/lib/stops";

interface Vehicle {
  id: string;
  lat: number;
  lon: number;
  destination?: string;
  towardsStratford?: boolean;
}

// Fix default marker icons in Next.js
const busIcon = L.divIcon({
  className: "",
  html: `<div style="
    background:#38bdf8;
    width:18px;height:18px;
    border-radius:50%;
    border:2px solid white;
    box-shadow:0 1px 4px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

interface Props {
  vehicles: Vehicle[];
}

export default function BusMap({ vehicles }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-52 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-sm">
        Loading map…
      </div>
    );
  }

  // Centre roughly on the middle of the route
  const centre: [number, number] = [52.25, -1.74];

  return (
    <div className="w-full h-52 rounded-2xl overflow-hidden border border-slate-700 mb-5">
      <MapContainer
        center={centre}
        zoom={10}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Stops */}
        {STOPS.map((stop) => (
          <CircleMarker
            key={stop.id}
            center={[stop.lat, stop.lon]}
            radius={5}
            pathOptions={{
              color: "#94a3b8",
              fillColor: "#1e293b",
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>{stop.shortName}</Popup>
          </CircleMarker>
        ))}

        {/* Live buses (Stratford-bound only) */}
        {vehicles.map((v) => (
          <Marker key={v.id} position={[v.lat, v.lon]} icon={busIcon}>
            <Popup>
              X20
              {v.destination ? ` → ${v.destination}` : ""}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
