import { mountFollowingGroups, unmountFollowingGroups } from "./features/followingGroups";
import { mountChargeConfirm, unmountChargeConfirm } from "./features/chargeConfirm";
import { getSettings } from "./shared/settings";

async function apply(): Promise<void> {
  const settings = await getSettings();
  if (settings.enabled) mountFollowingGroups();
  else unmountFollowingGroups();
  if (settings.enabled && settings.chargeConfirmAction !== "none") mountChargeConfirm(settings.chargeConfirmAction);
  else unmountChargeConfirm();
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") apply();
});

apply();
