# Company OS visual token contract

This contract consolidates the Generator-informed Company OS visual language. Paperclip remains a density reference only. Neither reference imports product copy, brand, runtime concepts, information architecture or domain semantics.

## Typography

| Role | Token | Intended use |
| --- | --- | --- |
| Display | `--type-display` | Public front-door statement only |
| Hero title | `--type-hero-title` | Dashboard-level product statement |
| Page title | `--type-page-title` | One `h1` per product page |
| Detail title | `--type-detail-title` | Drawer/modal record title and primary task title |
| Section title | `--type-section-title` | `h2` and compact surface headings |
| Panel title | `--type-panel-title` | Local card, drawer and modal group headings |
| Lead | `--type-lead` | Front-door supporting proposition only |
| Body | `--type-body` | Primary readable content and record names |
| Control | `--type-control` | Buttons, tabs, inputs and navigation |
| Supporting | `--type-supporting` | Descriptions and secondary content |
| Label | `--type-label` | Metadata labels, status and helper copy |
| Micro | `--type-micro` | Keyboard hints and non-essential compact annotations only |
| Metric | `--type-metric` | Compact dashboard and budget numbers |

The implemented product scale is display 48–76px for the public entry only, with a 36px narrow-screen role; the working surface uses page 20px, detail 16px, section 14px, panel/body/control 13px, supporting 12px, label 11px, micro 10px and metric 20px. This gives the front door an unmistakable Generator-informed composition while preserving the same compact optical density between the navigation rail and working lane. Labels and micro copy may not carry decisions, errors, risk, identity, cost, evidence or responsibility meaning without a larger accompanying text role.

The `.family-ui` root owns the inherited family, body size, regular weight and body leading for both the rail and the content lane. Headings and semantic emphasis inherit zero-specificity defaults, so an unstyled right-pane element cannot fall back to the browser's unrelated 16px/700 hierarchy.

Locale order is part of the contract, not an implementation accident. English and Chinese use Generator's single `SF Pro Text`, PingFang, Hiragino and YaHei fallback chain. Locale changes copy and wrapping but never switch the Latin/numeric font priority between the rail and working lane. Technical references alone use the declared IBM Plex/SF Mono fallback chain.

Weights are limited to 400, 500 and 600 through `--weight-regular`, `--weight-medium`, `--weight-semibold`, and the 600 alias `--weight-bold`. Line heights are named roles as well: display, title, lead, body, compact, metric and icon. Numeric metrics and timestamps use tabular numerals. Icon glyph sizes use the separate `--icon-glyph-*` scale so they can never become an accidental text role. Every meaningful label in the Office and Workforce views consumes semantic type tokens.

This hierarchy is a build contract rather than guidance. `npm run check:web-visual-contract` scans every shipped Web stylesheet and fails on raw `font-size`, `font-weight`, `line-height`, uncontracted responsive breakpoints, page-level negative margins, a missing centered page lane, or deletion of a required token. Browser E2E independently checks the computed font family, semantic size, weight and line-height of every visible heading, paragraph, label, control and table cell in both languages. Native selects are the sole computed-line-height exception because Chromium reports `normal` even when the shared declared leading is present; their family, size, weight and control height remain verified.

## Spacing, density and shape

- Spacing: `--space-1` through `--space-8`, based on a 4px unit.
- Page geometry: `--layout-page-max` caps the working lane at 1152px; `--layout-page-gutter` owns the desktop inset; `--layout-section-inset` and `--layout-row-inset` are the only default panel and row paddings.
- Shell geometry: `--layout-rail-width` is 200px and `--layout-topbar-height` is 52px. The rail brand, top bar, workspace height and list toolbar consume these tokens rather than repeating local measurements.
- Controls: `--control-height` owns the 34px default and `--control-height-comfortable` owns 38px form fields and full-width filter tabs; 30–32px remains reserved for compact icon controls.
- Rows: 52–60px for scan-heavy lists; cards do not add vertical whitespace without information priority.
- Radius: 4px status/counter badge, 6px action/compact/form control, 8px ordinary panel and 10px focal/overlay surface. Textual product labels never use a fully rounded pill; only literal circular indicators such as health dots remain round.
- Shadows: ordinary working surfaces do not use shadows. Overlays and anchored popovers alone use the shared overlay shadow. Borders and whitespace own product structure.

## Alignment and wrapping

- Page and section headings align to the working-lane left edge. Actions align to the same right edge and never create an independent inset.
- Page titles are limited by `--text-measure-title`, use balanced wrapping and may occupy at most two visual lines under normal localized copy.
- Descriptive copy is limited by `--text-measure-body`, uses natural word breaking and `text-wrap: pretty`; Chinese and English may wrap differently without changing hierarchy.
- Identity and scan-list primary labels use the one-line ellipsis contract. Supporting summaries that must remain scannable use the two-line clamp contract.
- Buttons, tabs, status labels and short counters never wrap. They move as complete controls or the container changes layout at the breakpoint.
- IDs, digests, Runtime references and other technical values opt into `data-technical-value` / `.family-technical` and may break anywhere. This behavior must never be applied to normal prose.
- Digest, source and timestamp metadata are separate semantic fields. A record row may truncate each field independently on wide screens and must stack them on narrow screens; it may not concatenate them into one prose line.
- Numeric columns use `.family-numeric`, tabular figures and right alignment. Text columns remain left aligned.

## Semantic color

The analytical work canvas is cool gray `#f6f7f9`; navigation and primary data surfaces remain white. Quiet interaction surfaces are `#f3f5f8`, raised context is `#fafbfc`, primary ink is `#111827`, body ink is `#273142`, and structural borders use `#e6e9ee` / `#d7dce3`. This makes data panels legible as a hierarchy instead of white cards disappearing into a white page. Focus remains `#0075de`. Routine working, ready, open and completed states use neutral surfaces; warning and danger colors are reserved for action-required or blocked states. Status meaning must include text or an icon and never rely on color alone.

## Responsive rules

- 1440px: full navigation rail; portfolio and governance grids may use three columns only when every column preserves readable identifiers.
- 1024px: full rail remains; content grids use at most two columns and long identifiers wrap at semantic separators without clipping.
- 860px and below: the desktop rail collapses; every public Demo destination remains reachable from the portfolio bottom navigation.
- 760px and below: compact overlay behavior; drawers become full-width sheets.
- 560px and below: safety labels remain complete, page safety badges stack below title copy and navigation uses short visible labels with full accessible names.
- English and Chinese share identical roles and spacing; copy length changes wrapping, not the hierarchy.

The only admitted CSS breakpoints are 1180 (wide action/tool grids), 1080 (two-column work surfaces and rail-constrained Settings rows), 960 (specialized office canvas), 860/861 (rail-to-compact shell boundary), 760 (overlay/tablet contract), 680 (narrow organization actions), 560 (phone contract), and 420 (small-phone overlay contract). A page may consume an existing breakpoint but may not invent another one. Every `.page-stage` uses `width: 100%`, the shared maximum and automatic inline margins; page subclasses may not opt out of that centered lane.
