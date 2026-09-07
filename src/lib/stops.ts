// Official stops we care about for the X20 (towards Stratford)

export interface Stop {
  id: string;
  name: string;
  shortName: string;
  lat: number;
  lon: number;
  order: number;
  keyTimes?: string[];
}

export const STOPS: Stop[] = [
  {
    id: "henley-high-school",
    name: "Henley High School",
    shortName: "Henley High School",
    lat: 52.2915,
    lon: -1.7780,
    order: 1,
    keyTimes: ["15:30"],
  },
  {
    id: "bearley-oak-tree",
    name: "Bearley, Oak Tree Close",
    shortName: "Bearley Oak Tree Close",
    lat: 52.2440,
    lon: -1.7500,
    order: 2,
    keyTimes: ["15:40"],
  },
  {
    id: "stratford-maybird",
    name: "Stratford, Maybird Centre",
    shortName: "Maybird Centre",
    lat: 52.1985,
    lon: -1.7160,
    order: 3,
    keyTimes: ["15:56"],
  },
  {
    id: "stratford-natwest",
    name: "Stratford, NatWest Bank",
    shortName: "NatWest Bank Stratford",
    lat: 52.1920,
    lon: -1.7065,
    order: 4,
    keyTimes: ["16:03"],
  },
];

// Bounding box covering the X20 route (Solihull → Stratford)
export const ROUTE_BBOX = {
  minLon: -1.85,
  minLat: 52.18,
  maxLon: -1.65,
  maxLat: 52.42,
};
