/**
 * Modal model picker used in debug mode when launching a view without a QR code id.
 */
export function promptModelSelection(models, { title = "Select a model", showIds = false } = {}) {
  if (!models.length) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "model-picker-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", title);

    const panel = document.createElement("div");
    panel.className = "model-picker-panel";

    const heading = document.createElement("h2");
    heading.className = "model-picker-title";
    heading.textContent = title;

    const list = document.createElement("div");
    list.className = "model-picker-list";

    const cleanup = (result) => {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown);
      resolve(result);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        cleanup(null);
      }
    };

    for (const model of models) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-picker-option";
      const idMarkup = showIds
        ? `<span class="model-picker-option-id">${model.id}</span>`
        : "";
      button.innerHTML = `<span class="model-picker-option-label">${model.label}</span>${idMarkup}`;
      button.addEventListener("click", () => cleanup(model));
      list.appendChild(button);
    }

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "model-picker-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => cleanup(null));

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cleanup(null);
      }
    });

    panel.append(heading, list, cancelBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown);
    list.querySelector("button")?.focus();
  });
}
