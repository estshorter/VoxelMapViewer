/* eslint @typescript-eslint/no-var-requires: "off" */
const SimplexNoise = require("simplex-noise");
const fs = require("fs");

const gen = new SimplexNoise();
function noise(nx: number, ny: number) {
  // Rescale from -1.0:+1.0 to 0.0:1.0
  return gen.noise2D(nx, ny) / 2 + 0.5;
}

const cellSize = 64;
const heightMap = new Uint8Array(cellSize * cellSize);
for (let y = 0; y < cellSize; ++y) {
  for (let x = 0; x < cellSize; ++x) {
    const coef = 2 / cellSize;
    const height = Math.floor(noise(x * coef, y * coef) ** 1.5 * 20);
    heightMap[y * cellSize + x] = height;
  }
}
console.log(heightMap);
try {
  fs.writeFileSync("dist/map.bin", heightMap);
} catch (e) {
  console.log(e.message);
}

const config = {
  cellSize: cellSize,
};
try {
  fs.writeFileSync("dist/config.json", JSON.stringify(config));
} catch (e) {
  console.log(e.message);
}
