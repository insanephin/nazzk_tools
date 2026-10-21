import { FOLLOWINGS_MESSAGE, fetchFollowings, parseFollowings, setNotification, type FollowingChannel } from "../shared/following";
import {
  createGroup,
  getGroups,
  getKnownChannels,
  getUngroupedNotify,
  getUngroupedOrder,
  insertChannel,
  moveChannel,
  moveGroup,
  moveGroupTo,
  onGroupsChanged,
  setGroups,
  setKnownChannels,
  setUngroupedNotify,
  setUngroupedOrder,
  type Anchor,
  type Group,
} from "../shared/groups";
import { NOTIFY_ATTR, type NotifyPolicy } from "../shared/notifyPolicy";
import { alertDialog, confirmDialog, promptDialog } from "./dialog";

const MARK = "data-chzzk-tools";
const REFRESH_MS = 60_000;

let active = false;
let observer: MutationObserver | null = null;
let refreshTimer: number | undefined;
let syncQueued = false;

let channels: FollowingChannel[] = [];
let channelsVersion = 0;
let groups: Group[] = [];
let ungroupedCollapsed = false;
let ungroupedNotify: boolean | undefined;
let ungroupedOrder: string[] = [];
const busySections = new Set<string>();

let reactList: HTMLUListElement | null = null;
let hidden: HTMLElement[] = [];
let addButton: HTMLButtonElement | null = null;
const templates: {
  header?: HTMLElement;
  arrow?: HTMLButtonElement;
} = {};

export function mountFollowingGroups(): void {
  if (active) return;
  active = true;
  observer = new MutationObserver(queueSync);
  observer.observe(document.body, { childList: true, subtree: true });
  refreshTimer = window.setInterval(load, REFRESH_MS);
  load();
}

export function unmountFollowingGroups(): void {
  if (!active) return;
  active = false;
  observer?.disconnect();
  clearInterval(refreshTimer);
  restore();
  document.documentElement.removeAttribute(NOTIFY_ATTR);
}

onGroupsChanged(async () => {
  if (!active) return;
  [groups, ungroupedNotify, ungroupedOrder] = await Promise.all([
    getGroups(),
    getUngroupedNotify(),
    getUngroupedOrder(),
  ]);
  render();
});

interface FollowMessage {
  type?: string;
  channelId?: string;
  followed?: boolean;
  fromThisTab?: boolean;
}

chrome.runtime.onMessage.addListener((message: FollowMessage) => {
  if (!active || message.type !== "followingsChanged") return;
  (async () => {
    if (message.followed && message.fromThisTab && message.channelId) await applyPolicyToFollow(message.channelId);
    refreshReactList();
    await load();
  })();
});

function refreshReactList(): void {
  const nav = reactList?.closest("nav");
  if (nav) findRefreshButton(nav)?.click();
}

async function applyPolicyToFollow(channelId: string): Promise<void> {
  const policy = policyOf(groups.find((g) => g.channelIds.includes(channelId))?.id ?? "");
  if (policy === undefined) return;
  try {
    await setNotification(channelId, policy);
  } catch (e) {
    console.debug("[chzzk-tools] notification:", channelId, e);
  }
}

addEventListener("message", (e: MessageEvent) => {
  if (!active || e.source !== window || e.data?.type !== FOLLOWINGS_MESSAGE) return;
  let page: ReturnType<typeof parseFollowings>;
  try {
    page = parseFollowings(e.data.body);
  } catch {
    return;
  }
  if (!page) return;
  channelsVersion++;
  const fresh = new Set(page.list.map((c) => c.channelId));
  channels = page.complete ? page.list : [...page.list, ...channels.filter((c) => !fresh.has(c.channelId))];
  sync();
  render();
  applyToNewFollows();
});

