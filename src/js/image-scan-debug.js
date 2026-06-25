import { imageScanMindSrc, imageScanTrackerSrc } from "./image-scan-registry.js";
import { localRepoAssetUrl } from "./asset-urls.js";

const LOG_PREFIX = "[image-scan-debug]";

function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {string} relativePath
 * @returns {Promise<{
 *   path: string,
 *   url: string,
 *   ok: boolean,
 *   status: number | null,
 *   contentType: string | null,
 *   bytes: number | null,
 *   error: string | null
 * }>}
 */
export async function probeRepoAsset(relativePath) {
  const url = localRepoAssetUrl(relativePath);
  const result = {
    path: relativePath,
    url,
    ok: false,
    status: null,
    contentType: null,
    bytes: null,
    error: null
  };

  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    result.status = response.status;
    result.contentType = response.headers.get("content-type");
    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader) {
      result.bytes = Number(lengthHeader);
    }

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    if (result.bytes == null) {
      const blob = await response.blob();
      result.bytes = blob.size;
      if (!result.contentType) {
        result.contentType = blob.type || null;
      }
    }

    result.ok = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * @param {object} target
 */
export async function probeImageScanTarget(target) {
  const [mind, tracker] = await Promise.all([
    probeRepoAsset(target.mindFile),
    probeRepoAsset(target.trackerJpg)
  ]);

  return {
    targetId: target.id,
    mindUrl: imageScanMindSrc(target),
    trackerUrl: imageScanTrackerSrc(target),
    mind,
    tracker,
    allOk: mind.ok && tracker.ok
  };
}

function getMindarVideo(mindarThree, container) {
  if (mindarThree?.video) {
    return mindarThree.video;
  }

  return container?.querySelector("video") ?? null;
}

function getCameraFacingLabel(mindarThree) {
  if (mindarThree?.shouldFaceUser) {
    return "user (front)";
  }
  return "environment (back)";
}

function getVideoState(video) {
  if (!video) {
    return { present: false };
  }

  return {
    present: true,
    width: video.videoWidth || 0,
    height: video.videoHeight || 0,
    readyState: video.readyState,
    paused: video.paused,
    ended: video.ended,
    muted: video.muted,
    playing: !video.paused && !video.ended && video.readyState >= 2
  };
}

function getAnchorState(anchor) {
  if (!anchor) {
    return { present: false };
  }

  return {
    present: true,
    visible: Boolean(anchor.visible),
    childCount: anchor.group?.children?.length ?? 0
  };
}

function getTrackerState(mindarThree) {
  const controller = mindarThree?.controller;
  if (!controller) {
    return { present: false };
  }

  const input = controller.input;
  const dims =
    input && typeof input.width === "number" && typeof input.height === "number"
      ? `${input.width}×${input.height}`
      : null;

  return {
    present: true,
    processing: Boolean(controller.processingVideo),
    inputDims: dims
  };
}

function formatAssetLine(label, probe) {
  if (!probe) {
    return `${label}: not probed`;
  }
  if (probe.ok) {
    return `${label}: OK ${probe.status ?? ""} ${formatBytes(probe.bytes)} ${probe.contentType ?? ""}`.trim();
  }
  return `${label}: FAIL ${probe.error ?? probe.status ?? "unknown"}`;
}

/**
 * Live debug overlay for image-scan sessions.
 * @param {{ mount?: HTMLElement }} [options]
 */
