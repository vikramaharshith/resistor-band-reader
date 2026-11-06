import {
  BAND_COUNTS,
  COLOR_HEX,
  DIGITS,
  decodeBands,
  formatMultiplier,
  formatOhms,
  orientBands,
  slotsFor,
} from './core.mjs';
import { detectBands, sampleColorAt } from './scanner.mjs';

const $ = (id) => document.getElementById(id);
const video = $('video'),
  canvas = $('canvas'),
  view = $('view');
const context = canvas.getContext('2d', { willReadFrequently: true });
const preview = document.createElement('canvas');
const previewContext = preview.getContext('2d', { willReadFrequently: true });
const state = {
  count: 4,
  bands: Array(4).fill(''),
  stream: null,
  raw: null,
  axis: [],
  points: [],
  marking: false,
  generation: 0,
  imageRequest: 0,
  frameId: 0,
  lastFrame: 0,
  liveKey: '',
  liveStreak: 0,
  lastDetected: 0,
  source: 'manual',
};

function status(message) {
  $('status').textContent = message;
}
function label(color) {
  return color ? color[0].toUpperCase() + color.slice(1) : 'Unknown';
}

function renderResult() {
  const result = decodeBands(state.bands);
  $('value').textContent = result.valid ? formatOhms(result.ohms) : '— Ω';
  $('detail').textContent = result.valid
    ? `±${result.tolerance}% · ${formatOhms(result.minimum)} to ${formatOhms(result.maximum)}${result.tempco == null ? '' : ` · ${result.tempco} ppm/K`}`
    : result.reason;
  $('swatches').replaceChildren(
    ...state.bands.map((color, index) => {
      const swatch = document.createElement('i');
      swatch.className = 'swatch';
      swatch.style.background = COLOR_HEX[color] || '#243b35';
      swatch.title = `Band ${index + 1}: ${label(color)}`;
      swatch.setAttribute('aria-label', swatch.title);
      return swatch;
    }),
  );

  const steps = $('calculationSteps');
  steps.replaceChildren();
  if (!result.valid) {
    const item = document.createElement('li');
    item.textContent = 'Select each band color to see the calculation.';
    steps.append(item);
    return;
  }
  const digitColors = state.bands.slice(0, result.digits.length).map(label).join(', ');
  const lines = [
    `Digits: ${digitColors} → ${result.digits.join('')}.`,
    `Multiplier: ${label(state.bands[result.digits.length])} → ${formatMultiplier(result.multiplier)}.`,
    `${result.significant} ${formatMultiplier(result.multiplier)} = ${formatOhms(result.ohms)}.`,
    state.count === 3
      ? 'No tolerance band → ±20%.'
      : `Tolerance: ${label(state.bands[result.digits.length + 1])} → ±${result.tolerance}%.`,
    `Range: ${formatOhms(result.minimum)} to ${formatOhms(result.maximum)}.`,
  ];
  if (result.tempco != null)
    lines.push(`Temperature coefficient: ${label(state.bands[5])} → ${result.tempco} ppm/K.`);
  for (const line of lines) {
    const item = document.createElement('li');
    item.textContent = line;
    steps.append(item);
  }
}

function setSelectColor(select, color) {
  select.querySelector('option[data-invalid]')?.remove();
  if (color && !slotsFor(state.count)[Number(select.dataset.index)].choices.includes(color)) {
    const option = document.createElement('option');
    option.dataset.invalid = 'true';
    option.value = color;
    option.textContent = `${label(color)} (invalid for this band)`;
    select.append(option);
  }
  select.value = color;
}

function syncBandInputs() {
  $('bandInputs')
    .querySelectorAll('select')
    .forEach((select) => {
      setSelectColor(select, state.bands[Number(select.dataset.index)]);
    });
  renderResult();
}