async function load(): Promise<void> {
  const version = channelsVersion;
  try {
    let fetched: FollowingChannel[];
    [fetched, groups, ungroupedNotify, ungroupedOrder] = await Promise.all([
      fetchFollowings(),
      getGroups(),
      getUngroupedNotify(),
      getUngroupedOrder(),
    ]);
    if (version === channelsVersion) channels = fetched;
  } catch (e) {
    console.debug("[chzzk-tools] followings:", e);
    channels = [];
    sync();
    return;
  }
  sync();
  render();
  await applyToNewFollows();
}

async function applyToNewFollows(): Promise<void> {
  const known = await getKnownChannels();
  await setKnownChannels(channels.map((c) => c.channelId));
  if (known === null) return;
  const seen = new Set(known);
  await applyPolicy(channels.filter((c) => !seen.has(c.channelId)));
}

function queueSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    sync();
  });
}

function sync(): void {
  if (!active) return;
  const list = findReactList();
  const nav = list?.closest("nav");
  if (!list || !nav || !hasToken(nav, "is_expanded")) {
    restore();
    return;
  }

  if (list !== reactList) {
    restore();
    reactList = list;
    captureTemplates(nav);
    list.style.display = "flex";
    list.style.flexDirection = "column";
    for (const [type, listener] of LIST_LISTENERS) list.addEventListener(type, listener);
    render();
  }
  showAllItems(nav);
  placeAddButton(nav);
  layout();
}

const LIST_LISTENERS: [string, EventListener][] = [
  ["click", onClick as EventListener],
  ["contextmenu", onContextMenu as EventListener],
  ["keydown", onKeyDown as EventListener],
  ["dragstart", onDragStart as EventListener],
  ["dragover", onDragOver as EventListener],
  ["dragleave", onDragLeave as EventListener],
  ["drop", onDrop as EventListener],
  ["dragend", endDrag],
];
const ORDER_STEP = 10_000;

function findReactList(): HTMLUListElement | null {
  if (channels.length === 0) return null;
  const followed = new Set(channels.map((c) => c.channelId));
  for (const ul of document.querySelectorAll<HTMLUListElement>("nav ul")) {
    if (ul.querySelector(tok("is_highlighted"))) continue;
    const links = ul.querySelectorAll<HTMLAnchorElement>(`a${tok("item_link")}`);
    if ([...links].some((a) => followed.has(channelIdOf(a.href)))) return ul;
  }
  return null;
}

function captureTemplates(nav: Element): void {
  const header = nav.querySelector<HTMLElement>(`:scope > ${tok("header")}`);
  if (header) {
    templates.header = clone(header);
    templates.header.querySelectorAll("button").forEach((b) => b.remove());
    const arrow = [...header.querySelectorAll<HTMLButtonElement>(":scope > button")].find((b) =>
      b.querySelector(tok("icon_arrow")),
    );
    if (arrow) templates.arrow = clone(arrow);
  }
}

function showAllItems(nav: Element): void {
  for (const box of nav.querySelectorAll<HTMLElement>(`:scope > ${tok("box")}`)) {
    hide(box);
    box.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click();
  }
}

function findRefreshButton(nav: Element): HTMLButtonElement | null {
  return nav.querySelector<HTMLButtonElement>(`:scope > ${tok("header")} > button:not([${MARK}])`);
}

function placeAddButton(nav: Element): void {
  const refresh = findRefreshButton(nav);
  if (!refresh) return;
  addButton ??= createAddButton(refresh);
  if (addButton.nextElementSibling !== refresh) refresh.before(addButton);
}

