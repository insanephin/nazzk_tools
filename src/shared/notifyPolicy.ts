export const NOTIFY_ATTR = "data-nazzk-toolkit-notify";

export interface NotifyPolicy {
  channels: Record<string, boolean | null>;
  ungrouped: boolean | null;
}
