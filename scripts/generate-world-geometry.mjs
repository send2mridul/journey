import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { feature } from "topojson-client";

const topology = JSON.parse(
  await readFile(resolve("node_modules/world-atlas/countries-110m.json"), "utf8"),
);
const countries = feature(topology, topology.objects.countries);

function project([longitude, latitude]) {
  return [((longitude + 180) / 360) * 1000, ((90 - latitude) / 180) * 500];
}

function ringPath(ring) {
  return (
    ring
      .map((coordinate, index) => {
        const [x, y] = project(coordinate);
        return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join("") + "Z"
  );
}

function geometryPath(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(ringPath).join("");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygon.map(ringPath)).join("");
  }
  return "";
}

const paths = countries.features
  .map((country) => geometryPath(country.geometry))
  .filter(Boolean)
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500"><path d="${paths}" fill="#f2eee4" fill-rule="evenodd" stroke="#9aa9a8" stroke-width="0.55"/></svg>\n`;
await writeFile(resolve("public/world-land-110m.svg"), svg);
console.log("Generated public/world-land-110m.svg from Natural Earth via world-atlas.");
