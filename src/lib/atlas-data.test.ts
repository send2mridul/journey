import { describe, expect, test } from 'bun:test';
import { greatCircleArc } from './atlas-data';

const cases: Array<[string, [number, number], [number, number]]> = [
  ['Texas City → Hanoi', [-94.9027, 29.3838], [105.8342, 21.0278]],
  ['San Francisco → Tokyo', [-122.4194, 37.7749], [139.6917, 35.6895]],
  ['Los Angeles → Sydney', [-118.2437, 34.0522], [151.2093, -33.8688]],
  ['Auckland → Los Angeles', [174.7633, -36.8485], [-118.2437, 34.0522]],
  ['Fiji → Samoa', [178.065, -17.7134], [-172.1046, -13.759]],
  ['London → Tokyo', [-0.1276, 51.5072], [139.6917, 35.6895]],
];

describe('great-circle route geometry', () => {
  test.each(cases)('%s stays continuous and reaches its destination', (_name, from, to) => {
    const coordinates = greatCircleArc(from, to);
    const longitudeSteps = coordinates.slice(1).map((point, index) => Math.abs(point[0] - coordinates[index]![0]));
    expect(Math.max(...longitudeSteps)).toBeLessThan(30);
    expect(Math.abs(coordinates[0]![0] - from[0])).toBeLessThan(0.0001);
    expect(Math.abs(coordinates.at(-1)![0] - to[0])).toBeLessThanOrEqual(360);
    expect(Math.abs(coordinates.at(-1)![1] - to[1])).toBeLessThan(0.0001);
  });

  test('Texas City → Hanoi does not create a backwards 300° wrap', () => {
    const coordinates = greatCircleArc([-94.9027, 29.3838], [105.8342, 21.0278]);
    const span = Math.max(...coordinates.map(([longitude]) => longitude)) - Math.min(...coordinates.map(([longitude]) => longitude));
    expect(span).toBeLessThan(180);
  });

  test('multi-stop regression trail remains continuous segment by segment', () => {
    const trail: Array<[number, number]> = [[85.1376, 25.5941], [77.5946, 12.9716], [-0.1276, 51.5072], [-79.3832, 43.6532]];
    for (let index = 0; index < trail.length - 1; index += 1) {
      const coordinates = greatCircleArc(trail[index]!, trail[index + 1]!);
      expect(Math.max(...coordinates.slice(1).map((point, pointIndex) => Math.abs(point[0] - coordinates[pointIndex]![0])))).toBeLessThan(30);
    }
  });
});
