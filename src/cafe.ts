import { getSettings } from "./shared/settings";
import { STEAM_PLAYER_PAGE, type SteamTrailer } from "./shared/steam";

const FRAME_NAME = "nazzk-toolkit-cafe";
const OVERLAY_ID = "nazzk-toolkit-cafe-overlay";
const ARTICLE_PATH = [
  /^\/(f-e|ca-fe)\/cafes\/\d+\/articles\/\d+/,
  /^\/ArticleRead\.nhn$/i,
  /^\/[\w-]+\/\d+\/?$/,
];

const KEEP = ".ArticleContentBox";
const FRAME_CSS = `
  body *:not(:has(${KEEP})):not(${KEEP}):not(:is(${KEEP}) *) { display: none !important; }
  html, body, body *:has(${KEEP}) { margin: 0 !important; padding: 0 !important; }
  ${KEEP} { border: 0 !important; border-radius: 0 !important; }
  .CommentLineSticker { top: auto !important; bottom: 100% !important; }
  .CommentLineSticker .se2_line_layer { top: auto !important; bottom: 0 !important; }
`;

const CLIP_URL = /chzzk\.naver\.com\/(?:embed\/)?clips?\/(\w+)/;
const STEAM_URL = /store\.steampowered\.com\/app\/(\d+)/;
const CLIP_DONE = "chzzkToolsClip";
const CLIP_ATTR = "data-chzzk-tools-clip";

let popupEnabled = false;

if (window.name === FRAME_NAME) {
  const style = document.createElement("style");
  style.textContent = FRAME_CSS;
  document.documentElement.append(style);
  fitModalToArticle();
}
redirectMobile();
watchClips();
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") apply();
});
apply();

async function apply(): Promise<void> {
  const settings = await getSettings();
  popupEnabled = settings.enabled && settings.cafePopup;
}

function watchClips(): void {
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      embedClips();
    });
  }).observe(document, { childList: true, subtree: true });
}

function embedClips(): void {
  const anchors = [
    ...document.querySelectorAll<HTMLAnchorElement>(".se-module-oglink a[href]"),
    ...document.querySelectorAll<HTMLAnchorElement>("a[href]"),
  ];
  for (const anchor of anchors) {
    if (anchor.dataset[CLIP_DONE]) continue;
    anchor.dataset[CLIP_DONE] = "1";
    const appId = matchHref(anchor.href, STEAM_URL);
    if (appId) {
      embedSteam(anchor, appId);
      continue;
    }
    const uid = matchHref(anchor.href, CLIP_URL);
    if (!uid) continue;
    const played = document.querySelector(`iframe[${CLIP_ATTR}="${uid}"]`);
    const card = anchor.closest<HTMLElement>(".se-module-oglink");
    if (card) {
      card.querySelectorAll<HTMLElement>("a[href]").forEach((a) => (a.dataset[CLIP_DONE] = "1"));
      const section = card.closest<HTMLElement>(".se-section") ?? card;
      if (played) section.remove();
      else section.replaceWith(clipPlayer(uid));
    } else {
      const block = anchor.closest<HTMLElement>(".se-section, p") ?? anchor;
      if (!played) block.after(clipPlayer(uid));
      hideClipLink(anchor, block);
    }
  }
}

function hideClipLink(anchor: HTMLAnchorElement, block: HTMLElement): void {
  const text = anchor.textContent?.trim() ?? "";
  if (!text.includes("chzzk.naver.com")) return;
  const target = block.textContent?.trim() === text ? block : anchor;
  target.style.display = "none";
}

// Keeps the Steam card (title, price) and adds the first trailer below it.
function embedSteam(anchor: HTMLAnchorElement, appId: string): void {
  const key = `steam:${appId}`;
  if (document.querySelector(`iframe[${CLIP_ATTR}="${key}"]`)) return;
  const block = anchor.closest<HTMLElement>(".se-section, p") ?? anchor;
  // Inserted hidden right away so other links to the same app are deduped while the fetch runs.
  const frame = playerFrame(key);
  frame.style.display = "none";
  block.after(frame);
  chrome.runtime.sendMessage({ type: "steamTrailer", appId }).then(
    (trailer: SteamTrailer | null) => {
      if (!trailer) return frame.remove();
      const url = new URL(chrome.runtime.getURL(STEAM_PLAYER_PAGE));
      url.searchParams.set("src", trailer.hls);
      url.searchParams.set("poster", trailer.poster);
      frame.src = url.href;
      frame.style.display = "block";
    },
    () => frame.remove(),
  );
}

function matchHref(href: string, re: RegExp): string | null {
  try {
    return decodeURIComponent(href).match(re)?.[1] ?? null;
  } catch {
    return null;
  }
}

function clipPlayer(uid: string): HTMLIFrameElement {
  const frame = playerFrame(uid);
  frame.src = `https://chzzk.naver.com/embed/clip/${uid}`;
  return frame;
}