function createAddButton(refresh: HTMLButtonElement): HTMLButtonElement {
  const button = clone(refresh);
  button.setAttribute(MARK, "");
  button.classList.remove(...[...button.classList].filter((t) => t.startsWith("_is_rotated_")));
  button.setAttribute("aria-label", "새 그룹");
  button.title = "새 그룹";

  const icon = button.querySelector("svg");
  if (icon) {
    const [, , w = 16, h = 16] = (icon.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
    const arm = Math.min(w, h) * 0.3;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${w / 2} ${h / 2 - arm}V${h / 2 + arm}M${w / 2 - arm} ${h / 2}H${w / 2 + arm}`);
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", String(Math.min(w, h) / 10));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("fill", "none");
    icon.replaceChildren(path);
  } else {
    button.textContent = "+";
  }

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    addGroup();
  });
  return button;
}

function hide(el: HTMLElement): void {
  if (el.style.display === "none") return;
  el.style.display = "none";
  hidden.push(el);
}

function restore(): void {
  addButton?.remove();
  if (reactList) {
    reactList.querySelectorAll(`:scope > [${MARK}]`).forEach((e) => e.remove());
    for (const li of reactList.querySelectorAll<HTMLLIElement>(":scope > li")) {
      li.style.order = "";
      li.style.display = "";
      li.style.boxShadow = "";
      li.removeAttribute("draggable");
      delete li.dataset.channelId;
      delete li.dataset.section;
    }
    reactList.style.display = "";
    reactList.style.flexDirection = "";
    for (const [type, listener] of LIST_LISTENERS) reactList.removeEventListener(type, listener);
  }
  hidden.forEach((el) => (el.style.display = ""));
  hidden = [];
  reactList = null;
}

function render(): void {
  publishPolicy();
  if (!reactList) return;
  if (dragging) {
    renderPending = true;
    return;
  }
  const active = document.activeElement;
  const focused =
    active && reactList.contains(active) && active.matches('[role="button"]')
      ? active.closest<HTMLElement>("[data-group-id]")?.dataset.groupId
      : undefined;

  reactList.querySelectorAll(`:scope > [${MARK}]`).forEach((e) => e.remove());
  if (groups.length > 0) {
    reactList.append(
      ...groups.map((g) => renderHeader(g, g.name, g.collapsed, sectionChannels(g.id))),
      renderHeader(null, "미분류", ungroupedCollapsed, sectionChannels("")),
    );
  }
  layout();
  if (focused !== undefined) {
    reactList.querySelector<HTMLElement>(`[data-group-id="${focused}"] [role="button"]`)?.focus();
  }
}

function layout(): void {
  if (!reactList) return;
  const sectionIds = [...groups.map((g) => g.id), ""];
  const bySection = new Map<string, HTMLLIElement[]>(sectionIds.map((id) => [id, []]));
  const followed = new Set(channels.map((c) => c.channelId));
  for (const li of reactList.querySelectorAll<HTMLLIElement>(`:scope > li:not([${MARK}])`)) {
    const link = li.querySelector<HTMLAnchorElement>(`a${tok("item_link")}`);
    const channelId = link ? channelIdOf(link.href) : "";
    li.dataset.channelId = channelId;
    li.draggable = true;
    if (!followed.has(channelId)) {
      li.style.display = "none";
      continue;
    }
    bySection.get(groups.find((g) => g.channelIds.includes(channelId))?.id ?? "")!.push(li);
  }

  sectionIds.forEach((id, k) => {
    const lis = sortSection(id, bySection.get(id)!);
    const collapsed = id ? groups.find((g) => g.id === id)!.collapsed : groups.length > 0 && ungroupedCollapsed;
    const header = reactList!.querySelector<HTMLElement>(`:scope > [${MARK}][data-group-id="${id}"]`);
    if (header) {
      header.style.order = String(k * ORDER_STEP);
      const count = header.querySelector<HTMLElement>("[data-count]");
      const text = `${lis.filter(isLive).length}/${lis.length}`;
      if (count && count.textContent !== text) count.textContent = text;
    }
    lis.forEach((li, i) => {
      li.dataset.section = id;
      li.style.order = String(k * ORDER_STEP + 1 + i);
      li.style.display = collapsed ? "none" : "";
    });
  });
}

function sortSection(sectionId: string, lis: HTMLLIElement[]): HTMLLIElement[] {
  const ids = sectionId ? (groups.find((g) => g.id === sectionId)?.channelIds ?? []) : ungroupedOrder;
  const rank = new Map(ids.map((id, i) => [id, i]));
  const rankOf = (li: HTMLLIElement) => rank.get(li.dataset.channelId!) ?? ids.length;
  return [...lis].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || rankOf(a) - rankOf(b));
}

function isLive(li: HTMLLIElement): boolean {
  const profile = li.querySelector(tok("profile"));
  return profile ? hasToken(profile, "is_live") : false;
}

function renderHeader(group: Group | null, name: string, collapsed: boolean, list: FollowingChannel[]): HTMLLIElement {
  const header = templates.header ? clone(templates.header) : document.createElement("div");
  const title = header.querySelector("strong") ?? header;
  const label = document.createElement("span");
  label.textContent = name;
  const count = document.createElement("span");
  count.dataset.count = "";
  count.style.cssText = "font-weight:400;opacity:.6";

  if (templates.arrow) {
    const arrow = clone(templates.arrow);
    arrow.setAttribute("aria-expanded", String(!collapsed));
    arrow.setAttribute("aria-hidden", "true");
    arrow.removeAttribute("aria-label");
    arrow.tabIndex = -1;
    title.replaceChildren(arrow, label, count);
  } else {
    title.replaceChildren(collapsed ? "▸" : "▾", label, count);
  }
  title.setAttribute("role", "button");
  title.setAttribute("aria-expanded", String(!collapsed));
  title.tabIndex = 0;
  header.style.cursor = "pointer";
  header.style.minHeight = "28px";

  const li = document.createElement("li");
  li.setAttribute(MARK, "");
  li.style.listStyle = "none";
  li.dataset.groupId = group?.id ?? "";
  li.draggable = group !== null;
  if (list.length > 0) header.append(renderBell(li.dataset.groupId, name, list));
  li.append(header);
  return li;
}

function renderBell(sectionId: string, name: string, list: FollowingChannel[]): HTMLButtonElement {
  const on = list.filter((c) => c.notification).length;
  const allOn = on === list.length;
  const busy = busySections.has(sectionId);
  const policy = policyOf(sectionId);

  const button = templates.arrow ? clone(templates.arrow) : document.createElement("button");
  button.type = "button";
  button.removeAttribute("aria-expanded");
  button.dataset.action = "notify";
  button.dataset.name = name;
  button.setAttribute("aria-pressed", String(allOn));
  button.setAttribute("aria-label", allOn ? `${name} 알림 모두 끄기` : `${name} 알림 모두 켜기`);
  button.title = busy
    ? "알림 설정 중…"
    : `알림 ${on}/${list.length} 켜짐${policy === undefined ? "" : ` · 동기화: ${policy ? "켜기" : "끄기"}`}`;
  button.disabled = busy;
  button.style.opacity = busy ? "0.4" : on > 0 && !allOn ? "0.5" : "";
  button.replaceChildren(bellIcon(on > 0));
  return button;
}

const BELL_ON = [
  "M16.4897 19.4404C16.267 20.6139 15.2368 21.502 13.9985 21.502L13.7397 21.4883C12.6192 21.3744 11.7143 20.5308 11.5073 19.4404H13.311C13.4618 19.6584 13.7135 19.8015 13.9985 19.8018C14.2837 19.8018 14.5359 19.6584 14.687 19.4404H16.4897Z",
  "M14.0034 6.50195C17.0008 6.50195 19.5796 8.61885 19.6665 11.4238V11.4346L19.6685 13.7891L20.7446 15.9746L20.7563 16.0059C20.9363 16.4894 20.8841 17.0143 20.5493 17.416C20.2294 17.7997 19.739 17.9667 19.2407 17.9668H8.76904C8.27046 17.9667 7.78238 17.7954 7.46338 17.4121C7.13011 17.0116 7.07214 16.4869 7.25342 15.998L7.26514 15.9658L8.3374 13.7822L8.33838 11.4229L8.34424 11.3379C8.48183 8.57524 11.0363 6.50196 14.0034 6.50195Z",
];
const BELL_OFF = [
  "M19.6542 11.2027L9.8834 17.9671H19.2401C19.7385 17.9671 20.2287 17.8001 20.5488 17.4163C20.8838 17.0146 20.9357 16.4901 20.7557 16.0065L20.7441 15.9751L19.6681 13.7897L19.6667 11.4345L19.6664 11.4245C19.6641 11.3501 19.66 11.2761 19.6542 11.2027Z",
  "M7.88853 14.696L8.33729 13.7821L8.33791 11.4234L8.3436 11.3376C8.4812 8.575 11.0361 6.50165 14.0032 6.50165C15.4504 6.50165 16.7999 6.99519 17.8186 7.82137L7.88853 14.696Z",
  "M11.5067 19.4406C11.7293 20.6141 12.7604 21.5015 13.9987 21.5015C15.237 21.5015 16.2681 20.6141 16.4907 19.4406H15.1675C14.9797 19.9016 14.5271 20.2265 13.9987 20.2265C13.4702 20.2265 13.0177 19.9016 12.8299 19.4406H11.5067Z",
  "M21.1804 8.59574C21.4699 8.39533 21.5421 7.9982 21.3417 7.70872C21.1413 7.41924 20.7441 7.34704 20.4547 7.54745L6.81961 16.9871C6.53013 17.1875 6.45792 17.5846 6.65833 17.8741C6.85874 18.1636 7.25587 18.2358 7.54535 18.0353L21.1804 8.59574Z",
];

function bellIcon(on: boolean): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "5 5 18 18");
  svg.setAttribute("aria-hidden", "true");
  for (const d of on ? BELL_ON : BELL_OFF) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
  }
  return svg;
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== "Enter" && e.key !== " ") return;
  const title = (e.target as Element).closest('[role="button"]');
  const id = title?.closest<HTMLElement>("[data-group-id]")?.dataset.groupId;
  if (id === undefined) return;
  e.preventDefault();
  toggleSection(id);
}

function toggleSection(id: string): void {
  if (id) save(groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)));
  else {
    ungroupedCollapsed = !ungroupedCollapsed;
    render();
  }
}

function onClick(e: MouseEvent): void {
  const target = e.target as Element;
  const header = target.closest<HTMLElement>("[data-group-id]");
  const bell = target.closest<HTMLElement>('[data-action="notify"]');
  if (header && bell) {
    setSectionNotification(header.dataset.groupId!, bell.dataset.name!, bell.getAttribute("aria-pressed") !== "true");
    return;
  }
  if (header) toggleSection(header.dataset.groupId!);
}

function onContextMenu(e: MouseEvent): void {
  const target = e.target as Element;
  const channelId = target.closest<HTMLElement>("[data-channel-id]")?.dataset.channelId;
  const header = target.closest<HTMLElement>("[data-group-id]");
  const groupId = header?.dataset.groupId;
  const group = groups.find((g) => g.id === groupId);

  let items: MenuItem[];
  if (channelId) {
    const current = groups.find((g) => g.channelIds.includes(channelId))?.id ?? null;
    items = [
      { label: "그룹으로 이동", disabled: true },
      ...groups.map((g) => ({ label: g.name, checked: g.id === current, run: () => moveTo(channelId, g.id) })),
      { label: "미분류", checked: current === null, run: () => moveTo(channelId, null) },
      { label: "새 그룹 만들어 이동…", run: () => addGroup(channelId) },
    ];
  } else if (groupId !== undefined) {
    const name = group?.name ?? "미분류";
    const members = sectionChannels(groupId);
    const on = members.filter((c) => c.notification).length;
    const policy = policyOf(groupId);
    items = [
      { label: `알림 ${on}/${members.length} 켜짐`, disabled: true },
      { label: "알림 모두 켜기", checked: policy === true, run: () => setSectionNotification(groupId, name, true) },
      { label: "알림 모두 끄기", checked: policy === false, run: () => setSectionNotification(groupId, name, false) },
    ];
    if (policy !== undefined) {
      items.push({
        label: group ? "들어오는 채널 알림은 그대로 두기" : "새 팔로우 알림은 그대로 두기",
        run: () => savePolicy(groupId, undefined),
      });
    }
    if (group) {
      items.push(
        { label: "이름 변경…", run: () => renameGroup(group) },
        { label: "위로", run: () => save(moveGroup(groups, group.id, -1)) },
        { label: "아래로", run: () => save(moveGroup(groups, group.id, 1)) },
        { label: "삭제", run: () => deleteGroup(group) },
      );
    }
  } else {
    return;
  }
  e.preventDefault();
  showMenu(e.clientX, e.clientY, items);
}

function sectionChannels(groupId: string): FollowingChannel[] {
  const byId = new Map(channels.map((c) => [c.channelId, c]));
  if (groupId) {
    const ids = groups.find((g) => g.id === groupId)?.channelIds ?? [];
    return ids.map((id) => byId.get(id)).filter((c) => c !== undefined);
  }
  const assigned = new Set(groups.flatMap((g) => g.channelIds));
  const ungrouped = channels.filter((c) => !assigned.has(c.channelId));
  const rank = new Map(ungroupedOrder.map((id, i) => [id, i]));
  return ungrouped.sort((a, b) => (rank.get(a.channelId) ?? Infinity) - (rank.get(b.channelId) ?? Infinity));
}

function policyOf(sectionId: string): boolean | undefined {
  return sectionId ? groups.find((g) => g.id === sectionId)?.notify : ungroupedNotify;
}

function publishPolicy(): void {
  const policy: NotifyPolicy = { channels: {}, ungrouped: ungroupedNotify ?? null };
  for (const g of groups) for (const id of g.channelIds) policy.channels[id] = g.notify ?? null;
  document.documentElement.setAttribute(NOTIFY_ATTR, JSON.stringify(policy));
}

async function savePolicy(sectionId: string, notify: boolean | undefined): Promise<void> {
  if (sectionId) {
    await save(groups.map((g) => (g.id === sectionId ? { ...g, notify } : g)));
  } else {
    ungroupedNotify = notify;
    render();
    await setUngroupedNotify(notify);
  }
}

async function applyPolicy(list: FollowingChannel[]): Promise<void> {
  const targets = list.flatMap((c) => {
    const policy = policyOf(groups.find((g) => g.channelIds.includes(c.channelId))?.id ?? "");
    return policy === undefined || policy === c.notification ? [] : [{ c, policy }];
  });
  if (targets.length === 0) return;
  for (const { c, policy } of targets) {
    try {
      await setNotification(c.channelId, policy);
      c.notification = policy;
    } catch (e) {
      console.debug("[chzzk-tools] notification:", c.channelId, e);
    }
  }
  render();
}

async function moveTo(channelId: string, groupId: string | null, anchor?: Anchor): Promise<void> {
  if (groupId === null) {
    ungroupedOrder = insertChannel(
      sectionChannels("").map((c) => c.channelId),
      channelId,
      anchor,
    );
    await setUngroupedOrder(ungroupedOrder);
  }
  await save(moveChannel(groups, channelId, groupId, anchor));
  await applyPolicy(channels.filter((c) => c.channelId === channelId));
}

async function setSectionNotification(sectionId: string, name: string, on: boolean): Promise<void> {
  const members = sectionChannels(sectionId);
  if (busySections.has(sectionId)) return;
  if (members.length > 0) {
    const later = sectionId ? "앞으로 이 그룹에 들어오는 채널" : "앞으로 새로 팔로우하는 채널";
    const ok = await confirmDialog({
      title: on ? "알림 켜기" : "알림 끄기",
      message:
        `"${name}"의 채널 ${members.length}개 방송 알림을 모두 ${on ? "켤" : "끌"}까요? ` +
        `${later}도 알림을 ${on ? "켜요" : "꺼요"}.`,
      confirmLabel: on ? "켜기" : "끄기",
    });
    if (!ok) return;
  }
  await savePolicy(sectionId, on);
  if (members.length === 0) return;

  busySections.add(sectionId);
  render();
  const failed: string[] = [];
  for (const c of members) {
    try {
      await setNotification(c.channelId, on);
      c.notification = on;
    } catch (e) {
      console.debug("[chzzk-tools] notification:", c.channelId, e);
      failed.push(c.channelName);
    }
  }
  busySections.delete(sectionId);
  render();
  if (failed.length > 0) {
    await alertDialog({
      title: "일부 채널은 바꾸지 못했어요",
      message: `${failed.length}개 실패: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? " 외" : ""}`,
    });
  }
}

async function addGroup(channelId?: string): Promise<void> {
  const name = await promptDialog({ title: "새 그룹", placeholder: "그룹 이름", confirmLabel: "만들기" });
  if (!name) return;
  let next = createGroup(groups, name);
  if (channelId) next = moveChannel(next, channelId, next[next.length - 1].id);
  save(next);
}

async function renameGroup(group: Group): Promise<void> {
  const name = await promptDialog({ title: "그룹 이름 변경", value: group.name, confirmLabel: "변경" });
  if (name) save(groups.map((g) => (g.id === group.id ? { ...g, name } : g)));
}

async function deleteGroup(group: Group): Promise<void> {
  const sync = ungroupedNotify === undefined ? "" : ` 미분류 알림 동기화에 맞춰 알림이 ${ungroupedNotify ? "켜져요" : "꺼져요"}.`;
  const ok = await confirmDialog({
    title: "그룹 삭제",
    message: `"${group.name}" 그룹을 삭제할까요? 채널은 미분류로 돌아가요.${sync}`,
    confirmLabel: "삭제",
    danger: true,
  });
  if (!ok) return;
  const members = sectionChannels(group.id);
  await save(groups.filter((g) => g.id !== group.id));
  await applyPolicy(members);
}

async function save(next: Group[]): Promise<void> {
  groups = next;
  render();
  await setGroups(next);
}

type Dragging = { kind: "channel" | "group"; id: string };
type DropTarget =
  | { kind: "channel"; el: HTMLElement; sectionId: string; channelId: string; after: boolean }
  | { kind: "header"; el: HTMLElement; sectionId: string; after: boolean };

let dragging: Dragging | null = null;
let renderPending = false;
let indicated: HTMLElement | null = null;

function onDragStart(e: DragEvent): void {
  const target = e.target as Element;
  const li = target.closest<HTMLElement>("[data-channel-id]");
  const header = target.closest<HTMLElement>("[data-group-id]");
  if (li) dragging = { kind: "channel", id: li.dataset.channelId! };
  else if (header?.dataset.groupId) dragging = { kind: "group", id: header.dataset.groupId };
  else return;
  closeMenu();
  e.dataTransfer!.effectAllowed = "move";
  e.dataTransfer!.setData("text/plain", "");
}

function dropTarget(e: DragEvent): DropTarget | null {
  if (!dragging) return null;
  const target = e.target as Element;
  const header = target.closest<HTMLElement>("[data-group-id]");
  if (header) {
    const sectionId = header.dataset.groupId!;
    const rect = header.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    if (dragging.kind === "group") {
      return sectionId && sectionId !== dragging.id ? { kind: "header", el: header, sectionId, after } : null;
    }
    return { kind: "header", el: header, sectionId, after: false };
  }
  if (dragging.kind !== "channel") return null;
  const li = target.closest<HTMLElement>("[data-channel-id]");
  const sectionId = li?.dataset.section;
  if (!li || sectionId === undefined || li.dataset.channelId === dragging.id) return null;
  const rect = li.getBoundingClientRect();
  return {
    kind: "channel",
    el: li,
    sectionId,
    channelId: li.dataset.channelId!,
    after: e.clientY > rect.top + rect.height / 2,
  };
}

function onDragOver(e: DragEvent): void {
  const drop = dropTarget(e);
  if (!drop) {
    indicate(null);
    return;
  }
  e.preventDefault();
  e.dataTransfer!.dropEffect = "move";
  const into = drop.kind === "header" && dragging!.kind === "channel";
  indicate(drop.el, into ? "inset 0 0 0 2px #00ffa3" : `inset 0 ${drop.after ? -2 : 2}px 0 #00ffa3`);
}

function onDragLeave(e: DragEvent): void {
  if (!reactList?.contains(e.relatedTarget as Node | null)) indicate(null);
}

function onDrop(e: DragEvent): void {
  const drop = dropTarget(e);
  const moving = dragging;
  if (!drop || !moving) return;
  e.preventDefault();
  endDrag();
  if (moving.kind === "group") {
    save(moveGroupTo(groups, moving.id, drop.sectionId, drop.after));
  } else {
    const anchor = drop.kind === "channel" ? { channelId: drop.channelId, after: drop.after } : undefined;
    moveTo(moving.id, drop.sectionId || null, anchor);
  }
}

function endDrag(): void {
  if (!dragging) return;
  dragging = null;
  indicate(null);
  if (renderPending) {
    renderPending = false;
    render();
  }
}

function indicate(el: HTMLElement | null, shadow = ""): void {
  if (indicated && indicated !== el) indicated.style.boxShadow = "";
  indicated = el;
  if (el) el.style.boxShadow = shadow;
}

interface MenuItem {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  run?: () => void;
}

let menu: HTMLElement | null = null;

function showMenu(x: number, y: number, items: MenuItem[]): void {
  closeMenu();
  menu = document.createElement("div");
  menu.setAttribute(MARK, "");
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:2147483647;min-width:160px;padding:4px;
    border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.4);font-size:13px;
    background:var(--sem-color-background-neutral-base,#1f1f23);color:${getComputedStyle(document.body).color}`;
  for (const item of items) {
    const row = document.createElement("div");
    row.textContent = `${item.checked ? "✓ " : ""}${item.label}`;
    row.style.cssText = `padding:6px 10px;border-radius:4px;${item.disabled ? "opacity:.5" : "cursor:pointer"}`;
    if (!item.disabled) {
      row.onmouseenter = () => (row.style.background = "rgba(128,128,128,.2)");
      row.onmouseleave = () => (row.style.background = "");
      row.onclick = () => {
        closeMenu();
        item.run?.();
      };
    }
    menu.append(row);
  }
  document.body.append(menu);
  setTimeout(() => {
    addEventListener("pointerdown", closeOnOutside, true);
    addEventListener("keydown", closeOnEscape, true);
  });
}

function closeMenu(): void {
  menu?.remove();
  menu = null;
  removeEventListener("pointerdown", closeOnOutside, true);
  removeEventListener("keydown", closeOnEscape, true);
}

function closeOnOutside(e: PointerEvent): void {
  if (!menu?.contains(e.target as Node)) closeMenu();
}

function closeOnEscape(e: KeyboardEvent): void {
  if (e.key === "Escape") closeMenu();
}

function hasToken(el: Element, name: string): boolean {
  return [...el.classList].some((t) => t.startsWith(`_${name}_`));
}

function tok(name: string): string {
  return `:is([class^="_${name}_"], [class*=" _${name}_"])`;
}

function clone<T extends Element>(el: T): T {
  return el.cloneNode(true) as T;
}

function channelIdOf(href: string): string {
  return new URL(href).pathname.split("/").filter(Boolean).pop() ?? "";
}
