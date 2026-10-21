import { mountFollowingGroups, unmountFollowingGroups } from "./features/followingGroups";
import { mountChargeConfirm, unmountChargeConfirm } from "./features/chargeConfirm";
import { mountHomeLayout, unmountHomeLayout } from "./features/homeLayout";
import { getSettings } from "./shared/settings";

async function apply(): Promise<void> {
  const settings = await getSettings();
  if (settings.enabled) mountFollowingGroups();
  else unmountFollowingGroups();
  if (settings.enabled) mountHomeLayout();
  else unmountHomeLayout();
  if (settings.enabled && settings.chargeConfirmAction !== "none") mountChargeConfirm(settings.chargeConfirmAction);
  else unmountChargeConfirm();
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") apply();
});

addEventListener("unhandledrejection", (e) => {
  if (!String(e.reason?.message ?? e.reason).includes("Extension context invalidated")) return;
  e.preventDefault();
  unmountFollowingGroups();
  unmountHomeLayout();
  unmountChargeConfirm();
});

apply();
