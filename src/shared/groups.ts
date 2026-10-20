export interface Group {
  id: string;
  name: string;
  channelIds: string[];
  collapsed: boolean;
  notify?: boolean;
}

const KEY = "groups";
const UNGROUPED_NOTIFY_KEY = "ungroupedNotify";
const UNGROUPED_ORDER_KEY = "ungroupedOrder";
const KNOWN_KEY = "knownChannels";

export async function getGroups(): Promise<Group[]> {
  const data = await chrome.storage.local.get({ [KEY]: [] });
  return data[KEY] as Group[];
}

export function setGroups(groups: Group[]): Promise<void> {
  return chrome.storage.local.set({ [KEY]: groups });
}

export function onGroupsChanged(callback: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (KEY in changes || UNGROUPED_NOTIFY_KEY in changes || UNGROUPED_ORDER_KEY in changes)) callback();
  });
}

export async function getUngroupedNotify(): Promise<boolean | undefined> {
  const data = await chrome.storage.local.get(UNGROUPED_NOTIFY_KEY);
  return data[UNGROUPED_NOTIFY_KEY] as boolean | undefined;
}

export function setUngroupedNotify(notify: boolean | undefined): Promise<void> {
  return notify === undefined
    ? chrome.storage.local.remove(UNGROUPED_NOTIFY_KEY)
    : chrome.storage.local.set({ [UNGROUPED_NOTIFY_KEY]: notify });
}

export async function getUngroupedOrder(): Promise<string[]> {
  const data = await chrome.storage.local.get({ [UNGROUPED_ORDER_KEY]: [] });
  return data[UNGROUPED_ORDER_KEY] as string[];
}

export function setUngroupedOrder(channelIds: string[]): Promise<void> {
  return chrome.storage.local.set({ [UNGROUPED_ORDER_KEY]: channelIds });
}

export async function getKnownChannels(): Promise<string[] | null> {
  const data = await chrome.storage.local.get(KNOWN_KEY);
  return (data[KNOWN_KEY] as string[] | undefined) ?? null;
}

export function setKnownChannels(channelIds: string[]): Promise<void> {
  return chrome.storage.local.set({ [KNOWN_KEY]: channelIds });
}

export function createGroup(groups: Group[], name: string): Group[] {
  return [...groups, { id: crypto.randomUUID(), name, channelIds: [], collapsed: false }];
}

export function moveGroup(groups: Group[], groupId: string, offset: -1 | 1): Group[] {
  const from = groups.findIndex((g) => g.id === groupId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= groups.length) return groups;
  const next = [...groups];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export interface Anchor {
  channelId: string;
  after: boolean;
}

export function insertChannel(ids: string[], channelId: string, anchor?: Anchor): string[] {
  const without = ids.filter((id) => id !== channelId);
  const at = anchor ? without.indexOf(anchor.channelId) : -1;
  if (at < 0) return [...without, channelId];
  without.splice(anchor!.after ? at + 1 : at, 0, channelId);
  return without;
}

export function moveChannel(groups: Group[], channelId: string, groupId: string | null, anchor?: Anchor): Group[] {
  return groups.map((g) => ({
    ...g,
    channelIds:
      g.id === groupId ? insertChannel(g.channelIds, channelId, anchor) : g.channelIds.filter((id) => id !== channelId),
  }));
}

export function moveGroupTo(groups: Group[], groupId: string, targetId: string, after: boolean): Group[] {
  const moving = groups.find((g) => g.id === groupId);
  if (!moving || groupId === targetId) return groups;
  const next = groups.filter((g) => g.id !== groupId);
  const at = next.findIndex((g) => g.id === targetId);
  if (at < 0) return groups;
  next.splice(after ? at + 1 : at, 0, moving);
  return next;
}
