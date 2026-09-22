import { fingerprintFor, formatDistance, routeCoordinates, routesFromTrail, type TrailStop } from '@/lib/atlas-data';
import { fingerprintArcs, fingerprintPoint } from '@/lib/fingerprint';

export type ShareCardFormat = 'square' | 'story' | 'og';

export const shareCardDimensions: Record<ShareCardFormat, readonly [number, number]> = {
  square: [1080, 1080],
  story: [1080, 1920],
  og: [1200, 630],
};

export type AtlasCardOptions = {
  displayName?: string;
};

type MapFrame = { x: number; y: number; width: number; height: number };
type LabelBox = { x: number; y: number; width: number; height: number };

const cachedCards = new Map<string, string>();
const MAP_MIN_LATITUDE = -58;
const MAP_MAX_LATITUDE = 82;

// Deliberately simplified continental silhouettes: geographic context, not a road map.
const WORLD_LAND: Array<Array<[number, number]>> = [
  [[-168, 71], [-145, 70], [-126, 56], [-124, 44], [-112, 30], [-98, 18], [-82, 9], [-73, 18], [-66, 45], [-54, 52], [-62, 62], [-89, 73], [-125, 74]],
  [[-82, 12], [-72, 8], [-61, -4], [-49, -21], [-56, -38], [-68, -55], [-76, -42], [-80, -10]],
  [[-53, 82], [-22, 77], [-18, 64], [-42, 58], [-61, 65]],
  [[-17, 36], [2, 36], [18, 31], [33, 31], [51, 11], [43, -12], [31, -35], [16, -34], [5, -20], [-9, 5]],
  [[-10, 36], [0, 44], [18, 47], [30, 60], [53, 72], [96, 77], [137, 59], [161, 58], [179, 49], [160, 31], [139, 34], [125, 20], [106, 8], [92, 21], [72, 20], [58, 29], [39, 40], [20, 40]],
  [[68, 23], [79, 8], [88, 22], [80, 30]],
  [[95, 7], [117, -7], [133, -8], [141, -4], [129, 5], [112, 12]],
  [[112, -11], [130, -12], [153, -28], [145, -43], [119, -36]],
  [[166, -35], [177, -38], [174, -47], [166, -45]],
  [[47, -13], [51, -16], [48, -25], [44, -20]],
];

