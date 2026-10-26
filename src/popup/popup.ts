import { getSettings, setSettings, type ChargeConfirmAction } from "../shared/settings";

// Each checkbox id matches its settings key.
const SWITCHES = ["enabled", "chatSplit", "cafePopup", "cafeMobileRedirect"] as const;
const chargeConfirmSelect = document.getElementById("chargeConfirmAction") as HTMLSelectElement;

getSettings().then((settings) => {
  for (const key of SWITCHES) (document.getElementById(key) as HTMLInputElement).checked = settings[key];
  chargeConfirmSelect.value = settings.chargeConfirmAction;
});

for (const key of SWITCHES) {
  const input = document.getElementById(key) as HTMLInputElement;
  input.addEventListener("change", () => setSettings({ [key]: input.checked }));
}

chargeConfirmSelect.addEventListener("change", () => {
  setSettings({ chargeConfirmAction: chargeConfirmSelect.value as ChargeConfirmAction });
});
