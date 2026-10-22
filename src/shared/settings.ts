export type ChargeConfirmAction = "none" | "cancel" | "donate";

export interface Settings {
  enabled: boolean;
  chargeConfirmAction: ChargeConfirmAction;
  chatSplit: boolean;
}

const DEFAULT_SETTINGS: Settings = { enabled: true, chargeConfirmAction: "cancel", chatSplit: true };

export async function getSettings(): Promise<Settings> {
  return (await chrome.storage.sync.get(DEFAULT_SETTINGS)) as Settings;
}

export function setSettings(patch: Partial<Settings>): Promise<void> {
  return chrome.storage.sync.set(patch);
}