function cardKey(trail: TrailStop[], format: ShareCardFormat, options: AtlasCardOptions) {
  return JSON.stringify({
    format,
    displayName: options.displayName?.trim().slice(0, 80) ?? '',
    chapters: trail.map(({ city, countryCode, latitude, longitude, arrivalYear }) => ({ city, countryCode, latitude, longitude, arrivalYear })),
  });
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitWrappedText(context: CanvasRenderingContext2D, text: string, options: { x: number; y: number; maxWidth: number; maxLines: number; initialSize: number; minSize: number; lineHeight: number; family: string; weight: number }) {
  let size = options.initialSize;
  let lines: string[] = [];
  while (size >= options.minSize) {
    context.font = `${options.weight} ${size}px ${options.family}`;
    lines = wrapLines(context, text, options.maxWidth);
    if (lines.length <= options.maxLines) break;
    size -= 2;
  }
  if (lines.length > options.maxLines) {
    lines = lines.slice(0, options.maxLines);
    let finalLine = lines.at(-1) ?? '';
    while (finalLine && context.measureText(`${finalLine}…`).width > options.maxWidth) finalLine = finalLine.slice(0, -1);
    lines[lines.length - 1] = `${finalLine.trim()}…`;
  }
  const actualLineHeight = size * options.lineHeight;
  lines.forEach((line, index) => context.fillText(line, options.x, options.y + index * actualLineHeight));
  return { size, lines, height: lines.length * actualLineHeight };
}

function drawFingerprint(context: CanvasRenderingContext2D, trail: TrailStop[], cx: number, cy: number, radius: number) {
  const arcs = fingerprintArcs(trail);
  const outerArcRadius = Math.max(102, ...arcs.map((arc) => arc.radius + arc.weight));
  const scale = radius / (outerArcRadius + 10);
  context.save();
  context.shadowColor = 'rgba(86,45,27,.2)';
  context.shadowBlur = 24 * scale;
  context.shadowOffsetY = 8 * scale;
  const wash = context.createRadialGradient(cx - radius * .18, cy - radius * .2, radius * .08, cx, cy, radius);
  wash.addColorStop(0, 'rgba(255,252,244,.99)');
  wash.addColorStop(1, 'rgba(229,202,164,.96)');
  context.fillStyle = wash;
  context.strokeStyle = 'rgba(155,76,47,.24)';
  context.lineWidth = Math.max(2, scale);
  context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill(); context.stroke();
  context.shadowColor = 'transparent';

  context.strokeStyle = 'rgba(155,76,47,.24)';
  context.lineWidth = Math.max(1.5, scale * .8);
  context.setLineDash([2 * scale, 5 * scale]);
  context.beginPath(); context.arc(cx, cy, 18 * scale, 0, Math.PI * 2); context.stroke();
  context.setLineDash([]);

  for (const arc of arcs) {
    const start = (arc.start - 90) * Math.PI / 180;
    const end = (arc.start + arc.length - 90) * Math.PI / 180;
    context.strokeStyle = `rgba(164,70,38,${Math.min(.96, arc.opacity + .08)})`;
    context.lineWidth = arc.weight * scale;
    context.lineCap = 'round';
    context.beginPath(); context.arc(cx, cy, arc.radius * scale, start, end); context.stroke();
    const node = fingerprintPoint(cx, cy, arc.radius * scale, arc.start + arc.length);
    context.fillStyle = '#a94729'; context.strokeStyle = '#fffaf0'; context.lineWidth = 1.5 * scale;
    context.beginPath(); context.arc(node.x, node.y, 3.3 * scale, 0, Math.PI * 2); context.fill(); context.stroke();
  }
  context.fillStyle = '#9f4327'; context.beginPath(); context.arc(cx, cy, 5 * scale, 0, Math.PI * 2); context.fill();
  context.strokeStyle = 'rgba(166,76,47,.34)'; context.lineWidth = 1.2 * scale; context.beginPath(); context.arc(cx, cy, 9 * scale, 0, Math.PI * 2); context.stroke();
  context.restore();
}

function drawPaper(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#fffaf1');
  gradient.addColorStop(.48, '#f7ead8');
  gradient.addColorStop(1, '#e5cbaa');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * .16, height * .12, 0, width * .16, height * .12, width * .7);
  glow.addColorStop(0, 'rgba(255,255,255,.7)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(112,75,52,.05)';
  context.lineWidth = 1;
  for (let y = 38; y < height; y += 34) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y + width * .018); context.stroke();
  }
}

function safeHeading(displayName?: string) {
  const normalized = displayName?.trim().replace(/\s+/g, ' ') ?? '';
  const name = normalized.length > 42 ? `${normalized.slice(0, 41).trim()}…` : normalized;
  return name ? `${name.toUpperCase()}’S LIFE ATLAS` : 'MY LIFE, SO FAR';
}

function drawFittedLabel(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, initialSize: number, minSize: number, family: string) {
  let size = initialSize;
  do {
    context.font = `700 ${size}px ${family}`;
    if (context.measureText(text).width <= maxWidth || size <= minSize) break;
    size -= 1;
  } while (size >= minSize);
  context.fillText(text, x, y);
  return size;
}

function normalizeLongitude(longitude: number) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function mapPoint(frame: MapFrame, longitude: number, latitude: number) {
  return {
    x: frame.x + ((longitude + 180) / 360) * frame.width,
    y: frame.y + ((MAP_MAX_LATITUDE - Math.max(MAP_MIN_LATITUDE, Math.min(MAP_MAX_LATITUDE, latitude))) / (MAP_MAX_LATITUDE - MAP_MIN_LATITUDE)) * frame.height,
  };
}

