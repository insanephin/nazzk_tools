import type { ChargeConfirmAction } from "../shared/settings";

const TITLE = "치즈 충전 완료!";
const LABELS: Record<Exclude<ChargeConfirmAction, "none">, string[]> = {
  cancel: ["취소"],
  donate: ["후원하기"],
};
const ARMED_MS = 10_000;

let action: ChargeConfirmAction = "none";
let armedUntil = 0;
let observer: MutationObserver | null = null;

export function mountChargeConfirm(next: ChargeConfirmAction): void {
  action = next;
  if (observer) return;
  observer = new MutationObserver(handleChargeConfirm);
  observer.observe(document.body, { childList: true, subtree: true });
  addEventListener("message", onMessage);
}

export function unmountChargeConfirm(): void {
  observer?.disconnect();
  observer = null;
  removeEventListener("message", onMessage);
  armedUntil = 0;
}

function onMessage(e: MessageEvent): void {
  if (/\.naver\.com(:\d+)?$/.test(e.origin) && e.data?.paymentStatus === "COMPLETE") {
    armedUntil = Date.now() + ARMED_MS;
  }
}

function handleChargeConfirm(): void {
  if (action === "none" || Date.now() > armedUntil) return;
  for (const dialog of document.querySelectorAll<HTMLElement>('[role="alertdialog"]')) {
    if (!dialog.textContent?.includes(TITLE)) continue;
    const labels = LABELS[action];
    const button = [...dialog.querySelectorAll("button")].find((b) => labels.includes(b.textContent?.trim() ?? ""));
    if (!button) continue;
    armedUntil = 0;
    button.click();
    if (action === "donate") dialog.style.visibility = "hidden";
    return;
  }
}
