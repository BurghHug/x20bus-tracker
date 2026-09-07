// Stops for both directions of the X20

export interface Stop {
  id: string;
  name: string;
  shortName: string;
  lat: number;
  lon: number;
  order: number;
  keyTimes?: string[];
}

export type Direction = "stratford" | "solihull";

// Afternoon / home – towards Stratford
export const STOPS_STRATFORD: Stop[] = [
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

// Morning / to school – towards Solihull
export const STOPS_SOLIHULL: Stop[] = [
  {
    id: "natwest-bank",
    name: "Stratford, NatWest Bank",
    shortName: "NatWest Bank",
    lat: 52.1920,
    lon: -1.7065,
    order: 1,
    keyTimes: ["07:35"],
  },
  {
    id: "mcdonalds",
    name: "Stratford, opp McDonalds",
    shortName: "opp McDonalds",
    lat: 52.1945,
    lon: -1.7100,
    order: 2,
    keyTimes: ["07:37"],
  },
  {
    id: "tesco",
    name: "Stratford, opp Tesco",
    shortName: "opp Tesco",
    lat: 52.1970,
    lon: -1.7140,
    order: 3,
    keyTimes: ["07:42"],
  },
  {
    id: "avenue-farm",
    name: "Stratford, adj Avenue Farm",
    shortName: "adj Avenue Farm",
    lat: 52.2000,
    lon: -1.7180,
    order: 4,
    keyTimes: ["07:43"],
  },
  {
    id: "bearley",
    name: "Bearley",
    shortName: "Bearley",
    lat: 52.2440,
    lon: -1.7500,
    order: 5,
    keyTimes: ["08:00"],
  },
  {
    id: "wootton-wawen",
    name: "Wootton Wawen",
    shortName: "Wootton Wawen",
    lat: 52.2660,
    lon: -1.7750,
    order: 6,
    keyTimes: ["08:06"],
  },
];

export const ROUTE_BBOX = {
  minLon: -1.85,
  minLat: 52.18,
  maxLon: -1.65,
  maxLat: 52.42,
};
