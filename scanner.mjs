const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

function hsv([red, green, blue]) {
  const r = red / 255,
    g = green / 255,
    b = blue / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  return [(hue * 60 + 360) % 360, max ? delta / max : 0, max];
}

function samplePixel(data, width, height, x, y) {
  const channels = [[], [], []];
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const px = Math.max(0, Math.min(width - 1, Math.round(x + offsetX)));
      const py = Math.max(0, Math.min(height - 1, Math.round(y + offsetY)));
      const index = (py * width + px) * 4;
      for (let channel = 0; channel < 3; channel++) channels[channel].push(data[index + channel]);
    }
  }
  return channels.map(median);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function smoothMask(mask) {
  const result = [...mask];
  for (let i = 2; i < mask.length - 2; i++) {
    const votes = mask.slice(i - 2, i + 3).filter(Boolean).length;
    result[i] = votes >= 3;
  }
  return result;
}

function runsFrom(mask) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= mask.length; i++) {
    if (mask[i] && start < 0) start = i;
    if (!mask[i] && start >= 0) {
      runs.push({ start, end: i - 1 });
      start = -1;
    }
  }
  return runs;
}

// RGB cannot prove that a gray or yellowish stripe is metallic. Ambiguous
// low-saturation colors are left for the user to confirm in the menus.
export function classifyColor(rgb, body = null) {
  const [h, s, v] = hsv(rgb);
  const brightness = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255;
  const bodyBrightness = body ? (body[0] * 0.2126 + body[1] * 0.7152 + body[2] * 0.0722) / 255 : 1;
  if (v < 0.19 || (body && brightness < bodyBrightness * 0.32 && v < 0.42)) return 'black';
  if (s < 0.14) {
    if (v > 0.84 && (!body || brightness > bodyBrightness * 1.12)) return 'white';
    if (body && brightness < bodyBrightness * 0.7 && v > 0.28) return 'gray';
    return '';
  }
  if (s < 0.27 && h >= 25 && h <= 70) return '';
  if (h >= 345 || h < 12) return v < 0.38 ? 'brown' : 'red';
  if (h < 37) return v < 0.62 ? 'brown' : 'orange';
  if (h < 68) return s >= 0.6 && v > 0.75 ? 'yellow' : '';
  if (h < 78) return '';
  if (h < 170) return 'green';
  if (h < 195) return '';
  if (h < 255) return 'blue';
  if (h < 335) return 'violet';
  return '';
}

export function sampleColorAt(image, x, y) {
  return classifyColor(samplePixel(image.data, image.width, image.height, x, y));
}

export function detectBands(image, start, end, expectedCount) {
  const { data, width, height } = image;
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = Math.hypot(dx, dy);
  if (length < 60 || !Number.isInteger(expectedCount) || expectedCount < 3 || expectedCount > 6)
    return null;
  const size = Math.min(520, Math.max(90, Math.round(length)));
  const normalX = -dy / length,
    normalY = dx / length;
  const spread = Math.max(1, Math.min(5, length * 0.008));
  const profile = Array.from({ length: size }, (_, index) => {
    const t = index / (size - 1),
      x = start.x + dx * t,
      y = start.y + dy * t;
    const samples = [-1, 0, 1].map((offset) =>
      samplePixel(
        data,
        width,
        height,
        x + normalX * spread * offset,
        y + normalY * spread * offset,
      ),
    );
    return [0, 1, 2].map((channel) => median(samples.map((sample) => sample[channel])));
  });
  const inner = profile.slice(Math.floor(size * 0.04), Math.ceil(size * 0.96));
  const body = [0, 1, 2].map((channel) => median(inner.map((color) => color[channel])));
  const deviations = profile.map((color) => distance(color, body));
  const noise = median(inner.map((color) => distance(color, body)));
  const threshold = Math.max(36, Math.min(65, noise * 2.1));
  const mask = smoothMask(deviations.map((value) => value > threshold));
  const runs = runsFrom(mask).filter((run) => {
    const widthFraction = (run.end - run.start + 1) / size;
    return (
      run.start > size * 0.02 &&
      run.end < size * 0.98 &&
      widthFraction >= 0.012 &&
      widthFraction <= 0.17
    );
  });
  if (runs.length !== expectedCount) return null;
  const items = runs.map((run) => {
    const inset = Math.max(1, Math.floor((run.end - run.start + 1) * 0.2));
    const core = profile.slice(
      run.start + inset,
      Math.max(run.start + inset + 1, run.end - inset + 1),
    );
    const rgb = [0, 1, 2].map((channel) => median(core.map((color) => color[channel])));
    const votes = core.map((color) => classifyColor(color, body));
    const color = classifyColor(rgb, body);
    const agreement = votes.filter((vote) => vote === color).length / votes.length;
    const t = (run.start + run.end) / 2 / (size - 1);
    return {
      color: color && agreement >= 0.68 ? color : '',
      rgb,
      t,
      x: start.x + dx * t,
      y: start.y + dy * t,
    };
  });
  return {
    colors: items.map((item) => item.color),
    positions: items.map((item) => item.t),
    points: items,
    unresolved: items.filter((item) => !item.color).length,
  };
}
