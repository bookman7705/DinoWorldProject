/**
 * Per-dinosaur MindAR targets. Each tracker JPG (512×512) compiles to its own .mind file.
 * Example: tracker_jpg/Mosasaurus.jpg → mind/mosa.mind
 *
 * Compile a target (MindAR CLI or scripts/compile-mind-targets.mjs), then bump
 * IMAGE_SCAN_MIND_VERSION when files change.
 */
import { localRepoAssetUrl } from "./asset-urls.js";

export const IMAGE_SCAN_TARGET_SIZE = 512;

/** Bump when any mind/*.mind file is recompiled (browser cache bust). */
export const IMAGE_SCAN_MIND_VERSION = 10;

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

export function imageScanMindUrl(target) {
  return localRepoAssetUrl(target.mindFile, IMAGE_SCAN_MIND_VERSION);
}

/**
 * @param {string | null | undefined} id
 * @returns {object | null}
 */
export function getImageScanTarget(id) {
  if (id == null) {
    return null;
  }

  const normalizedId = String(id).trim().toLowerCase();
  if (!normalizedId) {
    return null;
  }

  return IMAGE_SCAN_TARGETS.find((target) => target.id === normalizedId) ?? null;
}

/**
 * @type {Array<{
 *   id: string,
 *   mindFile: string,
 *   trackerImageUrl: string,
 *   modelRotation: [number, number, number],
 *   modelPosition: [number, number, number],
 *   modelScale: number | [number, number, number] | null
 * }>}
 */
export const IMAGE_SCAN_TARGETS = [
  {
    id: "mosa",
    mindFile: "mind/mosa.mind",
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Mosasaurus.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 2
  },
  {
    id: "pach",
    mindFile: "mind/pach.mind",
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Pachycephalosaurus.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1
  },
  {
    id: "rex",
    mindFile: "mind/rex.mind",
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Tyrannosaurus.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1
  },
  {
    id: "stega",
    mindFile: "mind/stega.mind",
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Stegosaurus.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1
  },
  {
    id: "styg",
    mindFile: "mind/styg.mind",
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Stygimoloch.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 0.3
  },
  {
    id: "bron",
    mindFile: "mind/bron.mind",
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Brontosaurus.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1
  },
  {
    id: "tric",
    mindFile: "mind/tric.mind",
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Triceratops.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1.25
  },
  {
    id: "raptor",
    mindFile: "mind/raptor.mind",
    trackerImageUrl: localRepoAssetUrl("tracker_jpg/Velociraptor.jpg", IMAGE_SCAN_MIND_VERSION),
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 2
  }
];