function renderControls() {
  const slots = slotsFor(state.count);
  $('targetBand').replaceChildren(
    ...slots.map((_, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `Band ${index + 1}`;
      return option;
    }),
  );
  $('bandInputs').replaceChildren(
    ...slots.map((slot, index) => {
      const row = document.createElement('div');
      row.className = 'band-row';
      const number = document.createElement('span');
      number.textContent = String(index + 1);
      const select = document.createElement('select');
      select.dataset.index = String(index);
      select.setAttribute('aria-label', `Band ${index + 1}: ${slot.label}`);
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = `Choose ${slot.label.toLowerCase()} color`;
      select.append(placeholder);
      for (const color of slot.choices) {
        const option = document.createElement('option');
        option.value = color;
        option.textContent = label(color);
        select.append(option);
      }
      setSelectColor(select, state.bands[index]);
      row.append(number, select);
      return row;
    }),
  );
  for (const count of BAND_COUNTS) {
    const button = $(`bands${count}`);
    button.classList.toggle('active', state.count === count);
    button.setAttribute('aria-pressed', String(state.count === count));
  }
  $('bandNote').textContent =
    state.count === 3
      ? 'Two digits, multiplier; no tolerance band means ±20%.'
      : state.count === 4
        ? 'Two digits, multiplier, tolerance.'
        : state.count === 5
          ? 'Three digits, multiplier, tolerance.'
          : 'Three digits, multiplier, tolerance, temperature coefficient.';
  renderResult();
}

function stopCamera(message = '') {
  state.generation++;
  cancelAnimationFrame(state.frameId);
  state.frameId = 0;
  if (state.stream) {
    for (const track of state.stream.getTracks()) track.stop();
    state.stream = null;
  }
  video.pause();
  video.srcObject = null;
  view.classList.remove('live');
  view.classList.toggle('has-image', Boolean(state.raw));
  $('captureBtn').disabled = true;
  $('cameraBtn').textContent = 'Start camera';
  $('cameraBtn').disabled = false;
  $('modePill').textContent = state.raw ? 'Image' : 'Ready';
  state.liveKey = '';
  state.liveStreak = 0;
  if (message) status(message);
}

function applyScan(detection, source) {
  if (!detection) return false;
  const orientation = orientBands(detection.colors, detection.positions);
  const slots = slotsFor(state.count);
  const next = orientation.colors.map((color, index) =>
    slots[index].choices.includes(color) ? color : '',
  );
  state.bands = next;
  state.source = source;
  syncBandInputs();
  if (source === 'image') {
    state.points = orientation.reversed ? [...detection.points].reverse() : detection.points;
    paint(state.points);
  }
  const unresolved = next.filter((color) => !color).length;
  const note = unresolved
    ? `${unresolved} band color${unresolved === 1 ? '' : 's'} uncertain or invalid here. Use the menus or tap the image to correct.`
    : orientation.certain
      ? 'Bands detected. Verify colors before using the value.'
      : 'Bands detected; reading direction is uncertain. Check the order or use Reverse order.';
  status(note);
  return true;
}

function inspectFrame(now) {
  if (!state.stream) return;
  state.frameId = requestAnimationFrame(inspectFrame);
  if (
    document.hidden ||
    now - state.lastFrame < 240 ||
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  )
    return;
  state.lastFrame = now;
  const scale = Math.min(1, 640 / video.videoWidth);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  if (preview.width !== width || preview.height !== height) {
    preview.width = width;
    preview.height = height;
  }
  previewContext.drawImage(video, 0, 0, preview.width, preview.height);
  const image = previewContext.getImageData(0, 0, preview.width, preview.height);
  const detection = detectBands(
    image,
    { x: image.width * 0.16, y: image.height * 0.5 },
    { x: image.width * 0.84, y: image.height * 0.5 },
    state.count,
  );
  const key = detection ? detection.colors.join('|') : '';
  state.liveStreak = key && key === state.liveKey ? state.liveStreak + 1 : 1;
  state.liveKey = key;
  if (key && state.liveStreak >= 3) {
    state.lastDetected = now;
    if (state.source !== 'live' || state.bands.join('|') !== key) applyScan(detection, 'live');
  } else if (state.source === 'live' && now - state.lastDetected > 1500) {
    state.bands = Array(state.count).fill('');
    state.source = 'manual';
    syncBandInputs();
    status(
      'No reliable live reading. Hold the resistor in the guide, then capture or select colors manually.',
    );
  }
}

