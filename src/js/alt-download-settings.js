const STORAGE_KEY = "dino-world-alt-download-source";

export function isAltDownloadSourceEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAltDownloadSourceEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

export function bindAltDownloadSourceCheckbox(checkbox) {
  if (!checkbox) {
    return;
  }

  checkbox.checked = isAltDownloadSourceEnabled();
  checkbox.addEventListener("change", () => {
    setAltDownloadSourceEnabled(checkbox.checked);
  });
}
