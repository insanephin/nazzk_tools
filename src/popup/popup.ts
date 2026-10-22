import { getSettings, setSettings, type ChargeConfirmAction } from "../shared/settings";

const enabledInput = document.getElementById("enabled") as HTMLInputElement;
const chatSplitInput = document.getElementById("chatSplit") as HTMLInputElement;
const chargeConfirmSelect = document.getElementById("chargeConfirmAction") as HTMLSelectElement;

getSettings().then((settings) => {
  enabledInput.checked = settings.enabled;
  chatSplitInput.checked = settings.chatSplit;
  chargeConfirmSelect.value = settings.chargeConfirmAction;
});

enabledInput.addEventListener("change", () => {
  setSettings({ enabled: enabledInput.checked });
});

chatSplitInput.addEventListener("change", () => {
  setSettings({ chatSplit: chatSplitInput.checked });
});

chargeConfirmSelect.addEventListener("change", () => {
  setSettings({ chargeConfirmAction: chargeConfirmSelect.value as ChargeConfirmAction });
});