async function startCamera() {
  state.imageRequest++;
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    status('Camera access needs HTTPS or localhost. Upload a photo or select colors manually.');
    return;
  }
  const requestId = ++state.generation;
  $('cameraBtn').textContent = 'Starting…';
  $('cameraBtn').disabled = true;
  const options = [
    {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    { audio: false, video: true },
  ];
  let stream, error;
  for (const option of options) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(option);
      break;
    } catch (caught) {
      error = caught;
      if (!['OverconstrainedError', 'NotFoundError'].includes(caught.name)) break;
    }
  }
  if (requestId !== state.generation) {
    stream?.getTracks().forEach((track) => track.stop());
    return;
  }
  if (!stream) {
    stopCamera();
    status(
      error?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access or upload a photo.'
        : `Camera could not start${error?.message ? `: ${error.message}` : '.'} Try uploading a photo.`,
    );
    return;
  }
  try {
    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    if (requestId !== state.generation) return;
    stream
      .getVideoTracks()
      .forEach((track) =>
        track.addEventListener(
          'ended',
          () => stopCamera('Camera disconnected. Choose another image or restart it.'),
          { once: true },
        ),
      );
    state.raw = null;
    state.axis = [];
    state.points = [];
    state.marking = false;
    state.bands = Array(state.count).fill('');
    syncBandInputs();
    view.classList.remove('has-image');
    view.classList.add('live');
    $('captureBtn').disabled = false;
    $('cameraBtn').textContent = 'Stop camera';
    $('cameraBtn').disabled = false;
    $('modePill').textContent = 'Live';
    state.source = 'manual';
    state.lastDetected = performance.now();
    status(
      'Center the resistor horizontally in even light. A reading appears only after stable detection.',
    );
    state.frameId = requestAnimationFrame(inspectFrame);
  } catch (caught) {
    stopCamera();
    status(`Camera preview failed: ${caught.message}. Upload a photo instead.`);
  }
}

