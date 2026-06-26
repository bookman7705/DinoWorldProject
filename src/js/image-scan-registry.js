/**
 * Per-dinosaur MindAR targets. Each tracker JPG (512×512) compiles to its own .mind file.
 * Example: tracker_jpg/Mosasaurus.jpg → mind/mosa.mind
 */
import { localRepoAssetUrl } from "./asset-urls.js";

export const IMAGE_SCAN_TARGET_SIZE = 512;

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

export function imageScanMindSrc(target) {
  return localRepoAssetUrl(target.mindFile);
}

export function imageScanTrackerSrc(target) {
  return localRepoAssetUrl(target.trackerJpg);
}

async function repoAssetExists(relativePath) {
  const url = localRepoAssetUrl(relativePath);

  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) {
      return true;
    }
  } catch {
    // fall through to GET probe
  }

  try {
    const get = await fetch(url, { method: "GET", cache: "no-store" });
    return get.ok;
  } catch {
    return false;
  }
}

/**
 * @param {object} target
 * @param {{ debug?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, missing: string[], message: string | null }>}
 */
export async function validateImageScanTargetAssets(target, { debug = false } = {}) {
  const checks = [
    { kind: ".mind", path: target.mindFile },
    { kind: ".jpg", path: target.trackerJpg }
  ];

  const missing = [];

  for (const { kind, path } of checks) {
    if (!(await repoAssetExists(path))) {
      missing.push(`${path} (${kind})`);
    }
  }

  const message =
    missing.length > 0
      ? `Missing image-scan assets for ${target.id}: ${missing.join(", ")}`
      : null;

  if (message && debug) {
    console.warn("[image-scan]", message);
  }

  return { ok: missing.length === 0, missing, message };
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
 *   trackerJpg: string,
 *   modelRotation: [number, number, number],
 *   modelPosition: [number, number, number],
 *   modelScale: number | [number, number, number] | null
 * }>}
 */
export const IMAGE_SCAN_TARGETS = [
  {
    id: "mosa",
    mindFile: "mind/bron.mind",
    trackerJpg: "tracker_jpg/Mosasaurus.jpg",
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 2
  },
  {
    id: "pach",
    mindFile: "mind/bron.mind",
    trackerJpg: "tracker_jpg/Pachycephalosaurus.jpg",
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1
  },
  {
    id: "rex",
    mindFile: "mind/bron.mind",
    trackerJpg: "tracker_jpg/Tyrannosaurus.jpg",
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 1
  },
  {
    id: "stega",
    mindFile: "mind/bron.mind",
    trackerJpg: "tracker_jpg/Stegosaurus.jpg",
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 2.5
  },
  {
    id: "styg",
    mindFile: "mind/bron.mind",
    trackerJpg: "tracker_jpg/Stygimoloch.jpg",
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 4
  },
  {
    id: "bron",
    mindFile: "mind/bron.mind",
    trackerJpg: "tracker_jpg/Brontosaurus.jpg",
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 2
  },
  {
    id: "tric",
    mindFile: "mind/bron.mind",
    trackerJpg: "tracker_jpg/Triceratops.jpg",
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 3
  },
  {
    id: "raptor",
    mindFile: "mind/bron.mind",
    trackerJpg: "tracker_jpg/Velociraptor.jpg",
    modelRotation: [Math.PI / 2, 0, 0],
    modelPosition: [0, 0, 0],
    modelScale: 0.34
  }
];
