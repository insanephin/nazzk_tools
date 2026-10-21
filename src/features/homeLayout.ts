import {
  SLOT_ATTR,
  SLOT_TITLE_ATTR,
  effectiveOrder,
  getHomeSectionOrder,
  getSeenSections,
  isBanner,
  labelOf,
  onHomeSectionsChanged,
  setHomeSectionOrder,
  setSeenSections,
  type SeenSection,
} from "../shared/homeSections";
import { orderDialog } from "./dialog";

const MARK = "data-chzzk-tools";
const GAP = "30px";
const TOOLBAR_GAP = "12px";
const LAST = 1_000_000;
const STEP = 1000;

let active = false;
let observer: MutationObserver | null = null;
let layoutQueued = false;

let order: string[] = [];
let seen: SeenSection[] = [];

let container: HTMLElement | null = null;
let toolbar: HTMLElement | null = null;
const styled = new Set<HTMLElement>();

export function mountHomeLayout(): void {
  if (active) return;
  active = true;
  observer = new MutationObserver(queueLayout);
  observer.observe(document.body, { childList: true, subtree: true, attributeFilter: [SLOT_ATTR] });
  load();
}

export function unmountHomeLayout(): void {
  if (!active) return;
  active = false;
  observer?.disconnect();
  observer = null;
  restore();
}

onHomeSectionsChanged(() => {
  if (active) load();
});

async function load(): Promise<void> {
  [order, seen] = await Promise.all([getHomeSectionOrder(), getSeenSections()]);
  layout();
}

function queueLayout(): void {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => {
    layoutQueued = false;
    layout();
  });
}

function layout(): void {
  if (!active) return;
  const next = document.querySelector(`[${SLOT_ATTR}]`)?.parentElement ?? null;
  if (next !== container) {
    restore();
    container = next;
  }
  if (!container) return;

  const children = [...container.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== toolbar);
  recordSeen(children);

  for (const el of styled) if (el.parentElement !== container) styled.delete(el);
  const ranks = new Map(order.map((k, i) => [k, i]));
  let lastRank = -1;
  const placed: { el: HTMLElement; order: number }[] = [];

  children.forEach((el, i) => {
    const key = el.getAttribute(SLOT_ATTR);
    if (!key) {
      placed.push({ el, order: LAST + i });
    } else if (isBanner(key)) {
      placed.push({ el, order: 1 + i });
    } else {
      lastRank = ranks.get(key) ?? lastRank;
      placed.push({ el, order: (lastRank + 2) * STEP + i });
    }
  });

  toolbar ??= createToolbar();
  if (toolbar.parentElement !== container) container.prepend(toolbar);
  placed.push({ el: toolbar, order: 0 });

  placed.sort((a, b) => a.order - b.order);
  let first = true;
  let afterToolbar = false;
  for (const { el, order: o } of placed) {
    styled.add(el);
    setStyle(el, "order", String(o));
    if (o >= LAST) continue;
    setStyle(el, "marginTop", first ? "0px" : afterToolbar ? TOOLBAR_GAP : GAP);
    afterToolbar = el === toolbar;
    first = false;
  }
}

function setStyle(el: HTMLElement, prop: "order" | "marginTop", value: string): void {
  if (el.style[prop] !== value) el.style[prop] = value;
}

function recordSeen(children: HTMLElement[]): void {
  const known = new Set(seen.map((s) => s.key));
  const added: SeenSection[] = [];
  for (const el of children) {
    const key = el.getAttribute(SLOT_ATTR);
    if (!key || isBanner(key) || known.has(key)) continue;
    known.add(key);
    added.push({ key, label: labelOf(key, el.getAttribute(SLOT_TITLE_ATTR)) });
  }
  if (added.length === 0) return;
  seen = [...seen, ...added];
  setSeenSections(seen);
}

function createToolbar(): HTMLElement {
  const bar = document.createElement("div");
  bar.setAttribute(MARK, "");
  bar.style.cssText = "display:flex;justify-content:flex-end";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "⇅ 섹션 순서 편집";
  edit.style.cssText = `padding:4px 2px;border:0;background:none;cursor:pointer;font-size:13px;font-weight:700;
    opacity:.7;color:var(--sem-color-content-neutral-primary,inherit)`;
  edit.onmouseenter = () => (edit.style.opacity = "1");
  edit.onmouseleave = () => (edit.style.opacity = ".7");
  edit.addEventListener("click", editOrder);

  bar.append(edit);
  return bar;
}

async function editOrder(): Promise<void> {
  const next = await orderDialog({
    title: "메인 페이지 섹션 순서",
    items: effectiveOrder(order, seen).map((key) => ({ key, label: seen.find((s) => s.key === key)!.label })),
    defaults: effectiveOrder([], seen),
  });
  if (next === null) return;
  order = next;
  layout();
  await setHomeSectionOrder(next);
}

function restore(): void {
  toolbar?.remove();
  for (const el of styled) {
    el.style.order = "";
    el.style.marginTop = "";
  }
  styled.clear();
  container = null;
}