function playerFrame(key: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.setAttribute(CLIP_ATTR, key);
  frame.allow = "autoplay; fullscreen; clipboard-write";
  frame.allowFullscreen = true;
  frame.style.cssText = "display:block;width:100%;aspect-ratio:16/9;margin:8px 0;border:0;border-radius:8px;background:#000";
  return frame;
}

addEventListener(
  "click",
  (e) => {
    if (!popupEnabled || window.name === FRAME_NAME || isArticlePage()) return;
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || !isArticleUrl(anchor.href)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openModal(articleFrameUrl(anchor.href));
  },
  true,
);

addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (window === window.top || window.name === FRAME_NAME)) closeModal();
});

function openModal(href: string): void {
  const doc = window.top!.document;
  const existing = doc.getElementById(OVERLAY_ID);
  if (existing) {
    existing.querySelector("iframe")!.src = href;
    return;
  }
  const overlay = doc.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6)";
  overlay.addEventListener("click", (e) => e.target === overlay && closeModal());

  const box = doc.createElement("div");
  box.style.cssText =
    "position:relative;width:860px;max-width:90vw;height:90vh;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.4)";

  const frame = doc.createElement("iframe");
  frame.name = FRAME_NAME;
  frame.src = href;
  frame.style.cssText = "width:100%;height:100%;border:0;display:block";

  const close = doc.createElement("button");
  close.type = "button";
  close.textContent = "\u2715";
  close.title = "닫기 (Esc)";
  close.style.cssText =
    "position:absolute;top:10px;right:10px;width:32px;height:32px;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:16px;cursor:pointer";
  close.addEventListener("click", closeModal);

  box.append(frame, close);
  overlay.append(box);
  doc.body.append(overlay);
  overlay.dataset.overflow = doc.documentElement.style.overflow;
  doc.documentElement.style.overflow = "hidden";
}

function articleFrameUrl(href: string): string {
  const url = new URL(href);
  const fe = url.pathname.match(/^\/f-e\/cafes\/(\d+)\/articles\/(\d+)/);
  const ids = fe ?? (/^\/ArticleRead\.nhn$/i.test(url.pathname) ? [, url.searchParams.get("clubid"), url.searchParams.get("articleid")] : null);
  if (!ids?.[1] || !ids[2]) return href;
  url.pathname = `/ca-fe/cafes/${ids[1]}/articles/${ids[2]}`;
  if (!fe) url.search = "";
  return url.href;
}

function fitModalToArticle(): void {
  const resize = new ResizeObserver(([entry]) => {
    const box = (frameElement as HTMLElement | null)?.parentElement;
    if (!box) return;
    const scrollbar = innerWidth - document.documentElement.clientWidth;
    box.style.width = `${(entry.target as HTMLElement).offsetWidth + scrollbar}px`;
  });
  const watch = new MutationObserver(() => {
    const article = document.querySelector(KEEP);
    if (!article) return;
    watch.disconnect();
    resize.observe(article);
  });
  watch.observe(document, { childList: true, subtree: true });
}

function closeModal(): void {
  const doc = window.top!.document;
  const overlay = doc.getElementById(OVERLAY_ID);
  if (!overlay) return;
  doc.documentElement.style.overflow = overlay.dataset.overflow ?? "";
  overlay.remove();
}

function isArticlePage(): boolean {
  const top = new URL(window.top!.location.href);
  const inner = top.searchParams.get("iframe_url");
  return isArticleUrl(top.href) || (inner !== null && isArticleUrl(new URL(inner, top.origin).href));
}

function isArticleUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.hostname === "cafe.naver.com" && ARTICLE_PATH.some((re) => re.test(url.pathname));
  } catch {
    return false;
  }
}

async function redirectMobile(): Promise<void> {
  if (location.hostname !== "m.cafe.naver.com" || window !== window.top) return;
  const settings = await getSettings();
  if (settings.enabled && settings.cafeMobileRedirect) location.replace(desktopUrl(new URL(location.href)));
}

function desktopUrl(url: URL): string {
  const base = "https://cafe.naver.com";
  const path = url.pathname.replace(/^\/ca-fe/, "");
  const q = url.searchParams;

  const web = path.match(/^\/web\/cafes\/([\w-]+)(?:\/(articles|menus)\/(\d+))?/);
  if (web) {
    const [, cafe, kind, id] = web;
    if (/^\d+$/.test(cafe)) return kind ? `${base}/f-e/cafes/${cafe}/${kind}/${id}` : `${base}/f-e/cafes/${cafe}`;
    return kind === "articles" ? `${base}/${cafe}/${id}` : `${base}/${cafe}`;
  }
  if (/^\/ArticleRead\.nhn$/i.test(path) && q.get("clubid") && q.get("articleid")) {
    return `${base}/f-e/cafes/${q.get("clubid")}/articles/${q.get("articleid")}`;
  }
  return `${base}${path}${url.search}${url.hash}`;
}
