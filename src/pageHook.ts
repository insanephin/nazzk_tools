import { NOTIFY_ATTR, type NotifyPolicy } from "./shared/notifyPolicy";

const FOLLOW = /^https:\/\/api\.chzzk\.naver\.com\/service\/v1\/channels\/([^/?#]+)\/follow(?:[?#]|$)/;

const responseText = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText")!.get!;
const open = XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
  const channelId = method.toUpperCase() === "POST" ? new URL(url, location.href).href.match(FOLLOW)?.[1] : undefined;
  if (channelId) {
    Object.defineProperty(this, "responseText", {
      configurable: true,
      get: () => rewrite(responseText.call(this), channelId),
    });
  }
  return (open as (...args: unknown[]) => void).call(this, method, url, ...rest);
} as typeof XMLHttpRequest.prototype.open;

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