export function createImageScanDebugMonitor({ mount = document.body } = {}) {
  const panel = document.createElement("aside");
  panel.className = "scan-debug-panel";
  panel.hidden = true;
  panel.setAttribute("aria-live", "polite");

  const title = document.createElement("p");
  title.className = "scan-debug-title";
  title.textContent = "Image scan debug";

  const body = document.createElement("pre");
  body.className = "scan-debug-body";

  panel.append(title, body);
  mount.append(panel);

  let active = false;
  let lastConsoleLogAt = 0;
  let getSnapshot = () => ({});

  function render() {
    if (!active) {
      return;
    }

    const snap = getSnapshot();
    const lines = [];

    lines.push(`phase: ${snap.phase ?? "—"}`);
    lines.push(`elapsed: ${snap.elapsedSec ?? "—"}s`);
    lines.push(`target: ${snap.targetId ?? "—"}`);
    lines.push(`model: ${snap.modelFile ?? "—"} ${snap.modelLoaded ? "(loaded)" : "(not loaded)"}`);
    lines.push(`secure: ${snap.isSecureContext ? "yes" : "NO"}`);
    lines.push(`protocol: ${snap.protocol ?? "—"}`);
    lines.push(`camera: ${snap.cameraFacing ?? "—"}`);
    lines.push("");

    lines.push(formatAssetLine(".mind", snap.assetProbe?.mind));
    if (snap.assetProbe?.mind?.url) {
      lines.push(`  ${snap.assetProbe.mind.url}`);
    }
    lines.push(formatAssetLine(".jpg", snap.assetProbe?.tracker));
    if (snap.assetProbe?.tracker?.url) {
      lines.push(`  ${snap.assetProbe.tracker.url}`);
    }
    lines.push("");

    const video = snap.video ?? {};
    if (!video.present) {
      lines.push("video: missing");
    } else {
      lines.push(
        `video: ${video.width}×${video.height} ready=${video.readyState} playing=${video.playing ? "yes" : "no"}`
      );
    }

    const tracker = snap.tracker ?? {};
    if (tracker.present) {
      lines.push(
        `tracker: processing=${tracker.processing ? "yes" : "no"} input=${tracker.inputDims ?? "—"}`
      );
    } else {
      lines.push("tracker: not ready");
    }

    const anchorState = snap.anchor ?? {};
    lines.push(
      `anchor: visible=${anchorState.visible ? "YES" : "no"} children=${anchorState.childCount ?? 0}`
    );
    lines.push(`events: found=${snap.foundCount ?? 0} lost=${snap.lostCount ?? 0}`);

    if (snap.lastError) {
      lines.push("");
      lines.push(`error: ${snap.lastError}`);
    }

    body.textContent = lines.join("\n");

    const now = performance.now();
    if (now - lastConsoleLogAt > 5000) {
      lastConsoleLogAt = now;
      console.log(LOG_PREFIX, snap);
    }

    requestAnimationFrame(render);
  }

  return {
    show() {
      active = true;
      panel.hidden = false;
      requestAnimationFrame(render);
    },

    hide() {
      active = false;
      panel.hidden = true;
    },

    dispose() {
      this.hide();
      panel.remove();
    },

  /**
   * @param {() => object} fn
   */
    setSnapshotProvider(fn) {
      getSnapshot = fn;
    },

    log(message, data) {
      console.log(LOG_PREFIX, message, data ?? "");
    }
  };
}

/**
 * @param {object} params
 */
export function buildScanDebugSnapshot({
  phase,
  sessionStartedAt,
  target,
  entry,
  modelLoaded,
  mindarThree,
  anchor,
  container,
  assetProbe,
  foundCount,
  lostCount,
  lastError
}) {
  const elapsedSec =
    sessionStartedAt != null
      ? ((performance.now() - sessionStartedAt) / 1000).toFixed(1)
      : null;

  return {
    phase,
    elapsedSec,
    targetId: target?.id ?? null,
    modelFile: entry?.modelFile ?? null,
    modelLoaded: Boolean(modelLoaded),
    isSecureContext: window.isSecureContext,
    protocol: window.location.protocol,
    cameraFacing: mindarThree ? getCameraFacingLabel(mindarThree) : null,
    assetProbe,
    video: getVideoState(getMindarVideo(mindarThree, container)),
    tracker: getTrackerState(mindarThree),
    anchor: getAnchorState(anchor),
    foundCount,
    lostCount,
    lastError: lastError ?? null
  };
}
