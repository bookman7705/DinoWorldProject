export function formatDownloadFileLabel(fileIndex, fileCount) {
  return `Downloading files ${fileIndex}/${fileCount}`;
}

/**
 * Full-screen download progress overlay (mirrors download.html progress UX).
 */
export function createAltDownloadProgress({ fileIndex = 1, fileCount = 1 } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "alt-download-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-busy", "true");

  const panel = document.createElement("div");
  panel.className = "alt-download-panel";

  const labelEl = document.createElement("p");
  labelEl.className = "alt-download-label";
  labelEl.textContent = formatDownloadFileLabel(fileIndex, fileCount);

  const progressEl = document.createElement("progress");
  progressEl.className = "alt-download-progress";
  progressEl.value = 0;
  progressEl.max = 100;

  const percentEl = document.createElement("p");
  percentEl.className = "alt-download-percent";
  percentEl.textContent = "0%";

  panel.append(labelEl, progressEl, percentEl);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  return {
    setFileProgress(index, total) {
      labelEl.textContent = formatDownloadFileLabel(index, total);
    },

    update({ received, total, percent }) {
      if (total > 0 && percent != null) {
        progressEl.value = percent;
        percentEl.textContent = `${percent}%`;
        return;
      }

      progressEl.removeAttribute("value");
      percentEl.textContent = `${(received / 1024 / 1024).toFixed(2)} MB`;
    },

    close() {
      overlay.remove();
    }
  };
}