function boxesOverlap(a: LabelBox, b: LabelBox) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function routeLabelIndices(length: number) {
  if (length <= 4) return Array.from({ length }, (_, index) => index);
  return [...new Set([0, Math.round((length - 1) / 3), Math.round((length - 1) * 2 / 3), length - 1])];
}

function drawGeographicTrail(context: CanvasRenderingContext2D, trail: TrailStop[], frame: MapFrame, options: { sans: string; compact?: boolean }) {
  const radius = options.compact ? 24 : 30;
  context.save();
  context.shadowColor = 'rgba(81,43,26,.15)';
  context.shadowBlur = options.compact ? 18 : 28;
  context.shadowOffsetY = options.compact ? 7 : 10;
  context.fillStyle = 'rgba(255,252,245,.82)';
  context.beginPath(); context.roundRect(frame.x, frame.y, frame.width, frame.height, radius); context.fill();
  context.shadowColor = 'transparent';
  context.clip();

  const sea = context.createLinearGradient(frame.x, frame.y, frame.x, frame.y + frame.height);
  sea.addColorStop(0, 'rgba(254,250,241,.92)');
  sea.addColorStop(1, 'rgba(228,207,177,.78)');
  context.fillStyle = sea;
  context.fillRect(frame.x, frame.y, frame.width, frame.height);

  context.strokeStyle = 'rgba(132,94,69,.12)';
  context.lineWidth = 1;
  context.setLineDash([3, 7]);
  for (let longitude = -120; longitude <= 120; longitude += 60) {
    const start = mapPoint(frame, longitude, MAP_MIN_LATITUDE);
    const end = mapPoint(frame, longitude, MAP_MAX_LATITUDE);
    context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
  }
  for (let latitude = -30; latitude <= 60; latitude += 30) {
    const start = mapPoint(frame, -180, latitude);
    const end = mapPoint(frame, 180, latitude);
    context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
  }
  context.setLineDash([]);

  context.fillStyle = 'rgba(160,116,78,.2)';
  context.strokeStyle = 'rgba(132,88,58,.22)';
  context.lineWidth = options.compact ? 1 : 1.4;
  for (const polygon of WORLD_LAND) {
    context.beginPath();
    polygon.forEach(([longitude, latitude], index) => {
      const point = mapPoint(frame, longitude, latitude);
      if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
    });
    context.closePath(); context.fill(); context.stroke();
  }

  for (const route of routesFromTrail(trail)) {
    const coordinates = routeCoordinates(route);
    for (const shift of [-360, 0, 360]) {
      for (const [strokeStyle, lineWidth] of [['rgba(255,248,233,.92)', options.compact ? 7 : 10], ['rgba(164,70,38,.88)', options.compact ? 3.2 : 4.8]] as const) {
        context.strokeStyle = strokeStyle;
        context.lineWidth = lineWidth;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        coordinates.forEach(([longitude, latitude], index) => {
          const point = mapPoint(frame, longitude + shift, latitude);
          if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
        });
        context.stroke();
      }
    }
  }

  const nodeRadius = options.compact ? 8 : 10;
  trail.forEach((stop, index) => {
    const point = mapPoint(frame, normalizeLongitude(stop.longitude), stop.latitude);
    context.fillStyle = '#a64629';
    context.strokeStyle = '#fffaf0';
    context.lineWidth = options.compact ? 3 : 4;
    context.beginPath(); context.arc(point.x, point.y, nodeRadius, 0, Math.PI * 2); context.fill(); context.stroke();
    context.fillStyle = '#fffaf0';
    context.font = `700 ${options.compact ? 9 : 11}px ${options.sans}`;
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(String(index + 1), point.x, point.y + .5); context.textAlign = 'left'; context.textBaseline = 'alphabetic';
  });

  const labelBoxes: LabelBox[] = [];
  context.font = `650 ${options.compact ? 14 : 18}px ${options.sans}`;
  for (const index of routeLabelIndices(trail.length)) {
    const stop = trail[index]!;
    const point = mapPoint(frame, normalizeLongitude(stop.longitude), stop.latitude);
    const maxLabelWidth = Math.min(options.compact ? 150 : 205, frame.width * .33);
    let label = stop.city;
    while (label.length > 5 && context.measureText(`${label}…`).width > maxLabelWidth - 20) label = label.slice(0, -1);
    if (label !== stop.city) label = `${label.trim()}…`;
    const width = Math.min(maxLabelWidth, context.measureText(label).width + (options.compact ? 16 : 22));
    const height = options.compact ? 28 : 35;
    const candidates: LabelBox[] = [
      { x: point.x + 12, y: point.y - height - 9, width, height },
      { x: point.x - width - 12, y: point.y - height - 9, width, height },
      { x: point.x + 12, y: point.y + 9, width, height },
      { x: point.x - width - 12, y: point.y + 9, width, height },
    ];
    const box = candidates.find((candidate) => candidate.x >= frame.x + 8 && candidate.x + candidate.width <= frame.x + frame.width - 8 && candidate.y >= frame.y + 8 && candidate.y + candidate.height <= frame.y + frame.height - 8 && !labelBoxes.some((placed) => boxesOverlap(candidate, placed)));
    if (!box) continue;
    labelBoxes.push(box);
    context.fillStyle = 'rgba(255,250,240,.9)';
    context.beginPath(); context.roundRect(box.x, box.y, box.width, box.height, box.height / 2); context.fill();
    context.fillStyle = '#5a3a2b'; context.fillText(label, box.x + (options.compact ? 8 : 11), box.y + (options.compact ? 19 : 24));
  }

  context.fillStyle = 'rgba(87,55,40,.68)';
  context.font = `700 ${options.compact ? 12 : 15}px ${options.sans}`;
  context.letterSpacing = options.compact ? '2px' : '3px';
  context.fillText('A LIFE IN MOTION', frame.x + (options.compact ? 18 : 24), frame.y + (options.compact ? 27 : 34));
  context.letterSpacing = '0px';
  context.restore();

  context.strokeStyle = 'rgba(132,83,54,.25)';
  context.lineWidth = 1.5;
  context.beginPath(); context.roundRect(frame.x, frame.y, frame.width, frame.height, radius); context.stroke();
}

