import { CHAT_KEY_ATTR, CHAT_ROLE_ATTR } from "../shared/chatRoles";

const MARK = "data-chzzk-tools";
const STAFF_ATTR = "data-chzzk-tools-chat-staff";
const STAFF_ITEMS = `[${CHAT_ROLE_ATTR}="streamer"], [${CHAT_ROLE_ATTR}="manager"]`;
const MAX_STAFF = 200;

const CSS = `
[role="log"] :is(${STAFF_ITEMS}) { display: none !important; }
[${MARK}="chat-staff"] {
  display: flex; flex-direction: column; flex: 0 0 30%; max-height: 40vh; min-height: 0;
  border-bottom: 1px solid var(--sem-color-border-neutral-primary, rgba(128,128,128,.3));
}
[${MARK}="chat-staff-list"] {
  display: flex; flex-direction: column-reverse; flex: 1; min-height: 0; overflow-y: auto;
  padding: 0 12px 4px; scrollbar-width: none;
}
[${MARK}="chat-staff-list"]:empty::before {
  content: "아직 채팅이 없어요"; margin: auto; font-size: 12px; opacity: .5;
}
[${MARK}="chat-label"] {
  flex: none; padding: 6px 12px 4px; font-size: 12px; font-weight: 700; opacity: .6;
  color: var(--sem-color-content-neutral-primary, inherit);
}
`;

let active = false;
let observer: MutationObserver | null = null;
let syncQueued = false;

let log: HTMLElement | null = null;
let style: HTMLStyleElement | null = null;
let panel: HTMLElement | null = null;
let list: HTMLElement | null = null;
let viewerLabel: HTMLElement | null = null;
let clones = new Map<string, HTMLElement>();

export function mountChatSplit(): void {
  if (active) return;
  active = true;
  style = document.createElement("style");
  style.setAttribute(MARK, "");
  style.textContent = CSS;
  document.head.append(style);
  observer = new MutationObserver(queueSync);
  observer.observe(document.body, { childList: true, subtree: true, attributeFilter: [CHAT_ROLE_ATTR] });
  sync();
}

export function unmountChatSplit(): void {
  if (!active) return;
  active = false;
  observer?.disconnect();
  observer = null;
  style?.remove();
  style = null;
  removePanel();
  log = null;
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
  const next = document.querySelector<HTMLElement>('[role="log"]');
  if (next !== log) {
    removePanel();
    log = next;
  }
  if (!log?.parentElement) return;

  if (!panel) createPanel();
  if (log.previousElementSibling !== viewerLabel) log.before(panel!, viewerLabel!);

  let anchor: HTMLElement | null = null;
  for (const el of log.querySelectorAll<HTMLElement>(STAFF_ITEMS)) {
    const key = el.getAttribute(CHAT_KEY_ATTR)!;
    let copy = clones.get(key);
    if (!copy) {
      copy = cloneItem(el);
      clones.set(key, copy);
      if (anchor) anchor.after(copy);
      else list!.prepend(copy);
    }
    anchor = copy;
  }
  while (list!.childElementCount > MAX_STAFF) {
    const oldest = list!.lastElementChild!;
    clones.delete(oldest.getAttribute(CHAT_KEY_ATTR)!);
    oldest.remove();
  }
}

function cloneItem(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.setAttribute(STAFF_ATTR, el.getAttribute(CHAT_ROLE_ATTR)!);
  copy.removeAttribute(CHAT_ROLE_ATTR);
  for (const node of [copy, ...copy.querySelectorAll("[id]")]) node.removeAttribute("id");
  return copy;
}

function createPanel(): void {
  panel = document.createElement("div");
  panel.setAttribute(MARK, "chat-staff");
  list = document.createElement("div");
  list.setAttribute(MARK, "chat-staff-list");
  panel.append(label("매니저 · 스트리머"), list);
  viewerLabel = label("시청자");
}

function label(text: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute(MARK, "chat-label");
  el.textContent = text;
  return el;
}

function removePanel(): void {
  panel?.remove();
  viewerLabel?.remove();
  panel = list = viewerLabel = null;
  clones = new Map();
}
