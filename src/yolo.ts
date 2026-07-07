/**
 * YOLOv8-nano via ONNX Runtime Web.
 *
 * Input:  float32 [1,3,640,640], RGB 0-1, letterboxed
 * Output: float32 [1,84,8400] — cx,cy,w,h + 80 class scores per anchor
 *
 * The model file ships in /public/models/yolov8n.onnx (~12.8 MB, cached by
 * the browser after first load). The ORT WASM binary is bundled by Vite,
 * so deploys are fully self-contained.
 */

import type { BBox } from './types';

export interface Prediction {
  label: string;
  score: number;
  /** bbox in source-video pixel coordinates */
  bbox: BBox;
}

const MODEL_URL = '/models/yolov8n.onnx';
const INPUT_SIZE = 640;
const CONF_THRESHOLD = 0.45;
const NMS_IOU = 0.45;
const MAX_DETECTIONS = 12;

/** COCO-80 class names, index-aligned with YOLOv8 outputs. */
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

type OrtModule = typeof import('onnxruntime-web');

let ort: OrtModule | null = null;
let session: import('onnxruntime-web').InferenceSession | null = null;
let inputName = 'images';
let outputName = 'output0';

const prep = document.createElement('canvas');
prep.width = INPUT_SIZE;
prep.height = INPUT_SIZE;
const prepCtx = prep.getContext('2d', { willReadFrequently: true })!;

/** Loads ONNX Runtime + the YOLO model once. Safe to call repeatedly. */
export async function loadDetector(): Promise<void> {
  if (session) return;
  ort = await import('onnxruntime-web');
  session = await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  inputName = session.inputNames[0] ?? inputName;
  outputName = session.outputNames[0] ?? outputName;
}

/** Runs one detection pass on the current video frame. */
export async function detect(video: HTMLVideoElement): Promise<Prediction[]> {
  if (!session || !ort || video.readyState < 2) return [];

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return [];

  // Letterbox the frame into a 640×640 square.
  const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh);
  const dw = Math.round(vw * scale);
  const dh = Math.round(vh * scale);
  const padX = (INPUT_SIZE - dw) / 2;
  const padY = (INPUT_SIZE - dh) / 2;

  prepCtx.fillStyle = '#727272';
  prepCtx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  prepCtx.drawImage(video, padX, padY, dw, dh);
  const { data } = prepCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

  // HWC uint8 → CHW float32, 0-1.
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
  const outData = out.data as Float32Array;
  const [, channels, anchors] = out.dims as number[]; // [1, 84, 8400]
  const numClasses = channels - 4;

  // Decode: per anchor, best class score.
  const boxes: Array<{ bbox: BBox; score: number; cls: number }> = [];
  for (let i = 0; i < anchors; i++) {
    let best = 0;
    let bestC = -1;
    for (let c = 0; c < numClasses; c++) {
      const s = outData[(4 + c) * anchors + i];
      if (s > best) {
        best = s;
        bestC = c;
      }
    }
    if (best < CONF_THRESHOLD) continue;

    const cx = outData[i];
    const cy = outData[anchors + i];
    const w = outData[2 * anchors + i];
    const h = outData[3 * anchors + i];

    // Letterbox space → video space.
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

  // Per-class NMS.
  boxes.sort((a, b) => b.score - a.score);
  const kept: typeof boxes = [];
  for (const box of boxes) {
    if (kept.length >= MAX_DETECTIONS) break;
    let keep = true;
    for (const k of kept) {
      if (k.cls === box.cls && iou(k.bbox, box.bbox) > NMS_IOU) {
        keep = false;
        break;
      }
    }
    if (keep) kept.push(box);
  }

  return kept.map((b) => ({
    label: CLASS_NAMES[b.cls] ?? 'artifact',
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
