/** Shared types for Latent Space Explorer. */

/** Bounding box in source-video pixel coordinates: [x, y, width, height]. */
export type BBox = [number, number, number, number];

/** A detected object being tracked across detection frames. */
export interface TrackedObject {
  id: string;
  /** Raw COCO-SSD label, e.g. "cell phone". */
  label: string;
  confidence: number;
  /** Latest detection bbox in video coordinates. */
  bbox: BBox;
  /** Smoothed bbox used for rendering, in video coordinates. */
  smoothBBox: BBox;
  /** Current narrative fragment shown for this object. */
  fragment: string;
  /** Timestamp (ms) when the fragment last changed (drives typewriter). */
  fragmentChangedAt: number;
  /** Which encounter with this label this object was (1st chair, 2nd…). */
  encounter: number;
  createdAt: number;
  lastSeen: number;
}

/** A logged anomaly persisted to localStorage. */
export interface Discovery {
  id: string;
  imageDataUrl: string;
  label: string;
  entityId: string;
  fragment: string;
  /** Session-relative stamp, e.g. T+00:03:42. */
  sessionStamp: string;
  createdAt: string;
  /** True for the unlockable final entry written at the ending. */
  final?: boolean;
}

/** Maps a bbox from video coordinates to on-screen (CSS pixel) coordinates. */
export type BBoxMapper = (bbox: BBox) => BBox;
