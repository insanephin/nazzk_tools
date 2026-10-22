export const SLOT_ATTR = "data-nazzk-toolkit-slot";
export const SLOT_TITLE_ATTR = "data-nazzk-toolkit-slot-title";

export const SCHEDULE_BANNER = "SCHEDULE_BANNER";
export const AD_BANNER = "AD_BANNER";
export const PREMIUM_LIVE = "PREMIUM_LIVE";

const LABELS: Record<string, string> = {
  [PREMIUM_LIVE]: "추천 방송 (상단)",
  LIVE_FOLLOWING: "팔로잉 채널 라이브",
  VIDEO_FOLLOWING: "팔로잉 채널 동영상",
  LIVE_PERSONAL_RECOMMENDED: "추천 라이브",
  CLIP_PERSONAL_RECOMMENDED: "추천 클립",
  VIDEO_CONTINUE: "이어보기",
  LIVE_NEW_STREAMER: "신규 스트리머",
  CATEGORY_LIVE_RECOMMENDED: "카테고리 추천 라이브",
  CATEGORY_PERSONAL_RECOMMENDED: "추천 카테고리",
  MANUAL_RECOMMENDED_GROUP: "치지직 제작 지원 컨텐츠",
};

export interface SeenSection {
  key: string;
  label: string;
}

const ORDER_KEY = "homeSectionOrder";
const SEEN_KEY = "homeSectionsSeen";

export function isBanner(key: string): boolean {
  return key.endsWith("_BANNER");
}

export function labelOf(key: string, title?: string | null): string {
  return LABELS[key] ?? (title?.trim() || key);
}

export function effectiveOrder(order: string[], seen: SeenSection[]): string[] {
  const keys = seen.map((s) => s.key);
  const result = order.filter((k) => keys.includes(k));
  keys.forEach((key, i) => {
    if (result.includes(key)) return;
    result.splice(i === 0 ? 0 : result.indexOf(keys[i - 1]) + 1, 0, key);
  });
  return result;
}

export async function getHomeSectionOrder(): Promise<string[]> {
  const data = await chrome.storage.local.get({ [ORDER_KEY]: [] });
  return data[ORDER_KEY] as string[];
}

export function setHomeSectionOrder(order: string[]): Promise<void> {
  return order.length === 0 ? chrome.storage.local.remove(ORDER_KEY) : chrome.storage.local.set({ [ORDER_KEY]: order });
}

export async function getSeenSections(): Promise<SeenSection[]> {
  const data = await chrome.storage.local.get({ [SEEN_KEY]: [] });
  return data[SEEN_KEY] as SeenSection[];
}

export function setSeenSections(seen: SeenSection[]): Promise<void> {
  return chrome.storage.local.set({ [SEEN_KEY]: seen });
}

export function onHomeSectionsChanged(callback: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (ORDER_KEY in changes || SEEN_KEY in changes)) callback();
  });
}
