// The FULL published stop sequence for the afternoon "school run home"
// journey (Solihull -> Henley -> Stratford), sourced from Stagecoach's own
// live departure board and bustimes.org. This is deliberately the whole
// journey, not just the 4 stops we care about — the point is to work out
// where the bus currently sits *in its real schedule*, which needs the
// full picture, not just our slice of it.
//
// `order` gives each stop's position in the real journey sequence (1-13).
// This is the backbone of the "one consistent position per bus" model:
// every one of our 4 tracked stops is looked up here by id to get its true
// order, so "has this bus passed stop X" is always answered from the same
// single number for a given bus, never independently per stop.
//
// `id` values are matched against stops.ts — "stratford-natwest" here MUST
// match the same id there (both refer to the same physical stop; an
// earlier mismatched name here would have silently broken that matching).
//
// Coordinates: only henley-high-school and bearley-oak-tree are verified
// against a real dropped pin (confirmed earlier in this project). Every
// other coordinate here is a reasonable approximation from general
// knowledge of these place names, NOT independently verified. That's an
// acceptable trade-off for this specific purpose — they're only used to
// judge "which published stop is the bus nearest to right now," where
// being off by a few hundred metres doesn't meaningfully change the
// answer — but it would NOT be good enough for something like a map pin
// someone drives to, the way the two verified stops are used elsewhere.

export interface ScheduleStop {
  id: string;
  order: number;
  label: string;
  lat: number;
  lon: number;
  time: string; // "HH:MM", scheduled time at this stop
  verified: boolean;
}

export const FULL_SCHEDULE_TOWARDS_STRATFORD: ScheduleStop[] = [
  { id: "solihull-town-centre", order: 1, label: "Solihull Town Centre", lat: 52.4128, lon: -1.7787, time: "14:45", verified: false },
  { id: "solihull-station", order: 2, label: "Solihull Station", lat: 52.4110, lon: -1.7820, time: "14:48", verified: false },
  { id: "shirley-longmore-road", order: 3, label: "Shirley, Longmore Road", lat: 52.3898, lon: -1.8215, time: "14:56", verified: false },
  { id: "monkspath-notcutts", order: 4, label: "Monkspath, Notcutts", lat: 52.3843, lon: -1.7676, time: "15:04", verified: false },
  { id: "hockley-heath-wharf", order: 5, label: "Hockley Heath, The Wharf", lat: 52.3459, lon: -1.7885, time: "15:11", verified: false },
  { id: "henley-three-tuns", order: 6, label: "Henley-in-Arden, Three Tuns", lat: 52.2965, lon: -1.7756, time: "15:19", verified: false },
  { id: "henley-high-school", order: 7, label: "Henley High School", lat: 52.286295, lon: -1.776102, time: "15:30", verified: true },
  { id: "wootton-wawen-church", order: 8, label: "Wootton Wawen, Church", lat: 52.2698, lon: -1.7793, time: "15:35", verified: false },
  { id: "bearley-oak-tree", order: 9, label: "Bearley, Oak Tree Close", lat: 52.243609, lon: -1.740660, time: "15:40", verified: true },
  { id: "snitterfield-church", order: 10, label: "Snitterfield, Church Road", lat: 52.2216, lon: -1.7269, time: "15:47", verified: false },
  { id: "stratford-tesco", order: 11, label: "Stratford, adj Tesco", lat: 52.1970, lon: -1.7140, time: "15:54", verified: false },
  { id: "stratford-maybird", order: 12, label: "Stratford, Maybird Centre", lat: 52.1985, lon: -1.7160, time: "15:56", verified: false },
  { id: "stratford-natwest", order: 13, label: "Stratford, Wood Street", lat: 52.1920, lon: -1.7065, time: "16:03", verified: false },
];
