/**
 * Deterministic pixel/geometric avatar generator.
 * Returns an SVG data URL based on a seed string.
 */

function hashSeed(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

function hashSeedOffset(seed: string, offset: number, mod: number): number {
  let h = offset * 1337;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i) + offset) >>> 0;
  }
  return h % mod;
}

export function generatePixelAvatar(seed: string, size = 28): string {
  const GRID = 5;
  const cellSize = size / GRID;

  // Deterministic hue from seed
  const hue = hashSeed(seed, 360);
  // Saturation 60-90%, lightness 55-75%
  const saturation = 60 + hashSeedOffset(seed, 1, 30);
  const lightness = 55 + hashSeedOffset(seed, 2, 20);

  const fgColor = `hsl(${hue},${saturation}%,${lightness}%)`;
  const bgColor = `hsl(${hue},20%,10%)`;

  // Generate 5x3 grid (mirror left-right for symmetry)
  const cols = 3; // only left half + center
  const cells: boolean[][] = [];
  for (let row = 0; row < GRID; row++) {
    cells[row] = [];
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      cells[row][col] = hashSeedOffset(seed, idx + 10, 2) === 1;
    }
  }

  // Build pixel rects (mirrored)
  let rects = "";
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      // Mirror: col 0-2 are left half, col 3 mirrors col 1, col 4 mirrors col 0
      const srcCol = col < cols ? col : GRID - 1 - col;
      if (cells[row][srcCol]) {
        const x = col * cellSize;
        const y = row * cellSize;
        rects += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fgColor}" />`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bgColor}" rx="14" />
  ${rects}
</svg>`;

  // Safe base64 encoding for unicode
  const encoded = unescape(encodeURIComponent(svg));
  return `data:image/svg+xml;base64,${btoa(encoded)}`;
}