function drawStats(context: CanvasRenderingContext2D, stats: ReturnType<typeof fingerprintFor>, options: { x: number; y: number; maxWidth: number; sans: string; primarySize: number; secondarySize: number; align?: CanvasTextAlign }) {
  const places = `${stats.locations} ${stats.locations === 1 ? 'PLACE' : 'PLACES'} CALLED HOME`;
  const countries = `${stats.countries} ${stats.countries === 1 ? 'COUNTRY' : 'COUNTRIES'}`;
  const distance = stats.totalDistance > 0 ? `${formatDistance(stats.totalDistance).toUpperCase()} ACROSS LIFE` : '';
  context.textAlign = options.align ?? 'left';
  context.fillStyle = '#4b3429'; context.font = `700 ${options.primarySize}px ${options.sans}`; context.fillText(places, options.x, options.y, options.maxWidth);
  context.fillStyle = '#9b492f'; context.font = `600 ${options.secondarySize}px ${options.sans}`; context.fillText([countries, distance].filter(Boolean).join('   ·   '), options.x, options.y + options.primarySize * 1.32, options.maxWidth);
  context.textAlign = 'left';
}

function drawStoryRoute(context: CanvasRenderingContext2D, trail: TrailStop[], options: { x: number; y: number; maxWidth: number; serif: string; sans: string }) {
  if (trail.length <= 4) {
    const lineHeight = trail.length === 4 ? 67 : 76;
    trail.forEach((stop, index) => {
      const y = options.y + index * lineHeight;
      context.fillStyle = '#aa4c2d'; context.font = `700 20px ${options.sans}`; context.fillText(String(index + 1).padStart(2, '0'), options.x, y);
      context.fillStyle = '#3e2f27';
      drawFittedLabel(context, stop.city, options.x + 58, y, options.maxWidth - 58, 50, 32, options.serif);
      if (index < trail.length - 1) {
        context.strokeStyle = 'rgba(158,72,44,.36)'; context.lineWidth = 2;
        context.beginPath(); context.moveTo(options.x + 17, y + 14); context.lineTo(options.x + 17, y + lineHeight - 25); context.stroke();
        context.fillStyle = '#aa4c2d'; context.beginPath(); context.arc(options.x + 17, y + lineHeight - 18, 4, 0, Math.PI * 2); context.fill();
      }
    });
    return options.y + trail.length * lineHeight;
  }
  context.fillStyle = '#3e2f27';
  const route = trail.map((stop) => stop.city).join('  →  ');
  const result = fitWrappedText(context, route, { x: options.x, y: options.y, maxWidth: options.maxWidth, maxLines: 4, initialSize: 48, minSize: 32, lineHeight: 1.12, family: options.serif, weight: 500 });
  return options.y + result.height;
}

