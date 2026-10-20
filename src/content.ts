import { mountFollowingGroups, unmountFollowingGroups } from "./features/followingGroups";
import { getSettings } from "./shared/settings";

async function apply(): Promise<void> {
  if ((await getSettings()).enabled) mountFollowingGroups();
  else unmountFollowingGroups();
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") apply();
});

apply();
