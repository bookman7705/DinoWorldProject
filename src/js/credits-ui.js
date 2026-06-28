import { buildMenuBackUrl } from "./menu-navigation.js";

export function bindCreditsBackButton(buttonId = "back-btn") {
  const backBtn = document.getElementById(buttonId);
  backBtn?.addEventListener("click", () => {
    window.location.href = buildMenuBackUrl(window.location.search).toString();
  });
}

export function createExternalLink(href, text) {
  const link = document.createElement("a");
  link.className = "credit-link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = text;
  return link;
}

export function createDetailRow(label, value) {
  const row = document.createElement("div");
  row.className = "credit-row";

  const term = document.createElement("dt");
  term.className = "credit-label";
  term.textContent = `${label}:`;

  const description = document.createElement("dd");
  description.className = "credit-value";

  if (value instanceof HTMLElement) {
    description.appendChild(value);
  } else {
    description.textContent = value;
  }

  row.appendChild(term);
  row.appendChild(description);
  return row;
}

export function createModelCreditCard(credit, changesText) {
  const card = document.createElement("article");
  card.className = "credit-card";

  const title = document.createElement("h2");
  title.className = "credit-card-title";
  title.textContent = credit.modelName;
  card.appendChild(title);

  const details = document.createElement("dl");
  details.className = "credit-details";
  details.appendChild(createDetailRow("Creator", credit.creators));
  details.appendChild(
    createDetailRow(
      "Source",
      createExternalLink(credit.sourceUrl, "View on Sketchfab")
    )
  );
  details.appendChild(
    createDetailRow(
      "License",
      createExternalLink(credit.licenseUrl, credit.license)
    )
  );
  details.appendChild(createDetailRow("Changes", changesText));
  card.appendChild(details);

  return card;
}

function getSoftwareNoticeText(entry) {
  if (entry.notice) {
    return entry.notice;
  }

  if (entry.requiresAttribution) {
    return "Copyright and license notice must be preserved in distributions. See the linked license.";
  }

  return "";
}

export function createSoftwareCreditCard(entry) {
  const card = document.createElement("article");
  card.className = "credit-card";

  const title = document.createElement("h2");
  title.className = "credit-card-title";
  title.textContent = entry.name;
  card.appendChild(title);

  const details = document.createElement("dl");
  details.className = "credit-details";

  if (entry.version) {
    details.appendChild(createDetailRow("Version", entry.version));
  }

  details.appendChild(
    createDetailRow(
      "License",
      createExternalLink(entry.licenseUrl, entry.license)
    )
  );

  if (entry.projectUrl) {
    details.appendChild(
      createDetailRow(
        "Project",
        createExternalLink(entry.projectUrl, "Project website")
      )
    );
  }

  const noticeText = getSoftwareNoticeText(entry);
  if (noticeText) {
    details.appendChild(createDetailRow("Notice", noticeText));
  }

  card.appendChild(details);
  return card;
}

export function renderCreditCards(container, cards) {
  container.replaceChildren(...cards);
}
