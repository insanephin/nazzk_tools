import { mountFollowingGroups, unmountFollowingGroups } from "./features/followingGroups";
import { mountChargeConfirm, unmountChargeConfirm } from "./features/chargeConfirm";
import { mountChatSplit, unmountChatSplit } from "./features/chatSplit";
import { mountHomeLayout, unmountHomeLayout } from "./features/homeLayout";
import { getSettings, type Settings } from "./shared/settings";

const FEATURES: { on: (s: Settings) => boolean; mount: (s: Settings) => void; unmount: () => void }[] = [
  { on: () => true, mount: mountFollowingGroups, unmount: unmountFollowingGroups },
  { on: () => true, mount: mountHomeLayout, unmount: unmountHomeLayout },
  {
    on: (s) => s.chargeConfirmAction !== "none",
    mount: (s) => mountChargeConfirm(s.chargeConfirmAction),
    unmount: unmountChargeConfirm,
  },
  { on: (s) => s.chatSplit, mount: mountChatSplit, unmount: unmountChatSplit },
];

async function apply(): Promise<void> {
  const settings = await getSettings();
  for (const f of FEATURES) {
    if (settings.enabled && f.on(settings)) f.mount(settings);
    else f.unmount();
  }
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") apply();
});

addEventListener("unhandledrejection", (e) => {
  if (!String(e.reason?.message ?? e.reason).includes("Extension context invalidated")) return;
  e.preventDefault();
  for (const f of FEATURES) f.unmount();
});

apply();
