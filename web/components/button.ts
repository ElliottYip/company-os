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
  button.className = `cos-button cos-button--${options.tone ?? "secondary"}`;
  button.textContent = options.label;
  button.disabled = options.disabled ?? false;
  button.addEventListener("click", options.onClick);
  return button;
}

