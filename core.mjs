export const COLOR_HEX = Object.freeze({
  black: '#191b1c',
  brown: '#78411f',
  red: '#c84032',
  orange: '#df8230',
  yellow: '#ebcd42',
  green: '#358952',
  blue: '#3a6fab',
  violet: '#8c54a8',
  gray: '#898f8c',
  white: '#f0ede2',
  gold: '#c7a756',
  silver: '#bfc0bb',
});

export const DIGITS = Object.freeze([
  'black',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'violet',
  'gray',
  'white',
]);
export const MULTIPLIERS = Object.freeze([...DIGITS, 'gold', 'silver']);
export const TOLERANCES = Object.freeze({
  brown: 1,
  red: 2,
  green: 0.5,
  blue: 0.25,
  violet: 0.1,
  gray: 0.05,
  gold: 5,
  silver: 10,
});
export const TEMPERATURE_COEFFICIENTS = Object.freeze({
  brown: 100,
  red: 50,
  orange: 15,
  yellow: 25,
  blue: 10,
  violet: 5,
});
export const BAND_COUNTS = Object.freeze([3, 4, 5, 6]);

export function slotsFor(count) {
  if (!BAND_COUNTS.includes(count)) throw new RangeError('Supported band counts are 3 through 6.');
  const digitCount = count >= 5 ? 3 : 2;
  const slots = Array.from({ length: digitCount }, (_, i) => ({
    label: `Digit ${i + 1}`,
    role: 'digit',
    choices: i === 0 ? DIGITS.slice(1) : DIGITS,
  }));
  slots.push({ label: 'Multiplier', role: 'multiplier', choices: MULTIPLIERS });
  if (count >= 4)
    slots.push({ label: 'Tolerance', role: 'tolerance', choices: Object.keys(TOLERANCES) });
  if (count === 6)
    slots.push({
      label: 'Temp. coefficient',
      role: 'tempco',
      choices: Object.keys(TEMPERATURE_COEFFICIENTS),
    });
  return slots;
}

export function multiplierFor(color) {
  return color === 'gold' ? 0.1 : color === 'silver' ? 0.01 : 10 ** DIGITS.indexOf(color);
}

export function decodeBands(bands) {
  if (!Array.isArray(bands) || !BAND_COUNTS.includes(bands.length))
    return { valid: false, reason: 'Choose 3, 4, 5, or 6 bands.' };
  const slots = slotsFor(bands.length);
  const invalid = slots.findIndex((slot, i) => !slot.choices.includes(bands[i]));
  if (invalid !== -1)
    return { valid: false, reason: `Choose a valid ${slots[invalid].label.toLowerCase()} color.` };
  const digitCount = bands.length >= 5 ? 3 : 2;
  const digits = bands.slice(0, digitCount).map((color) => DIGITS.indexOf(color));
  const significant = Number(digits.join(''));
  const multiplier = multiplierFor(bands[digitCount]);
  const ohms = significant * multiplier;
  const tolerance = bands.length === 3 ? 20 : TOLERANCES[bands[digitCount + 1]];
  const tempco = bands.length === 6 ? TEMPERATURE_COEFFICIENTS[bands[5]] : null;
  return {
    valid: true,
    bands: [...bands],
    digits,
    significant,
    multiplier,
    ohms,
    tolerance,
    tempco,
    minimum: ohms * (1 - tolerance / 100),
    maximum: ohms * (1 + tolerance / 100),
  };
}

export function formatOhms(value) {
  if (!Number.isFinite(value)) return '— Ω';
  const units = [
    ['GΩ', 1e9],
    ['MΩ', 1e6],
    ['kΩ', 1e3],
    ['Ω', 1],
  ];
  const [unit, divisor] = units.find(([, factor]) => value >= factor) || units.at(-1);
  return `${Number((value / divisor).toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${unit}`;
}

export function formatMultiplier(value) {
  return `×${Number(value.toPrecision(6)).toLocaleString('en-US')}`;
}

// Only reverse automatically when the code is valid in one direction or band spacing
// makes the tolerance/temperature-coefficient end unambiguous.
export function orientBands(colors, positions = []) {
  if (!Array.isArray(colors) || !BAND_COUNTS.includes(colors.length))
    return { colors: [...colors], reversed: false, certain: false };
  const fits = (candidate) =>
    slotsFor(candidate.length).every(
      (slot, index) => !candidate[index] || slot.choices.includes(candidate[index]),
    );
  const forward = fits(colors);
  const reversedColors = [...colors].reverse();
  const backward = fits(reversedColors);
  if (!forward && backward) return { colors: reversedColors, reversed: true, certain: true };
  if (forward && !backward) return { colors: [...colors], reversed: false, certain: true };
  if (!forward && !backward) return { colors: [...colors], reversed: false, certain: false };
  if (colors.length === 3 || positions.length !== colors.length)
    return { colors: [...colors], reversed: false, certain: false };
  const gaps = positions.slice(1).map((p, i) => p - positions[i]);
  const first = gaps[0],
    last = gaps.at(-1);
  if (last > first * 1.65) return { colors: [...colors], reversed: false, certain: true };
  if (first > last * 1.65) return { colors: reversedColors, reversed: true, certain: true };
  return { colors: [...colors], reversed: false, certain: false };
}
