export type ButtonTone = "primary" | "secondary" | "quiet" | "danger";

export interface ButtonOptions {
  readonly label: string;
  readonly tone?: ButtonTone;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export function createButton(options: ButtonOptions): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  const tone = options.tone ?? "secondary";
  button.className = `family-button family-button--${tone} cos-button cos-button--${tone}`;
  button.textContent = options.label;
  button.disabled = options.disabled ?? false;
  button.addEventListener("click", options.onClick);
  return button;
}
