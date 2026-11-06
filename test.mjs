import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBands, formatOhms, orientBands } from './core.mjs';
import { classifyColor, detectBands } from './scanner.mjs';

test('3 through 6 band values, tolerances, limits, and temperature coefficient', () => {
  const cases = [
    {
      colors: ['red', 'violet', 'orange'],
      ohms: 27000,
      tolerance: 20,
      minimum: 21600,
      maximum: 32400,
      tempco: null,
    },
    {
      colors: ['brown', 'black', 'red', 'gold'],
      ohms: 1000,
      tolerance: 5,
      minimum: 950,
      maximum: 1050,
      tempco: null,
    },
    {
      colors: ['brown', 'black', 'black', 'red', 'brown'],
      ohms: 10000,
      tolerance: 1,
      minimum: 9900,
      maximum: 10100,
      tempco: null,
    },
    {
      colors: ['brown', 'black', 'black', 'red', 'brown', 'blue'],
      ohms: 10000,
      tolerance: 1,
      minimum: 9900,
      maximum: 10100,
      tempco: 10,
    },
    {
      colors: ['brown', 'black', 'gold', 'silver'],
      ohms: 1,
      tolerance: 10,
      minimum: 0.9,
      maximum: 1.1,
      tempco: null,
    },
    {
      colors: ['brown', 'black', 'silver', 'gold'],
      ohms: 0.1,
      tolerance: 5,
      minimum: 0.095,
      maximum: 0.105,
      tempco: null,
    },
  ];
  for (const expected of cases) {
    const actual = decodeBands(expected.colors);
    assert.equal(actual.valid, true, expected.colors.join(' '));
    for (const key of ['ohms', 'tolerance', 'minimum', 'maximum', 'tempco']) {
      if (expected[key] == null) assert.equal(actual[key], null);
      else
        assert.ok(
          Math.abs(actual[key] - expected[key]) < 1e-9,
          `${key}: ${expected.colors.join(' ')}`,
        );
    }
  }
  assert.equal(formatOhms(0.095), '0.095 Ω');
  assert.equal(formatOhms(1002.5), '1.0025 kΩ');
});

test('invalid role colors cannot produce a resistance', () => {
  for (const colors of [
    ['black', 'brown', 'red'],
    ['brown', 'gold', 'red'],
    ['brown', 'black', 'red', 'orange'],
    ['brown', 'black', 'black', 'red', 'brown', 'green'],
  ])
    assert.equal(decodeBands(colors).valid, false);
});

test('direction changes only when code or spacing resolves it', () => {
  assert.deepEqual(orientBands(['gold', 'red', 'black', 'brown']).colors, [
    'brown',
    'black',
    'red',
    'gold',
  ]);
  const ambiguous = orientBands(['brown', 'black', 'red', 'brown'], [0.1, 0.35, 0.6, 0.85]);
  assert.equal(ambiguous.certain, false);
  const spaced = orientBands(['brown', 'black', 'red', 'brown'], [0.1, 0.2, 0.3, 0.65]);
  assert.equal(spaced.certain, true);
  assert.deepEqual(orientBands(['gold', 'red', 'black', '']).colors, ['', 'black', 'red', 'gold']);
});

function imageWithBands(colors, positions) {
  const width = 500,
    height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  const palette = {
    brown: [120, 65, 30],
    black: [20, 20, 20],
    red: [200, 50, 40],
    orange: [223, 130, 48],
    green: [53, 137, 82],
    blue: [58, 111, 171],
    violet: [140, 84, 168],
    gold: [195, 170, 100],
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const stripe = positions.findIndex((position) => Math.abs(x - position) <= 11);
      const rgb = stripe < 0 ? [220, 205, 170] : palette[colors[stripe]];
      const index = (y * width + x) * 4;
      data.set([...rgb, 255], index);
    }
  return { width, height, data };
}

test('scanner locates ordered bands and rejects a blank body', () => {
  const start = { x: 30, y: 40 },
    end = { x: 470, y: 40 };
  const image = imageWithBands(['brown', 'black', 'red', 'blue'], [90, 190, 290, 390]);
  for (const [colors, positions] of [
    [
      ['red', 'violet', 'orange'],
      [120, 250, 380],
    ],
    [
      ['brown', 'black', 'red', 'blue'],
      [90, 190, 290, 390],
    ],
    [
      ['brown', 'black', 'red', 'green', 'blue'],
      [80, 160, 240, 320, 400],
    ],
    [
      ['brown', 'black', 'red', 'orange', 'brown', 'blue'],
      [80, 145, 210, 275, 340, 405],
    ],
  ])
    assert.deepEqual(
      detectBands(imageWithBands(colors, positions), start, end, colors.length)?.colors,
      colors,
    );
  assert.equal(detectBands(image, start, end, 5), null);
  assert.equal(detectBands(imageWithBands([], []), start, end, 4), null);
});

test('metallic-looking RGB remains unresolved', () => {
  assert.equal(classifyColor([195, 170, 100], [220, 205, 170]), '');
  const image = imageWithBands(['brown', 'black', 'red', 'gold'], [90, 190, 290, 390]);
  assert.deepEqual(detectBands(image, { x: 30, y: 40 }, { x: 470, y: 40 }, 4)?.colors, [
    'brown',
    'black',
    'red',
    '',
  ]);
});

test('moderate lighting gradient and narrow reflection do not change clear bands', () => {
  const image = imageWithBands(['brown', 'black', 'red', 'blue'], [90, 190, 290, 390]);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const index = (y * image.width + x) * 4;
      const light = 0.82 + (0.27 * x) / image.width;
      for (let channel = 0; channel < 3; channel++) image.data[index + channel] *= light;
      if (y >= 39 && y <= 41)
        for (let channel = 0; channel < 3; channel++) image.data[index + channel] = 250;
    }
  assert.deepEqual(detectBands(image, { x: 30, y: 40 }, { x: 470, y: 40 }, 4)?.colors, [
    'brown',
    'black',
    'red',
    'blue',
  ]);
});
