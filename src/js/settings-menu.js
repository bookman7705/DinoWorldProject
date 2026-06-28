/**
 * Settings overlay for the main view-mode menu (index.html).
 */
import { bindAltDownloadSourceCheckbox } from "./alt-download-settings.js";

export function initSettingsMenu({
  settingsBtnId = "settings-btn",
  settingsMenuId = "settings-menu",
  menuScreenSelector = ".menu-screen",
} = {}) {
  const settingsBtn = document.getElementById(settingsBtnId);
  const settingsMenu = document.getElementById(settingsMenuId);
  const menuScreen = document.querySelector(menuScreenSelector);

  if (!settingsBtn || !settingsMenu || !menuScreen) {
    return;
  }

  const closeBtn = settingsMenu.querySelector(".settings-close-btn");
  bindAltDownloadSourceCheckbox(document.getElementById("alt-download-source"));

  for (const [id, path] of [
    ["settings-about-link", "./about.html"],
    ["settings-opensource-link", "./opensource.html"]
  ]) {
    const link = document.getElementById(id);
    if (!link) {
      continue;
    }
    const url = new URL(path, window.location.href);
    url.search = window.location.search;
    link.href = url.toString();
  }

  let previousFocus = null;

  const setOpen = (open) => {
    settingsMenu.hidden = !open;
    settingsBtn.setAttribute("aria-expanded", open ? "true" : "false");
    menuScreen.classList.toggle("menu-screen--inactive", open);

    if (open) {
      menuScreen.setAttribute("inert", "");
    } else {
      menuScreen.removeAttribute("inert");
    }
  };

  const open = () => {
    previousFocus = document.activeElement;
    setOpen(true);
    document.addEventListener("keydown", onKeyDown);
    closeBtn?.focus();
  };

  const close = () => {
    setOpen(false);
    document.removeEventListener("keydown", onKeyDown);
    (previousFocus ?? settingsBtn).focus();
    previousFocus = null;
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      close();
    }
  };

  settingsBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  settingsMenu.addEventListener("click", (event) => {
    if (event.target === settingsMenu) {
      close();
    }
  });
}
