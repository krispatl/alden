/**
 * YOLO-family detector via ONNX Runtime Web — model-agnostic.
 *
 * Drop any YOLOv8/v9/v10/v11-style ONNX export into /public/models/ and
 * point MODEL_URL at it. The loader auto-detects:
 *   - output layout [1, 4+C, N] or transposed [1, N, 4+C]
 *   - class count C (labels beyond COCO-80 render as "entity NN")
 * Execution: tries WebGPU first, falls back to WASM automatically.
 * Model download reports progress for the loader UI.
 */

import type { BBox } from './types';

export interface Prediction {
  label: string;
  score: number;
  bbox: BBox; // video-pixel coords
}

/** Swap this line when you drop in a different model. */
const MODEL_URL = '/models/yolov8n.onnx';

const INPUT_SIZE = 640;
const CONF_THRESHOLD = 0.45;
const NMS_IOU = 0.45;
const MAX_DETECTIONS = 12;

export const CLASS_NAMES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
  'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
  'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
  'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
  'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
  'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
  'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
  'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
  'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
  'hair drier', 'toothbrush',
];

type Ort = typeof import('onnxruntime-web');

let ort: Ort | null = null;
let session: import('onnxruntime-web').InferenceSession | null = null;
let inputName = 'images';
let outputName = 'output0';
/** 'cn' = [1, 4+C, N]; 'nc' = [1, N, 4+C]. Resolved on first inference. */
let layout: 'cn' | 'nc' | null = null;

const prep = document.createElement('canvas');
prep.width = INPUT_SIZE;
prep.height = INPUT_SIZE;
const prepCtx = prep.getContext('2d', { willReadFrequently: true })!;

/** Downloads the model with progress, then creates the session. */
export async function loadDetector(onProgress?: (pct: number) => void): Promise<void> {
  if (session) return;
  ort = await import('onnxruntime-web');

  const buffer = await fetchWithProgress(MODEL_URL, onProgress);

  // WebGPU where available (much faster on modern phones), else WASM.
  for (const providers of [['webgpu', 'wasm'], ['wasm']] as const) {
    try {
      session = await ort.InferenceSession.create(buffer, {
        executionProviders: [...providers],
        graphOptimizationLevel: 'all',
      });
      break;
    } catch {
      session = null;
    }
  }
  if (!session) throw new Error('Could not initialize the detector.');
  inputName = session.inputNames[0] ?? inputName;
  outputName = session.outputNames[0] ?? outputName;
}

async function fetchWithProgress(url: string, onProgress?: (pct: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model fetch failed: ${res.status}`);
  const total = Number(res.headers.get('Content-Length')) || 0;
  if (!res.body || !total) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress?.(100);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(Math.round((received / total) * 100));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

/** Runs one detection pass on the current video frame. */
export async function detect(video: HTMLVideoElement): Promise<Prediction[]> {
  if (!session || !ort || video.readyState < 2) return [];
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return [];

  // Letterbox into the square input.
  const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh);
  const dw = Math.round(vw * scale);
  const dh = Math.round(vh * scale);
  const padX = (INPUT_SIZE - dw) / 2;
  const padY = (INPUT_SIZE - dh) / 2;

  prepCtx.fillStyle = '#727272';
  prepCtx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  prepCtx.drawImage(video, padX, padY, dw, dh);
  const { data } = prepCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

  const px = INPUT_SIZE * INPUT_SIZE;
  const input = new Float32Array(3 * px);
  for (let i = 0; i < px; i++) {
    input[i] = data[i * 4] / 255;
    input[i + px] = data[i * 4 + 1] / 255;
    input[i + 2 * px] = data[i * 4 + 2] / 255;
  }

  const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const results = await session.run({ [inputName]: tensor });
  const out = results[outputName];
  const d = out.data as Float32Array;
  const dims = out.dims as number[]; // [1, A, B]

  // Resolve layout once: the channel axis (4+C) is the smaller one.
  if (!layout) layout = dims[1] <= dims[2] ? 'cn' : 'nc';
  const channels = layout === 'cn' ? dims[1] : dims[2];
  const anchors = layout === 'cn' ? dims[2] : dims[1];
  const numClasses = channels - 4;
  const at = layout === 'cn'
    ? (c: number, i: number) => d[c * anchors + i]
    : (c: number, i: number) => d[i * channels + c];

  const boxes: Array<{ bbox: BBox; score: number; cls: number }> = [];
  for (let i = 0; i < anchors; i++) {
    let best = 0;
    let bestC = -1;
    for (let c = 0; c < numClasses; c++) {
      const s = at(4 + c, i);
      if (s > best) { best = s; bestC = c; }
    }
    if (best < CONF_THRESHOLD) continue;

    const cx = at(0, i), cy = at(1, i), w = at(2, i), h = at(3, i);
    const x = (cx - w / 2 - padX) / scale;
    const y = (cy - h / 2 - padY) / scale;
    boxes.push({
      bbox: [
        Math.max(0, x),
        Math.max(0, y),
        Math.min(vw - Math.max(0, x), w / scale),
        Math.min(vh - Math.max(0, y), h / scale),
      ],
      score: best,
      cls: bestC,
    });
  }

  boxes.sort((a, b) => b.score - a.score);
  const kept: typeof boxes = [];
  for (const box of boxes) {
    if (kept.length >= MAX_DETECTIONS) break;
    let keep = true;
    for (const k of kept) {
      if (k.cls === box.cls && iou(k.bbox, box.bbox) > NMS_IOU) { keep = false; break; }
    }
    if (keep) kept.push(box);
  }

  return kept.map((b) => ({
    label: CLASS_NAMES[b.cls] ?? `entity ${b.cls}`,
    score: b.score,
    bbox: b.bbox,
  }));
}

function iou(a: BBox, b: BBox): number {
  const ix = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}
