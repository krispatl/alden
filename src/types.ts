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
  /** All curated chain variants for this label. */
  chains: string[][];
  /** Index of the currently displayed chain variant. */
  chainIndex: number;
  /** Timestamp (ms) of the last chain drift. */
  chainChangedAt: number;
  /** Poetic fragment for this object. */
  poem: string;
  createdAt: number;
  lastSeen: number;
}

/** A saved discovery persisted to localStorage. */
export interface Discovery {
  id: string;
  imageDataUrl: string;
  originalLabel: string;
  latentChain: string[];
  poeticText: string;
  createdAt: string;
}

/** Maps a bbox from video coordinates to on-screen (CSS pixel) coordinates. */
export type BBoxMapper = (bbox: BBox) => BBox;
