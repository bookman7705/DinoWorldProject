import { MODEL_CREDITS, MODEL_CREDITS_CHANGES } from "./model-credits-data.js";
import {
  bindCreditsBackButton,
  createModelCreditCard,
  renderCreditCards
} from "./credits-ui.js";

bindCreditsBackButton();

const creditsListEl = document.getElementById("credits-list");

renderCreditCards(
  creditsListEl,
  MODEL_CREDITS.map((credit) => createModelCreditCard(credit, MODEL_CREDITS_CHANGES))
);
