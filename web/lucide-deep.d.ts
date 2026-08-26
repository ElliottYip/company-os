declare module "lucide/dist/esm/icons/*.mjs" {
  import type { IconNode } from "lucide";

  const icon: IconNode;
  export default icon;
}

declare module "lucide/dist/esm/createElement.mjs" {
  import type { IconNode, SVGProps } from "lucide";

  export default function createElement(
    icon: IconNode,
    customAttributes?: SVGProps,
  ): SVGElement;
}