function drawFooter(context: CanvasRenderingContext2D, options: { x: number; y: number; width: number; sans: string; serif: string; story?: boolean }) {
  const primary = options.story ? 23 : 18;
  const secondary = options.story ? 22 : 17;
  context.fillStyle = '#46372e'; context.font = `700 ${primary}px ${options.sans}`; context.letterSpacing = '2px'; context.fillText('LIFE ATLAS', options.x, options.y); context.letterSpacing = '0px';
  context.textAlign = 'right'; context.fillStyle = '#8c4a32'; context.font = `500 ${secondary}px ${options.serif}`; context.fillText('Map where life has taken you.', options.x + options.width, options.y); context.textAlign = 'left';
}

export async function renderAtlasCard(trail: TrailStop[], format: ShareCardFormat, options: AtlasCardOptions = {}) {
  if (!trail.length) throw new Error('A Life Atlas needs at least one chapter.');
  const key = cardKey(trail, format, options);
  const cached = cachedCards.get(key);
  if (cached) return cached;
  await document.fonts.ready;
  const [width, height] = shareCardDimensions[format];
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Share card rendering is unavailable.');
  drawPaper(context, width, height);
  context.textBaseline = 'alphabetic';

  const serif = '"Playfair Display", Georgia, serif';
  const sans = '"Instrument Sans", Arial, sans-serif';
  const stats = fingerprintFor(trail);
  const route = trail.map((stop) => stop.city).join('  →  ');
  const heading = safeHeading(options.displayName);

  if (format === 'story') {
    const padding = 72;
    context.fillStyle = '#a24e31'; context.letterSpacing = '5px'; drawFittedLabel(context, heading, padding, 176, width - padding * 2, 38, 24, sans); context.letterSpacing = '0px';
    context.fillStyle = '#6c5547'; context.font = `500 22px ${serif}`; context.fillText('A geographic biography, drawn from the places that became home.', padding, 220);

    drawGeographicTrail(context, trail, { x: padding, y: 270, width: width - padding * 2, height: 650 }, { sans });
    drawFingerprint(context, trail, 814, 846, 148);

    const routeBottom = drawStoryRoute(context, trail, { x: padding, y: 1060, maxWidth: width - padding * 2, serif, sans });
    const statY = Math.max(1445, Math.min(1530, routeBottom + 82));
    context.strokeStyle = 'rgba(126,79,52,.24)'; context.lineWidth = 1.5; context.beginPath(); context.moveTo(padding, statY - 55); context.lineTo(width - padding, statY - 55); context.stroke();
    drawStats(context, stats, { x: padding, y: statY, maxWidth: width - padding * 2, sans, primarySize: 38, secondarySize: 31 });
    drawFooter(context, { x: padding, y: 1742, width: width - padding * 2, sans, serif, story: true });
  } else if (format === 'square') {
    const padding = 66;
    context.fillStyle = '#a24e31'; context.letterSpacing = '5px'; drawFittedLabel(context, heading, padding, 82, width - padding * 2, 32, 20, sans); context.letterSpacing = '0px';
    drawGeographicTrail(context, trail, { x: padding, y: 126, width: width - padding * 2, height: 474 }, { sans });
    drawFingerprint(context, trail, 842, 548, 110);

    context.fillStyle = '#3f3028';
    const routeResult = fitWrappedText(context, route, { x: padding, y: 704, maxWidth: width - padding * 2, maxLines: 3, initialSize: 50, minSize: 32, lineHeight: 1.08, family: serif, weight: 500 });
    const statY = Math.max(884, Math.min(922, 704 + routeResult.height + 64));
    context.strokeStyle = 'rgba(126,79,52,.24)'; context.lineWidth = 1.5; context.beginPath(); context.moveTo(padding, statY - 44); context.lineTo(width - padding, statY - 44); context.stroke();
    drawStats(context, stats, { x: padding, y: statY, maxWidth: width - padding * 2, sans, primarySize: 34, secondarySize: 28 });
    drawFooter(context, { x: padding, y: 1018, width: width - padding * 2, sans, serif });
  } else {
    const padding = 62;
    context.fillStyle = '#a24e31'; context.letterSpacing = '4px'; drawFittedLabel(context, heading, padding, 74, 560, 26, 17, sans); context.letterSpacing = '0px';
    context.fillStyle = '#3f3028';
    fitWrappedText(context, route, { x: padding, y: 157, maxWidth: 550, maxLines: 4, initialSize: 46, minSize: 28, lineHeight: 1.07, family: serif, weight: 500 });
    drawStats(context, stats, { x: padding, y: 470, maxWidth: 565, sans, primarySize: 23, secondarySize: 19 });
    drawFooter(context, { x: padding, y: 574, width: 548, sans, serif });

    drawGeographicTrail(context, trail, { x: 674, y: 56, width: 466, height: 472 }, { sans, compact: true });
    drawFingerprint(context, trail, 1008, 476, 92);
  }

  const dataUrl = canvas.toDataURL('image/png');
  cachedCards.set(key, dataUrl);
  return dataUrl;
}