function paint(points = []) {
  if (!state.raw) return;
  context.putImageData(state.raw, 0, 0);
  context.lineWidth = Math.max(2, canvas.width / 500);
  context.strokeStyle = '#6bffb3';
  if (state.axis.length) {
    context.beginPath();
    context.moveTo(state.axis[0].x, state.axis[0].y);
    if (state.axis[1]) context.lineTo(state.axis[1].x, state.axis[1].y);
    context.stroke();
  }
  for (const [index, point] of points.entries()) {
    if (!point) continue;
    context.beginPath();
    context.arc(point.x, point.y, Math.max(7, canvas.width / 70), 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#fff';
    context.font = `bold ${Math.max(14, canvas.width / 55)}px sans-serif`;
    context.fillText(String(index + 1), point.x, point.y - Math.max(12, canvas.width / 60));
  }
}

function scanImage() {
  if (!state.raw) return;
  const { width, height } = state.raw;
  const start = state.axis[0] || { x: width * 0.16, y: height * 0.5 };
  const end = state.axis[1] || { x: width * 0.84, y: height * 0.5 };
  const detection = detectBands(state.raw, start, end, state.count);
  if (!applyScan(detection, 'image')) {
    state.bands = Array(state.count).fill('');
    state.source = 'image';
    state.points = [];
    syncBandInputs();
    paint();
    status(
      'No reliable band sequence found. Mark both ends of the colored body or select colors manually.',
    );
  }
}

function showImage(source, width, height) {
  state.axis = [];
  state.points = [];
  state.marking = false;
  state.bands = Array(state.count).fill('');
  canvas.width = width;
  canvas.height = height;
  context.drawImage(source, 0, 0, width, height);
  state.raw = context.getImageData(0, 0, width, height);
  stopCamera();
  state.source = 'image';
  view.classList.add('has-image');
  $('modePill').textContent = 'Image';
  syncBandInputs();
  scanImage();
}

async function openFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    status('Choose an image file.');
    return;
  }
  const requestId = ++state.imageRequest;
  stopCamera();
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    if (requestId === state.imageRequest)
      showImage(
        image,
        Math.round(image.naturalWidth * scale),
        Math.round(image.naturalHeight * scale),
      );
  } catch {
    if (requestId === state.imageRequest)
      status('Could not open that image. Choose another photo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

for (const count of BAND_COUNTS)
  $(`bands${count}`).addEventListener('click', () => {
    if (state.count === count) return;
    state.count = count;
    state.bands = Array(count).fill('');
    state.points = [];
    state.source = 'manual';
    renderControls();
    if (state.raw && !state.stream) scanImage();
  });

$('bandInputs').addEventListener('change', (event) => {
  if (!event.target.matches('select[data-index]')) return;
  state.imageRequest++;
  if (state.stream) stopCamera('Camera stopped so your manual color selection stays in place.');
  state.bands[Number(event.target.dataset.index)] = event.target.value;
  state.source = 'manual';
  renderResult();
});

$('cameraBtn').addEventListener('click', () =>
  state.stream ? stopCamera('Camera stopped.') : startCamera(),
);
$('captureBtn').addEventListener('click', () => {
  if (!state.stream || !video.videoWidth) return;
  state.imageRequest++;
  const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
  showImage(video, Math.round(video.videoWidth * scale), Math.round(video.videoHeight * scale));
});
$('uploadBtn').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  openFile(file);
});
$('reverseBtn').addEventListener('click', () => {
  state.imageRequest++;
  if (state.stream) stopCamera();
  state.bands.reverse();
  state.points.reverse();
  state.source = 'manual';
  syncBandInputs();
  if (state.raw) paint(state.points);
  status('Order reversed. Check the digit, tolerance, and temperature-coefficient bands.');
});
$('clearBtn').addEventListener('click', () => {
  state.imageRequest++;
  if (state.stream) stopCamera();
  state.bands = Array(state.count).fill('');
  state.points = [];
  state.source = 'manual';
  syncBandInputs();
  if (state.raw) paint();
  status('Band colors cleared.');
});
$('axisBtn').addEventListener('click', () => {
  if (!state.raw || state.stream) {
    status('Capture or upload an image first.');
    return;
  }
  state.axis = [];
  state.points = [];
  state.marking = true;
  paint();
  status('Tap both ends of the colored resistor body. Exclude the wires.');
});
canvas.addEventListener('click', (event) => {
  if (!state.raw || state.stream) return;
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const x = (event.clientX - rect.left - (rect.width - canvas.width * scale) / 2) / scale;
  const y = (event.clientY - rect.top - (rect.height - canvas.height * scale) / 2) / scale;
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
  if (state.marking) {
    state.axis.push({ x, y });
    paint();
    if (state.axis.length === 2) {
      state.marking = false;
      scanImage();
    } else status('Now tap the other end of the colored body.');
    return;
  }
  const position = Number($('targetBand').value);
  const color = sampleColorAt(state.raw, x, y);
  if (!color) {
    status('This pixel is ambiguous. Select the band color from its menu.');
    return;
  }
  if (!slotsFor(state.count)[position].choices.includes(color)) {
    status(
      `${label(color)} is not valid for band ${position + 1}. Choose its color from the menu.`,
    );
    return;
  }
  state.bands[position] = color;
  state.source = 'manual';
  syncBandInputs();
  $('targetBand').value = String(Math.min(state.count - 1, position + 1));
  state.points[position] = { x, y };
  paint(state.points);
  status(`Band ${position + 1}: ${label(color)}. Check the result against the resistor.`);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.stream) stopCamera('Camera stopped while the page was hidden.');
});
window.addEventListener('pagehide', () => stopCamera());
renderControls();
