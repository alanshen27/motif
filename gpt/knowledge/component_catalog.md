# Motif — Component Catalog (v0.2, shadcn-inspired token system)

Static SPA HTML + Tailwind (Play CDN) + minimal vanilla JS. This is a **shadcn-inspired token and component system**: static HTML recipes that adapt shadcn's design conventions (semantic tokens, variant recipes), with primitives styled entirely through **global CSS variables in `:root`**, so a whole design direction is re-themed by editing one token block — never by rewriting component classes.

**Limitation — no real shadcn/ui dependency.** There is no React, Radix UI, TypeScript, or npm package here, and none may be added. Visual similarity does not establish behavioral parity: interactive recipes (`tabs`, `dialog`, `dropdown-menu`, `switch`, …) must implement their required accessibility behavior manually — the keyboard support, ARIA states, and focus management specified in each entry are obligations on the generated code, not something a library provides.

## 1. The token system (mandatory boilerplate)

Every prototype includes this in `<head>`, right after the Play CDN script. Components reference tokens ONLY through the mapped utilities (`bg-primary`, `text-muted-foreground`, `rounded-lg`, `ring-ring`, …).

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          border: 'hsl(var(--border))',
          input: 'hsl(var(--input))',
          ring: 'hsl(var(--ring))',
          background: 'hsl(var(--background))',
          foreground: 'hsl(var(--foreground))',
          primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
          secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
          destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
          muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
          accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
          card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
          popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        },
        borderRadius: {
          lg: 'var(--radius)',
          md: 'calc(var(--radius) - 2px)',
          sm: 'calc(var(--radius) - 4px)',
        },
        fontFamily: {
          sans: 'var(--font-sans)',
          display: 'var(--font-display)',
        },
      },
    },
  };
</script>
<style>
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
    --font-sans: ui-sans-serif, system-ui, sans-serif;
    --font-display: var(--font-sans);
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
  body { background-color: hsl(var(--background)); color: hsl(var(--foreground)); font-family: var(--font-sans); }
</style>
```

### Theming rules

- **A design direction = a token block.** Re-theme by editing `:root` values (HSL triplets without `hsl()`, shadcn convention) — palette logic, `--radius` (sharp 0rem / neutral 0.5rem / friendly 1rem), and font variables. Component markup stays identical across directions.
- Contrast pairs travel together: if you change `--primary`, re-verify `--primary-foreground` hits ≥4.5:1.
- Never hardcode `bg-neutral-900`-style palette classes in components; that breaks the system. One-off accents belong in new variables, not inline colors.
- Dark mode is a `.dark` override block — only when the brief justifies it (T10).

### Shared focus/interaction recipe

All interactive elements use: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 transition-colors`.
Referred to below as **[focus]**.

### Extending the catalog inline (encouraged)

This catalog is a floor, not a ceiling. When the brief needs something not listed — a bespoke section, a new primitive variant, a custom visual device — **build it inline in the prototype**. Requirements for inline additions:

- Style only through token utilities (or a new `--variable` added to the `:root` block) so the direction stays re-themeable.
- Reuse the **[focus]** recipe and the a11y obligations of the nearest primitive; new interactive patterns need full keyboard support.
- Stay inside the JS conventions (§4); no new external dependencies.

**Component Extension Log.** Record every significant invented component or composed pattern in a concise log presented alongside the prototype (trivial wrappers and purely decorative elements are exempt). Each entry states:

- **ID** — stable dotted-lowercase, e.g. `gallery.masonry`, `chart.sparkline`;
- **Purpose** — what it does for this brief;
- **Why the catalog was insufficient** — which existing entry was closest and why it didn't fit;
- **A11y obligations** — the keyboard/ARIA/focus behavior it implements;
- **Status** — one-off, or candidate for later catalog promotion.

Inline one-off CSS (in the existing `<style>` block) is fine for effects Tailwind utilities can't express — keep it token-driven.

---

## 2. Primitives (shadcn-inspired static recipes)

Format: **ID · purpose · variants · a11y · recipe**. Recipes are copy-paste class strings; compose bigger components from these, don't reinvent. Interactive entries list their accessibility behavior explicitly because it must be implemented by hand in vanilla JS (see the limitation above).

### `button`
Actions and navigation. `<button>` for actions, `<a>` styled identically for navigation.
**Variants:** `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`. **Sizes:** `sm` (h-9 px-3), `default` (h-10 px-4 py-2), `lg` (h-11 px-8), `icon` (h-10 w-10, needs `sr-only` label).

```html
<button type="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 [focus]">Label</button>
```

Variant swaps: secondary `bg-secondary text-secondary-foreground hover:bg-secondary/80` · destructive `bg-destructive text-destructive-foreground hover:bg-destructive/90` · outline `border border-input bg-background hover:bg-accent hover:text-accent-foreground` · ghost `hover:bg-accent hover:text-accent-foreground` · link `text-primary underline-offset-4 hover:underline`.

