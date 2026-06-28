import { OPEN_SOURCE_SOFTWARE } from "./opensource-credits-data.js";
import {
  bindCreditsBackButton,
  createSoftwareCreditCard,
  renderCreditCards
} from "./credits-ui.js";

bindCreditsBackButton();

const softwareListEl = document.getElementById("software-list");

renderCreditCards(
  softwareListEl,
  OPEN_SOURCE_SOFTWARE.map((entry) => createSoftwareCreditCard(entry))
);
