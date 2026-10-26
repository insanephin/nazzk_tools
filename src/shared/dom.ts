export const MARK = "data-nazzk-toolkit";

export function cls(name: string): string {
  return `:is([class^="_${name}_"], [class*=" _${name}_"])`;
}

export function hasClass(el: Element, name: string): boolean {
  return [...el.classList].some((t) => t.startsWith(`_${name}_`));
}

export function oncePerFrame(fn: () => void): () => void {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn();
    });
  };
}