export function atlasCardFilename(format: ShareCardFormat) {
  return `life-atlas-${format === 'square' ? 'post' : format === 'story' ? 'story' : 'link-preview'}.png`;
}

export async function dataUrlToFile(dataUrl: string, filename: string) {
  const response = await fetch(dataUrl);
  return new File([await response.blob()], filename, { type: 'image/png' });
}

export type OurPathsCardData = {
  mineName: string;
  otherName: string;
  mineTrail: Array<{ id: string; city: string; country: string; countryCode: string; latitude: number; longitude: number }>;
  theirTrail: Array<{ id: string; city: string; country: string; countryCode: string; latitude: number; longitude: number }>;
  sharedPlaces: Array<{ city: string; country: string; latitude: number; longitude: number; overlapFrom: number | null; overlapTo: number | null }>;
};

function drawPathLine(context: CanvasRenderingContext2D, trail: OurPathsCardData['mineTrail'], frame: MapFrame, color: string) {
  if (trail.length < 2) return;
  context.strokeStyle = 'rgba(255,250,240,.9)'; context.lineWidth = 11; context.lineCap = 'round'; context.lineJoin = 'round';
  context.beginPath(); trail.forEach((stop, index) => { const point = mapPoint(frame, normalizeLongitude(stop.longitude), stop.latitude); if (!index) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y); }); context.stroke();
  context.strokeStyle = color; context.lineWidth = 5;
  context.beginPath(); trail.forEach((stop, index) => { const point = mapPoint(frame, normalizeLongitude(stop.longitude), stop.latitude); if (!index) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y); }); context.stroke();
}

