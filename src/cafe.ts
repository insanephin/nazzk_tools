import { getSettings } from "./shared/settings";
import { STEAM_PLAYER_PAGE, type SteamTrailer } from "./shared/steam";

const FRAME_NAME = "nazzk-toolkit-cafe";
const SECTION_HOST = "section.cafe.naver.com";
const OPEN_PARAM = "nazzk_article";
const OVERLAY_ID = "nazzk-toolkit-cafe-overlay";
const ARTICLE_PATH = [
  /^\/(f-e|ca-fe)\/cafes\/\d+\/articles\/\d+\/?$/,
  /^\/ArticleRead\.nhn$/i,
  /^\/[\w-]+\/\d+\/?$/,
];

const ARTICLE = ".ArticleContentBox";
const OWNER_BTNS = ".ArticleBottomBtns";
const KEEP = `${ARTICLE}, ${OWNER_BTNS}`;
const FRAME_CSS = `
  body *:not(:has(${KEEP})):not(${KEEP}):not(:is(${KEEP}) *) { display: none !important; }
  html, body, body *:has(${KEEP}) { margin: 0 !important; padding: 0 !important; }
  ${ARTICLE} { border: 0 !important; border-radius: 0 !important; }
  ${ARTICLE} iframe { max-height: calc(100vh - 32px) !important; }
  ${OWNER_BTNS} { padding: 12px 29px 20px !important; }
  ${OWNER_BTNS} .right_area { display: none !important; }
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
  leaveFrameOnNavigate();
}
redirectMobile();
openPendingArticle();
unwrapCafeShell();
if (location.hostname !== SECTION_HOST) watchClips();
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

function embedSteam(anchor: HTMLAnchorElement, appId: string): void {
  const key = `steam:${appId}`;
  const card = anchor.closest<HTMLElement>(".se-module-oglink");
  card?.querySelectorAll<HTMLElement>("a[href]").forEach((a) => (a.dataset[CLIP_DONE] = "1"));
  const block = (card ?? anchor).closest<HTMLElement>(".se-section, p") ?? anchor;
  if (document.querySelector(`iframe[${CLIP_ATTR}="${key}"]`)) {
    if (card) block.remove();
    return;
  }
  const widget = steamWidget(key, appId);
  if (card) block.replaceWith(widget);
  else block.after(widget);
  const frame = playerFrame(`${key}:trailer`);
  frame.style.display = "none";
  widget.after(frame);
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

function steamWidget(key: string, appId: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.setAttribute(CLIP_ATTR, key);
  frame.src = `https://store.steampowered.com/widget/${appId}/?l=koreana`;
  frame.style.cssText = "display:block;width:100%;max-width:646px;height:190px;margin:8px 0;border:0";
  return frame;
}

function playerFrame(key: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.setAttribute(CLIP_ATTR, key);
  frame.allow = "autoplay; fullscreen; clipboard-write";
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
    if (location.hostname === SECTION_HOST) openViaList(anchor);
    else openModal(articleFrameUrl(anchor.href));
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
  frame.allow = "autoplay; fullscreen; clipboard-write";
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
  const ids = articleIds(url);
  if (!ids) return href;
  if (/^\/ArticleRead\.nhn$/i.test(url.pathname)) url.search = "";
  url.pathname = `/ca-fe/cafes/${ids[0]}/articles/${ids[1]}`;
  return url.href;
}

function articleIds(url: URL): [string, string] | null {
  const path = url.pathname.match(/^\/(?:f-e|ca-fe)\/cafes\/(\d+)\/articles\/(\d+)/);
  if (path) return [path[1], path[2]];
  const club = url.searchParams.get("clubid");
  const article = url.searchParams.get("articleid");
  return /^\/ArticleRead\.nhn$/i.test(url.pathname) && club && article ? [club, article] : null;
}

function openViaList(anchor: HTMLAnchorElement): void {
  const article = new URL(anchor.href);
  const ids = articleIds(article);
  const list = new URL(ids ? listPath(ids[0]) : `/${article.pathname.split("/")[1]}`, article.origin);
  list.searchParams.set(OPEN_PARAM, anchor.href);
  if (anchor.target === "_blank") window.open(list.href, "_blank", "noopener");
  else location.href = list.href;
}

function openPendingArticle(): void {
  if (window !== window.top || location.hostname !== "cafe.naver.com") return;
  const url = new URL(location.href);
  const article = url.searchParams.get(OPEN_PARAM);
  if (!article || !isArticleUrl(article)) return;
  url.searchParams.delete(OPEN_PARAM);
  history.replaceState(history.state, "", url.href);
  const open = () => {
    openModal(articleFrameUrl(article));
    if (!/^\/(?:f-e|ca-fe)\/cafes\/\d+/.test(location.pathname)) {
      document.getElementById(OVERLAY_ID)!.dataset.toList = "1";
    }
  };
  if (document.body) open();
  else addEventListener("DOMContentLoaded", open, { once: true });
}

function unwrapCafeShell(): void {
  if (window === window.top) return;
  try {
    const ids = articleIds(new URL(location.href));
    if (window.parent.name !== FRAME_NAME || !ids) return;
    const article = articleFrameUrl(location.href);
    if (window.top!.document.getElementById(OVERLAY_ID)?.dataset.toList) {
      const list = new URL(listPath(ids[0]), location.origin);
      list.searchParams.set(OPEN_PARAM, article);
      window.top!.location.replace(list.href);
    } else {
      window.parent.location.replace(article);
    }
  } catch {}
}

function listPath(clubId: string): string {
  return `/f-e/cafes/${clubId}/menus/0`;
}

function fitModalToArticle(): void {
  const resize = new ResizeObserver(([entry]) => {
    const box = (frameElement as HTMLElement | null)?.parentElement;
    if (!box) return;
    const scrollbar = innerWidth - document.documentElement.clientWidth;
    box.style.width = `${(entry.target as HTMLElement).offsetWidth + scrollbar}px`;
  });
  const watch = new MutationObserver(() => {
    const article = document.querySelector(ARTICLE);
    if (!article) return;
    watch.disconnect();
    resize.observe(article);
  });
  watch.observe(document, { childList: true, subtree: true });
}

function leaveFrameOnNavigate(): void {
  const path = location.pathname;
  const check = () => {
    if (location.pathname !== path) window.top!.location.href = location.href;
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true });
  addEventListener("popstate", check);
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
  const inner = top.searchParams.get("iframe_url") ?? top.searchParams.get("iframe_url_utf8");
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
