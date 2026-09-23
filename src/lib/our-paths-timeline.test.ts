import { describe, expect, test } from "bun:test";
import { activePlaceAtYear, approximateDistanceKm, knownYearRange } from "./our-paths-timeline";

const trail = [
  { city: "Delhi", latitude: 28.6139, longitude: 77.209, arrivalYear: 1996, endYear: 1997 },
  { city: "Chennai", latitude: 13.0827, longitude: 80.2707, arrivalYear: 1997, endYear: 2000 },
  { city: "Unknown origin", latitude: 0, longitude: 0 },
];

describe("Our Paths year evidence", () => {
  test("shows a location only inside a recorded period", () => {
    expect(activePlaceAtYear(trail, 1996)?.city).toBe("Delhi");
    expect(activePlaceAtYear(trail, 1999)?.city).toBe("Chennai");
    expect(activePlaceAtYear(trail, 1995)).toBeNull();
    expect(activePlaceAtYear(trail, 2001)).toBeNull();
  });

  test("ignores missing dates when deriving the timeline", () => {
    expect(knownYearRange([trail], [], 2000)).toEqual({ min: 1996, max: 2000 });
    expect(knownYearRange([[trail[2]!]], [], 2000)).toBeNull();
    expect(knownYearRange([[trail[0]!]], [], 2026)).toEqual({ min: 1996, max: 1997 });
  });

  test("returns an approximate geographic distance only for two known places", () => {
    expect(approximateDistanceKm(trail[0]!, trail[1]!)).toBeGreaterThan(1700);
    expect(approximateDistanceKm(trail[0]!, trail[1]!)).toBeLessThan(1800);
    expect(approximateDistanceKm(trail[0]!, null)).toBeNull();
  });
});
