interface DialogOptions {
  title: string;
  message?: string;
  input?: { value?: string; placeholder?: string };
  confirmLabel: string;
  danger?: boolean;
  hideCancel?: boolean;
}

export async function alertDialog(options: { title: string; message: string }): Promise<void> {
  await showDialog({ ...options, confirmLabel: "확인", hideCancel: true });
}

export async function promptDialog(options: {
  title: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  const value = await showDialog({
    title: options.title,
    input: { value: options.value, placeholder: options.placeholder },
    confirmLabel: options.confirmLabel ?? "확인",
  });
  return value?.trim() || null;
}

export async function confirmDialog(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return (await showDialog({ ...options, confirmLabel: options.confirmLabel ?? "확인" })) !== null;
}

function showDialog(options: DialogOptions): Promise<string | null> {
  const dialog = document.createElement("dialog");
  const form = document.createElement("form");
  form.method = "dialog";

  const title = document.createElement("h2");
  title.textContent = options.title;
  form.append(title);

  if (options.message) {
    const message = document.createElement("p");
    message.textContent = options.message;
    form.append(message);
  }

  let input: HTMLInputElement | null = null;
  if (options.input) {
    input = document.createElement("input");
    input.value = options.input.value ?? "";
    input.placeholder = options.input.placeholder ?? "";
    input.maxLength = 30;
    input.autofocus = true;
    form.append(input);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const cancel = cancelButton(dialog);
  const ok = okButton(options.confirmLabel, options.danger ? "danger" : "primary");
  if (!input) ok.autofocus = true;
  actions.append(...(options.hideCancel ? [ok] : [cancel, ok]));
  form.append(actions);
  dialog.append(form);

  if (input) {
    const update = () => (ok.disabled = input!.value.trim() === "");
    input.addEventListener("input", update);
    update();
  }

  return new Promise((resolve) => {
    openDialog(dialog, STYLE, () => resolve(dialog.returnValue === "ok" ? (input?.value ?? "") : null));
    input?.select();
  });
}

function cancelButton(dialog: HTMLDialogElement): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "취소";
  button.addEventListener("click", () => dialog.close("cancel"));
  return button;
}

function okButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.value = "ok";
  button.className = className;
  button.textContent = label;
  return button;
}

function openDialog(dialog: HTMLDialogElement, css: string, onClose: () => void): void {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  for (const type of ["keydown", "keyup", "keypress"]) {
    dialog.addEventListener(type, (e) => e.stopPropagation());
  }
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close("cancel");
  });
  dialog.addEventListener("close", () => {
    host.remove();
    onClose();
  });
  const style = document.createElement("style");
  style.textContent = css;
  root.append(style, dialog);
  document.body.append(host);
  dialog.showModal();
}

export function orderDialog(options: {
  title: string;
  items: { key: string; label: string }[];
  defaults: string[];
}): Promise<string[] | null> {
  const dialog = document.createElement("dialog");
  const form = document.createElement("form");
  form.method = "dialog";

  const title = document.createElement("h2");
  title.textContent = options.title;
  const hint = document.createElement("p");
  hint.textContent = "항목을 끌어서 옮기거나 ▲▼로 순서를 바꿀 수 있습니다.";
  const list = document.createElement("ol");
  const labels = new Map(options.items.map((i) => [i.key, i.label]));
  let keys = options.items.map((i) => i.key);
  let reset = false;

  const render = () => {
    list.replaceChildren(
      ...keys.map((key, i) => {
        const li = document.createElement("li");
        const handle = document.createElement("span");
        handle.className = "handle";
        handle.textContent = "⠿";
        handle.setAttribute("aria-hidden", "true");
        const index = document.createElement("span");
        index.className = "index";
        index.textContent = String(i + 1);
        const label = document.createElement("span");
        label.className = "label";
        label.textContent = labels.get(key)!;
        label.title = label.textContent;
        li.append(handle, index, label, moveButton("▲", "위로", i, -1), moveButton("▼", "아래로", i, 1));
        li.addEventListener("pointerdown", (e) => startDrag(e, li, i));
        return li;
      }),
    );
  };
  const moveButton = (text: string, name: string, i: number, offset: -1 | 1) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "move";
    button.textContent = text;
    button.setAttribute("aria-label", name);
    button.disabled = i + offset < 0 || i + offset >= keys.length;
    button.addEventListener("click", () => {
      [keys[i], keys[i + offset]] = [keys[i + offset], keys[i]];
      reset = false;
      render();
      list.querySelectorAll("li")[i + offset]?.querySelector<HTMLButtonElement>(
        `[aria-label="${name}"]:not(:disabled)`,
      )?.focus();
    });
    return button;
  };

  const startDrag = (e: PointerEvent, li: HTMLLIElement, from: number) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    e.preventDefault();
    const items = [...list.querySelectorAll("li")];
    const centers = items.map((el) => el.offsetTop + el.offsetHeight / 2);
    const pitch = (items[1]?.offsetTop ?? 0) - items[0].offsetTop;
    const pointerY = (ev: PointerEvent) => ev.clientY - list.getBoundingClientRect().top + list.scrollTop;
    const startY = pointerY(e);
    let to = from;

    li.setPointerCapture(e.pointerId);
    li.classList.add("dragging");
    list.classList.add("sorting");

    const move = (ev: PointerEvent) => {
      const dy = pointerY(ev) - startY;
      li.style.transform = `translateY(${dy}px)`;
      const center = centers[from] + dy;
      to = centers.filter((c, j) => j !== from && c < center).length;
      items.forEach((el, j) => {
        if (j === from) return;
        const shift = from < j && j <= to ? -pitch : to <= j && j < from ? pitch : 0;
        el.style.transform = shift ? `translateY(${shift}px)` : "";
      });
      const rect = list.getBoundingClientRect();
      if (ev.clientY < rect.top + 24) list.scrollTop -= 8;
      else if (ev.clientY > rect.bottom - 24) list.scrollTop += 8;
    };
    const end = () => {
      li.removeEventListener("pointermove", move);
      li.removeEventListener("pointerup", end);
      li.removeEventListener("pointercancel", end);
      list.classList.remove("sorting");
      if (to !== from) {
        keys.splice(to, 0, ...keys.splice(from, 1));
        reset = false;
      }
      render();
    };
    li.addEventListener("pointermove", move);
    li.addEventListener("pointerup", end);
    li.addEventListener("pointercancel", end);
  };

  const actions = document.createElement("div");
  actions.className = "actions";
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "reset";
  resetButton.textContent = "기본 순서로";
  resetButton.addEventListener("click", () => {
    keys = [...options.defaults];
    reset = true;
    render();
  });
  const ok = okButton("저장", "primary");
  actions.append(resetButton, cancelButton(dialog), ok);

  render();
  form.append(title, hint, list, actions);
  dialog.append(form);

  return new Promise((resolve) => {
    openDialog(dialog, STYLE + ORDER_STYLE, () => resolve(dialog.returnValue === "ok" ? (reset ? [] : keys) : null));
    ok.focus();
  });
}

