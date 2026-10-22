import { CHAT_KEY_ATTR, CHAT_ROLE_ATTR, chatRoleOf } from "./shared/chatRoles";
import { FOLLOWINGS_MESSAGE } from "./shared/following";
import { AD_BANNER, PREMIUM_LIVE, SCHEDULE_BANNER, SLOT_ATTR, SLOT_TITLE_ATTR } from "./shared/homeSections";
import { NOTIFY_ATTR, type NotifyPolicy } from "./shared/notifyPolicy";

const FOLLOW = /^https:\/\/api\.chzzk\.naver\.com\/service\/v1\/channels\/([^/?#]+)\/follow(?:[?#]|$)/;
const FOLLOWINGS = /^https:\/\/api\.chzzk\.naver\.com\/service\/v1\/channels\/followings(?:[?#]|$)/;

const responseText = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText")!.get!;
const open = XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
  const href = new URL(url, location.href).href;
  if (method.toUpperCase() === "GET" && FOLLOWINGS.test(href)) {
    this.addEventListener("load", () => this.status === 200 && postFollowings(this.response));
  }
  const channelId = method.toUpperCase() === "POST" ? href.match(FOLLOW)?.[1] : undefined;
  if (channelId) {
    Object.defineProperty(this, "responseText", {
      configurable: true,
      get: () => rewrite(responseText.call(this), channelId),
    });
  }
  return (open as (...args: unknown[]) => void).call(this, method, url, ...rest);
} as typeof XMLHttpRequest.prototype.open;

const fetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch.call(this, input, init);
  const href = input instanceof Request ? input.url : new URL(input, location.href).href;
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  if (res.ok && method.toUpperCase() === "GET" && FOLLOWINGS.test(href)) {
    res.clone().text().then(postFollowings, () => {});
  }
  return res;
};

function postFollowings(body: unknown): void {
  window.postMessage({ type: FOLLOWINGS_MESSAGE, body }, location.origin);
}

function rewrite(text: string, channelId: string): string {
  const notify = policyFor(channelId);
  if (notify === null) return text;
  try {
    const body = JSON.parse(text);
    const following = body?.content?.channel?.personalData?.following;
    if (!following || following.notification === notify) return text;
    following.notification = notify;
    return JSON.stringify(body);
  } catch {
    return text;
  }
}

function policyFor(channelId: string): boolean | null {
  const raw = document.documentElement.getAttribute(NOTIFY_ATTR);
  if (!raw) return null;
  try {
    const policy = JSON.parse(raw) as NotifyPolicy;
    return channelId in policy.channels ? policy.channels[channelId] : policy.ungrouped;
  } catch {
    return null;
  }
}

const HOME_CONTENT = ["section", "swap", "content"].map(cls).join(" > ");
let tagQueued = false;

new MutationObserver(() => {
  if (tagQueued) return;
  tagQueued = true;
  requestAnimationFrame(() => {
    tagQueued = false;
    tagHomeSections();
    tagChatItems();
  });
}).observe(document, { childList: true, subtree: true });

const CHAT_ITEMS = `[role="log"] > ${cls("wrapper")} > ${cls("item")}:not([${CHAT_ROLE_ATTR}])`;

function cls(name: string): string {
  return `:is([class^="_${name}_"], [class*=" _${name}_"])`;
}

function tagChatItems(): void {
  for (const el of document.querySelectorAll(CHAT_ITEMS)) {
    const code = userRoleCodeOf(el);
    const key = messageKeyOf(el);
    if (code === null || key === null) continue;
    el.setAttribute(CHAT_KEY_ATTR, key);
    el.setAttribute(CHAT_ROLE_ATTR, chatRoleOf(code));
  }
}

function messageKeyOf(el: Element): string | null {
  for (let fiber = fiberOf(el); fiber && fiber.stateNode !== el.parentElement; fiber = fiber.return ?? null) {
    if (fiber.key != null) return fiber.key;
  }
  return null;
}

function userRoleCodeOf(el: Element): string | null {
  let fiber = fiberOf(el)?.child ?? null;
  for (let depth = 0; fiber && depth < 3; depth++, fiber = fiber.child ?? null) {
    const message = fiber.memoizedProps?.chatMessage;
    if (message) return typeof message.profile?.userRoleCode === "string" ? message.profile.userRoleCode : "";
  }
  return null;
}

function fiberOf(el: Element): Fiber | null {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  return key ? ((el as any)[key] as Fiber) : null;
}

function tagHomeSections(): void {
  if (location.pathname !== "/") return;
  const container = document.querySelector(HOME_CONTENT);
  if (!container) return;
  for (const el of container.children) {
    if (el.hasAttribute(SLOT_ATTR)) continue;
    const slot = slotOf(el, container);
    if (!slot) continue;
    el.setAttribute(SLOT_ATTR, slot.key);
    if (slot.title) el.setAttribute(SLOT_TITLE_ATTR, slot.title);
  }
}

interface Fiber {
  key?: string | null;
  memoizedProps?: Record<string, any> | null;
  stateNode?: unknown;
  child?: Fiber | null;
  return?: Fiber | null;
}

function slotOf(el: Element, container: Element): { key: string; title?: string } | null {
  if (el.querySelector("#home_banner")) return { key: AD_BANNER };
  let fiber = fiberOf(el);
  while (fiber && fiber.stateNode !== container) {
    const props = fiber.memoizedProps;
    const slot = props?.slot;
    if (typeof slot?.slotContentType === "string") {
      return { key: slot.slotContentType, title: typeof slot.slotTitle === "string" ? slot.slotTitle : undefined };
    }
    if (props?.bannerList) return { key: SCHEDULE_BANNER };
    if (props?.liveList && props.cardIndex === undefined && "targetUser" in props) return { key: PREMIUM_LIVE };
    fiber = fiber.return ?? null;
  }
  return null;
}