export async function renderOurPathsCard(data: OurPathsCardData) {
  await document.fonts.ready;
  const width = 1200; const height = 630;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Share card rendering is unavailable.');
  const serif = '"Playfair Display", Georgia, serif'; const sans = '"Instrument Sans", Arial, sans-serif';
  drawPaper(context, width, height);
  context.fillStyle = '#a24e31'; context.font = `700 17px ${sans}`; context.letterSpacing = '4px'; context.fillText('OUR PATHS', 62, 70); context.letterSpacing = '0px';
  context.fillStyle = '#3f3028'; fitWrappedText(context, `${data.mineName}  ×  ${data.otherName}`, { x: 62, y: 142, maxWidth: 475, maxLines: 3, initialSize: 49, minSize: 30, lineHeight: 1.04, family: serif, weight: 500 });
  const shared = data.sharedPlaces.length;
  context.fillStyle = '#8d4a31'; context.font = `600 22px ${sans}`; context.fillText(shared ? `${shared} shared ${shared === 1 ? 'place' : 'places'} across two lives` : 'Two routes, held in one frame', 62, 326);
  const highlight = data.sharedPlaces[0];
  if (highlight) {
    context.fillStyle = '#4b3429'; context.font = `500 29px ${serif}`; context.fillText(highlight.city, 62, 385);
    context.fillStyle = '#7a6659'; context.font = `500 16px ${sans}`;
    const years = highlight.overlapFrom && highlight.overlapTo ? ` · approximately ${highlight.overlapFrom}–${highlight.overlapTo}` : '';
    context.fillText(`${highlight.country}${years}`, 62, 415);
  }
  context.strokeStyle = 'rgba(126,79,52,.24)'; context.beginPath(); context.moveTo(62, 510); context.lineTo(520, 510); context.stroke();
  context.fillStyle = '#46372e'; context.font = `700 17px ${sans}`; context.letterSpacing = '2px'; context.fillText('LIFE ATLAS', 62, 570); context.letterSpacing = '0px';
  context.fillStyle = '#8c4a32'; context.font = `500 17px ${serif}`; context.fillText('A geographic biography', 205, 570);

  const frame = { x: 574, y: 48, width: 566, height: 534 };
  context.save(); context.beginPath(); context.roundRect(frame.x, frame.y, frame.width, frame.height, 26); context.clip();
  context.fillStyle = 'rgba(255,252,245,.72)'; context.fillRect(frame.x, frame.y, frame.width, frame.height);
  context.fillStyle = 'rgba(160,116,78,.2)'; context.strokeStyle = 'rgba(132,88,58,.2)'; context.lineWidth = 1;
  for (const polygon of WORLD_LAND) { context.beginPath(); polygon.forEach(([longitude, latitude], index) => { const point = mapPoint(frame, longitude, latitude); if (!index) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y); }); context.closePath(); context.fill(); context.stroke(); }
  drawPathLine(context, data.mineTrail, frame, '#b65335');
  drawPathLine(context, data.theirTrail, frame, '#315d70');
  for (const place of data.sharedPlaces) { const point = mapPoint(frame, normalizeLongitude(place.longitude), place.latitude); context.fillStyle = '#d19a43'; context.strokeStyle = '#fffaf0'; context.lineWidth = 4; context.beginPath(); context.arc(point.x, point.y, 11, 0, Math.PI * 2); context.fill(); context.stroke(); }
  context.restore(); context.strokeStyle = 'rgba(132,83,54,.25)'; context.beginPath(); context.roundRect(frame.x, frame.y, frame.width, frame.height, 26); context.stroke();
  context.fillStyle = '#b65335'; context.fillRect(604, 541, 20, 4); context.fillStyle = '#315d70'; context.fillRect(706, 541, 20, 4); context.fillStyle = '#665247'; context.font = `600 13px ${sans}`; context.fillText(data.mineName, 632, 546); context.fillText(data.otherName, 734, 546);
  return canvas.toDataURL('image/png');
}
