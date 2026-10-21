import { getSettings, setSettings, type ChargeConfirmAction } from "../shared/settings";

const enabledInput = document.getElementById("enabled") as HTMLInputElement;
const chargeConfirmSelect = document.getElementById("chargeConfirmAction") as HTMLSelectElement;

getSettings().then((settings) => {
  enabledInput.checked = settings.enabled;
  chargeConfirmSelect.value = settings.chargeConfirmAction;
});

enabledInput.addEventListener("change", () => {
  setSettings({ enabled: enabledInput.checked });
});

chargeConfirmSelect.addEventListener("change", () => {
  setSettings({ chargeConfirmAction: chargeConfirmSelect.value as ChargeConfirmAction });
});