const ORDER_STYLE = `
  dialog { width: min(420px, calc(100vw - 32px)); }
  p { margin-bottom: 16px; }
  ol {
    position: relative;
    max-height: min(480px, 60vh);
    overflow-y: auto;
    margin: 0 0 20px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 8px 10px 10px;
    border: 1px solid var(--sem-color-border-neutral-weak, #3a3a40);
    border-radius: 8px;
    background: var(--sem-color-background-neutral-base, #141517);
    font-size: 14px;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  li:hover { border-color: var(--sem-color-content-neutral-alpha-strong, #777); }
  ol.sorting li { transition: transform .15s ease; cursor: grabbing; }
  ol.sorting li.dragging {
    z-index: 1;
    transition: none;
    border-color: var(--sem-color-content-brand-base, #00d564);
    box-shadow: 0 8px 20px rgba(0, 0, 0, .45);
  }
  .handle { font-size: 16px; line-height: 1; opacity: .5; }
  li:hover .handle, li.dragging .handle { opacity: 1; }
  .index {
    min-width: 20px;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    color: var(--sem-color-content-brand-base, #00d564);
  }
  .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  button.move { padding: 4px 8px; font-size: 12px; }
  button.move:disabled { opacity: .2; }
  button.reset { margin-right: auto; border: 0; padding-left: 0; padding-right: 0; font-weight: 400; opacity: .7; }
  button.reset:hover { background: none; opacity: 1; }
`;

const STYLE = `
  dialog {
    width: min(360px, calc(100vw - 32px));
    padding: 24px;
    border: 1px solid var(--sem-color-border-neutral-weak, #3a3a40);
    border-radius: 12px;
    background: var(--sem-color-background-neutral-weak, #1f1f23);
    color: var(--sem-color-content-neutral-primary, #fff);
    font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif;
    box-shadow: 0 12px 32px rgba(0, 0, 0, .4);
  }
  dialog::backdrop { background: rgba(0, 0, 0, .55); }
  h2 { margin: 0 0 12px; font-size: 17px; font-weight: 700; }
  p { margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: var(--sem-color-content-neutral-alpha-strong, #aaa); }
  input {
    box-sizing: border-box;
    width: 100%;
    margin-bottom: 20px;
    padding: 10px 12px;
    border: 1px solid var(--sem-color-border-neutral-weak, #3a3a40);
    border-radius: 8px;
    background: var(--sem-color-background-neutral-base, #141517);
    color: inherit;
    font: inherit;
    font-size: 14px;
    outline: none;
  }
  input:focus { border-color: var(--sem-color-content-brand-base, #00d564); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  button {
    padding: 8px 16px;
    border: 1px solid var(--sem-color-border-neutral-weak, #3a3a40);
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { background: rgba(128, 128, 128, .15); }
  button.primary { border-color: transparent; background: var(--sem-color-content-brand-base, #00d564); color: #000; }
  button.danger { border-color: transparent; background: var(--sem-color-content-accent-red-strong, #ff5454); color: #fff; }
  button.primary:hover, button.danger:hover { filter: brightness(1.1); }
  button:disabled { opacity: .4; cursor: default; filter: none; }
`;
