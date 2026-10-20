import { getSettings, setSettings } from "../shared/settings";

const enabledInput = document.getElementById("enabled") as HTMLInputElement;

getSettings().then((settings) => {
  enabledInput.checked = settings.enabled;
});

enabledInput.addEventListener("change", () => {
  setSettings({ enabled: enabledInput.checked });
});
