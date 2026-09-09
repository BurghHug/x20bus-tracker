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
    const bbox = `${ROUTE_BBOX.minLon},${ROUTE_BBOX.minLat},${ROUTE_BBOX.maxLon},${ROUTE_BBOX.maxLat}`;
    const url = `https://data.bus-data.dft.gov.uk/api/v1/datafeed?boundingBox=${bbox}&api_key=${BODS_KEY}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "X20-Tracker/1.0" },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`BODS responded ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    const xml = await res.text();
    const { vehicles, allLineRefsSeen } = parseVehicles(xml);
    return NextResponse.json({
      updated: new Date().toISOString(),
      count: vehicles.length,
      vehicles,
      // Temporary diagnostic: every distinct line identifier BODS reported
      // within our bounding box, regardless of whether it matched X20/X21.
      // Check this during the real 15:19-15:56 window to confirm the
      // school-run working is actually broadcasting under exactly "X20" or
      // "X21", rather than a slightly different string that our exact-match
      // filter would silently miss.
      allLineRefsSeen,
    });
  } catch (err) {
    console.error("BODS fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch live bus data", detail: String(err) },
      { status: 502 }
    );
  }
}

function parseVehicles(xml: string) {
  const vehicles: Array<{
    id: string;
    lat: number;
    lon: number;
    bearing?: number;
    line: string;
    destination?: string;
    recordedAt?: string;
    towardsStratford: boolean;
    towardsSolihull: boolean;
  }> = [];
  const allLineRefsSeen = new Set<string>();

  const blocks = xml.split("<VehicleActivity>").slice(1);
  for (const block of blocks) {
    const lineMatch =
      block.match(/<LineRef>([^<]+)<\/LineRef>/i) ||
      block.match(/<PublishedLineName>([^<]+)<\/PublishedLineName>/i);
    const line = (lineMatch?.[1] || "").trim();

    if (line) allLineRefsSeen.add(line);

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

    const destination = (destMatch?.[1] || "").trim();
    const destLower = destination.toLowerCase();
    const towardsStratford =
      destLower.includes("stratford") ||
      destLower.includes("maybird") ||
      destLower.includes("wood street") ||
      destLower.includes("natwest") ||
      destLower.includes("bridge street");
    const towardsSolihull =
      destLower.includes("solihull") ||
      destLower.includes("shirley") ||
      destLower.includes("henley");

    vehicles.push({
      id: vehicleRefMatch?.[1] || `${lat},${lon}`,
      lat,
      lon,
      bearing: bearingMatch ? parseFloat(bearingMatch[1]) : undefined,
      line,
      destination,
      recordedAt: recordedMatch?.[1],
      towardsStratford,
      towardsSolihull,
    });
  }

  return { vehicles, allLineRefsSeen: Array.from(allLineRefsSeen).sort() };
}
