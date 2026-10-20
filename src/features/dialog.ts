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
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
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
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "취소";
  cancel.addEventListener("click", () => dialog.close("cancel"));
  const ok = document.createElement("button");
  ok.value = "ok";
  ok.className = options.danger ? "danger" : "primary";
  ok.textContent = options.confirmLabel;
  if (!input) ok.autofocus = true;
  actions.append(...(options.hideCancel ? [ok] : [cancel, ok]));
  form.append(actions);

  if (input) {
    const update = () => (ok.disabled = input!.value.trim() === "");
    input.addEventListener("input", update);
    update();
  }

  for (const type of ["keydown", "keyup", "keypress"]) {
    dialog.addEventListener(type, (e) => e.stopPropagation());
  }
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close("cancel");
  });

  const style = document.createElement("style");
  style.textContent = STYLE;
  dialog.append(form);
  root.append(style, dialog);
  document.body.append(host);

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      host.remove();
      resolve(dialog.returnValue === "ok" ? (input?.value ?? "") : null);
    });
    dialog.showModal();
    input?.select();
  });
}

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
