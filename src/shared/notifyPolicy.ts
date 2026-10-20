export const NOTIFY_ATTR = "data-chzzk-tools-notify";

export interface NotifyPolicy {
  channels: Record<string, boolean | null>;
  ungrouped: boolean | null;
}
