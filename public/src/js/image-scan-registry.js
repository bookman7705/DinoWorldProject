/**
 * Combined MindAR target file (anchor index order below).
 * Tracker JPGs must be 512×512. After updating images:
 *   node scripts/compile-mind-targets.mjs
 *   node scripts/rebuild-image-scan-mind.mjs
 * Then bump IMAGE_SCAN_MIND_VERSION.
 */
import { localRepoAssetUrl } from "./asset-urls.js";
export const IMAGE_SCAN_TARGET_SIZE = 512;

/** Bump when tracker images or ImageScan.mind are recompiled (browser cache bust). */
export const IMAGE_SCAN_MIND_VERSION = 7;

export const COMBINED_MIND_URL = localRepoAssetUrl("mind/ImageScan.mind", IMAGE_SCAN_MIND_VERSION);

/**
 * Image-scan targets in MindAR anchor index order.
 * @type {Array<{
 *   id: string,
 *   targetIndex: number,
 *   trackerImageUrl: string,
 *   modelRotation: [number, number, number],
 *   modelPosition: [number, number, number],
 *   modelScale: number | [number, number, number] | null
 * }>}
 */

/**
 * @param {object} target
 * @param {object} [registryEntry]
 * @returns {[number, number, number]}
 */
export function resolveImageScanModelScale(target, registryEntry) {
  const scale = target.modelScale ?? registryEntry?.defaultScale ?? 0.1;
  if (Array.isArray(scale)) {
    return [scale[0], scale[1], scale[2]];
  }
  return [scale, scale, scale];
}

export const IMAGE_SCAN_TARGETS = [
  {
    id: "spinosaurus",
    targetIndex: 0,
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Spinosaurus.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 2
  },
  {
    id: "pterosaur",
    targetIndex: 1,
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Pterosaur.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1
  },
  {
    id: "rex",
    targetIndex: 2,
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Tyrannosaurus.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1
  },
  {
    id: "allosaurus",
    targetIndex: 3,
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Allosaurus.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1
  },
  {
    id: "anky",
    targetIndex: 4,
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Ankylosaurus.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 0.3
  },
  {
    id: "brachiosaur",
    targetIndex: 5,
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Brachiosaurus.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1
  },
  {
    id: "triceratop",
    targetIndex: 6,
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Triceratops.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1.25
  },
  {
    id: "raptor",
    targetIndex: 7,
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Velociraptor.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 2
  }
];