### `badge`
Status/category tag. **Variants:** `default`, `secondary`, `destructive`, `outline`. Not interactive; tone also conveyed by text (never color alone). Pitfall T2: never decorative hero garnish.

```html
<span class="inline-flex items-center rounded-full border border-transparent bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">Active</span>
```

### `card`
Container with header/content/footer slots — **use sparingly** (T4).
**A11y:** if fully clickable, exactly one real link (the title) stretched with `absolute inset-0`; no nested interactives.

```html
<article class="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
  <div class="flex flex-col space-y-1.5 p-6">
    <h3 class="text-2xl font-semibold leading-none tracking-tight">Title</h3>
    <p class="text-sm text-muted-foreground">Description</p>
  </div>
  <div class="p-6 pt-0">…content…</div>
  <div class="flex items-center p-6 pt-0">…actions…</div>
</article>
```

### `label` + `input` / `textarea` / `select`
**A11y:** explicit `<label for>`; help/error wired via `aria-describedby`; errors get text + `border-destructive`, never color alone; `required` attribute mirrors the visual mark. Placeholder is not a label.

```html
<div class="grid gap-1.5">
  <label for="email" class="text-sm font-medium leading-none">Email <span aria-hidden="true">*</span></label>
  <input id="email" name="email" type="email" required aria-describedby="email-help"
         class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground [focus]" />
  <p id="email-help" class="text-sm text-muted-foreground">Help or error text.</p>
</div>
```

`textarea`: same classes, `min-h-[80px]`. `select`: same classes on a native `<select>`.

### `checkbox` / `switch`
Native inputs, token-styled. Checkbox: `h-4 w-4 rounded-sm border-input text-primary accent-[hsl(var(--primary))] [focus]` with a wrapping `<label>`. Switch: `<button role="switch" aria-checked>` toggling `bg-primary`/`bg-input` on track + translating thumb; label required; ~8 lines JS.

### `alert`
Inline status. **Variants:** `default`, `destructive`.
**A11y:** `role="status"` (info/success) or `role="alert"` (errors); tone carried by icon/prefix word + color; dismiss is a labeled ghost `button`.

```html
<div role="alert" class="relative w-full rounded-lg border border-destructive/50 p-4 text-destructive">
  <h5 class="mb-1 font-medium leading-none tracking-tight">Error</h5>
  <p class="text-sm">Something specific went wrong.</p>
</div>
```

### `separator`
`<hr class="border-0 h-px bg-border" />` (or `w-px h-full` vertical with `role="separator" aria-orientation="vertical"`).

### `avatar`
`<span class="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted text-sm font-medium items-center justify-center">AB</span>` — initials fallback; real `<img alt>` when a face exists.

### `skeleton`
Loading placeholder: `<div class="animate-pulse rounded-md bg-muted h-4 w-2/3" aria-hidden="true"></div>`; container gets `aria-busy="true"` + `sr-only` status text.

### `table`
Real `<table>` for comparison/spec data — never card grids (T4).
**A11y:** `<caption>`, `<th scope>`; highlighted column marked in text ("Recommended"); mobile wrapper `overflow-x-auto` + `tabindex="0"` + `aria-label`.

```html
<div class="w-full overflow-x-auto" tabindex="0" aria-label="Plan comparison table">
  <table class="w-full caption-bottom text-sm">
    <caption class="mt-4 text-sm text-muted-foreground">Feature comparison.</caption>
    <thead><tr class="border-b border-border">
      <th scope="col" class="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Feature</th>
    </tr></thead>
    <tbody><tr class="border-b border-border hover:bg-muted/50"><td class="p-4 align-middle">…</td></tr></tbody>
  </table>
</div>
```

### `tabs` *(JS)*
Peer views. `role="tablist"` / `tab` + `aria-selected` + `aria-controls` / `tabpanel` + `aria-labelledby`; roving tabindex with ArrowLeft/Right (mandatory); panels toggled with `hidden`.
Trigger recipe: list `inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground`; active tab `bg-background text-foreground shadow-sm rounded-sm px-3 py-1.5 text-sm font-medium [focus]`.

### `dialog` *(JS)*
Native `<dialog>` only. `showModal()` gives focus trap + Esc; `aria-labelledby` on the title; labeled close; focus returns to trigger.
Panel: `w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg backdrop:bg-black/60`.

### `accordion`
Native `<details>`/`<summary>` with `divide-y divide-border`; summary `flex items-center justify-between py-4 text-sm font-medium [focus]` + `group-open:rotate-180` chevron. JS only for single-open behavior.

### `dropdown-menu` *(JS, sparing)*
`<button aria-expanded aria-haspopup="menu">` + `role="menu"`/`menuitem` panel: `min-w-[8rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md`. Esc closes, focus returns. Prefer visible links when space allows.

