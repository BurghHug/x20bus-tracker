import { NextResponse } from "next/server";
import { ROUTE_BBOX } from "@/lib/stops";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BODS_KEY = process.env.BODS_API_KEY;

export async function GET() {
  if (!BODS_KEY) {
    return NextResponse.json(
      { error: "BODS_API_KEY not configured on server" },
      { status: 500 }
    );
  }

  try {
    // Request live vehicle positions for the area covering the X20
    const bbox = `${ROUTE_BBOX.minLon},${ROUTE_BBOX.minLat},${ROUTE_BBOX.maxLon},${ROUTE_BBOX.maxLat}`;
    const url = `https://data.bus-data.dft.gov.uk/api/v1/datafeed?boundingBox=${bbox}&api_key=${BODS_KEY}`;

    const res = await fetch(url, {
      headers: { Accept: "application/xml" },
      next: { revalidate: 15 }, // cache briefly
    });

    if (!res.ok) {
      throw new Error(`BODS responded ${res.status}`);
    }

    const xml = await res.text();

    // Very lightweight extraction of X20 vehicles
    // (In production you would use a proper XML parser)
    const vehicles = parseX20Vehicles(xml);

    return NextResponse.json({
      updated: new Date().toISOString(),
      vehicles,
      directionFilter: "towards Stratford",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch live bus data", detail: String(err) },
      { status: 502 }
    );
  }
}

function parseX20Vehicles(xml: string) {
  const vehicles: Array<{
    id: string;
    lat: number;
    lon: number;
    bearing?: number;
    line: string;
    destination?: string;
    recordedAt?: string;
  }> = [];

  // Split on VehicleActivity blocks
  const blocks = xml.split("<VehicleActivity>").slice(1);

  for (const block of blocks) {
    const lineMatch = block.match(/<LineRef>([^<]+)<\/LineRef>/i);
    const line = lineMatch?.[1]?.trim() || "";

    // Only keep X20 (and occasional X21 if present)
    if (!/^X20$/i.test(line) && !/^X21$/i.test(line)) continue;

    const latMatch = block.match(/<Latitude>([^<]+)<\/Latitude>/i);
    const lonMatch = block.match(/<Longitude>([^<]+)<\/Longitude>/i);
    const bearingMatch = block.match(/<Bearing>([^<]+)<\/Bearing>/i);
    const destMatch = block.match(/<DestinationName>([^<]+)<\/DestinationName>/i);
    const vehicleRefMatch = block.match(/<VehicleRef>([^<]+)<\/VehicleRef>/i);
    const recordedMatch = block.match(/<RecordedAtTime>([^<]+)<\/RecordedAtTime>/i);

    const lat = parseFloat(latMatch?.[1] || "");
    const lon = parseFloat(lonMatch?.[1] || "");

    if (isNaN(lat) || isNaN(lon)) continue;

    // Heuristic: prefer vehicles whose destination suggests Stratford direction
    const dest = (destMatch?.[1] || "").toLowerCase();
    const towardsStratford =
      dest.includes("stratford") ||
      dest.includes("maybird") ||
      dest.includes("wood street") ||
      dest.includes("henley") === false; // rough

    // For now we keep all X20 and let the frontend decide, but mark direction
    vehicles.push({
      id: vehicleRefMatch?.[1] || `${lat},${lon}`,
      lat,
      lon,
      bearing: bearingMatch ? parseFloat(bearingMatch[1]) : undefined,
      line,
      destination: destMatch?.[1],
      recordedAt: recordedMatch?.[1],
    });
  }

  return vehicles;
}