### `tooltip`
Prefer visible helper text (`text-muted-foreground`). If needed: CSS-only via `group-hover`/`group-focus-within` panel wired with `aria-describedby` — content must never be essential.

---

## 3. Composed patterns (built ONLY from §2 primitives + tokens)

These are assembly guides, not new styling systems. Layout utilities (grid/flex/spacing) are free; colors/radii/type always come from tokens.

### `nav.header`
`<header class="border-b border-border"><nav aria-label="Main">` — brand link, `<ul>` links (`text-sm text-muted-foreground hover:text-foreground`, `aria-current="page"` on active), `button:default` CTA. Mobile: `button:ghost icon` toggle with `aria-expanded`/`aria-controls`, menu `hidden md:flex`, ~6 lines JS.

### `footer.columns`
`<footer class="border-t border-border bg-muted/40">` — heading-titled link columns, `separator`, fineprint in `text-muted-foreground`. No fake badges (T12); placeholder links visibly labeled "(coming soon)" + `aria-disabled`.

### `hero.split` / `hero.editorial` / `hero.task`
- **split:** 2-col grid, `<h1 class="font-display text-4xl md:text-5xl font-semibold tracking-tight">`, dek `text-muted-foreground max-w-prose`, `button:default` + `button:link`, media slot = real UI/data/domain texture (T11).
- **editorial:** type-led asymmetric grid, oversize `font-display` line, meta row in `text-sm text-muted-foreground` with `separator`s.
- **task:** the primary input IS the hero — `label`+`input`+`button:default` in a real `<form>`, example chips as `badge:outline`.
Pitfalls: T1/T2 — no reflexive centered stack with pill badge; heading is the page's one `<h1>`.

### `section.features`
Variants by content shape (T4: equal-card `grid` is last resort): `list` (stacked prose + `separator`s), `alternating` (media/text zigzag), `grid` (true peers only, `card`), `bento` (mixed-size `card`s when importance is asymmetric). Section labeled via `aria-labelledby`; items get `<h3>`.

### `section.steps`
`<ol>` with visible numerals in `bg-muted text-muted-foreground rounded-full h-8 w-8` markers, connected by `border-border` rules — no floating cards.

### `evidence.timeline`
`<ol class="relative border-s border-border">`, each item with `<time datetime>` in `text-sm text-muted-foreground`, marker dots `bg-primary` + non-color labels.

### `stats.row`
`<dl>` pairs — `<dd class="text-4xl font-semibold tracking-tight">` + `<dt class="text-sm text-muted-foreground">` — plus a source caption. T12: no invented numbers; mark content-needed.

### `testimonial.single`
`<figure>` with `blockquote` (`text-xl font-medium leading-relaxed`), `figcaption` with `avatar` + name/role in `text-muted-foreground`. One substantiated quote beats a card wall.

### `pricing.tiers`
2–3 `card`s (or `table` when feature-heavy): tier `<h3>`, price `text-4xl font-semibold`, `<ul>` features, `button:default` on emphasized tier (`border-primary` + text label "Most popular"), `button:outline` on the rest.

### `faq.accordion`
`accordion` primitive inside a `max-w-3xl` section with `<h2>`.

### `cta.final`
Single closing action: `<h2>` + one `button:default` (`lg`), concrete verb, optional `text-muted-foreground` support line. Not a second hero.

### `form.simple`
`label`+`input`/`textarea` stack + `button:default`; prototype-only `preventDefault()` with confirmation in a `role="status"` region; errors injected into each field's `aria-describedby` target + `border-destructive`.

### `theme.toggle` *(optional, T10-justified)*
`switch` primitive with visible text label; toggles `.dark` on `<html>`; persists `localStorage`; respects `prefers-color-scheme` default.

---

## 4. JS conventions

One `<script>` at end of `<body>`, IIFE, behaviors keyed by `data-*`, every query null-checked, no globals beyond optional `motif`, zero console errors, no eval/external requests. Baseline behaviors: nav toggle, tabs, dialog, accordion single-open, switch/theme toggle, in-page filter/sort. Richer hand-written interactions (mini product demos, command palettes, carousels, drag-to-reorder, canvas/SVG visualizations, scroll-driven reveals) are encouraged when they serve the brief — see `prototype_rules.md` §6 for the guardrails (keyboard operability, reduced-motion, no external libraries).

## 5. Good/bad usage

- **Good:** compliance tool → `hero.task` + `table` for limits + `evidence.timeline` for audit history; direction expressed by tokens: `--radius: 0`, cold `--primary`, mono-influenced `--font-display`.
- **Bad:** same brief → centered hero + pill badge + three equal-card grids + gradient headline (T1+T2+T3+T4), colors hardcoded per component.
- **Good:** editorial magazine → `hero.editorial` with `--font-display` serif and `--radius: 0`, features as `list`, zero cards.
- **Bad:** `dialog` hiding IA problems; `dropdown-menu` where visible links fit.
