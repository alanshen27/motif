# Motif — Prototype Rules (mandatory for every generated prototype)

## 1. Output contract

The deliverable is **a self-contained responsive HTML prototype using Tailwind Play CDN, vanilla JavaScript, and a shadcn-inspired token/component system** — one complete SPA in a single HTML file that opens directly in a browser with zero build configuration. It is a prototype, not a production application, and is never described as one.

For new concepts and open-ended work, the user normally chooses one of the presented design directions before a full prototype is built (direction workflow: `design_agent_instructions.md` §5); skip the choice step only when the user requests immediate execution.

- **Tailwind CSS via the Play CDN** in `<head>`:
  `<script src="https://cdn.tailwindcss.com"></script>`
  followed by the **mandatory token boilerplate** from `component_catalog.md` §1: the inline `tailwind.config` mapping and the `:root` CSS-variable block (shadcn-inspired `--background`, `--primary`, `--radius`, font variables, optional `.dark` overrides). All component styling goes through these tokens; a design direction is expressed by editing the `:root` block, never by hardcoding palette classes.
- **Minimal vanilla JavaScript** in ONE `<script>` at the end of `<body>`. No frameworks, no npm, no module imports, no external JS besides the Tailwind CDN.
- Fonts: system stack by default; Google Fonts `<link>` allowed when typography is central to the direction (max 2 families).
- Images: inline SVG, CSS-drawn shapes, or clearly labeled placeholder blocks. **Never** hotlink third-party/reference images or use unverified stock URLs.
- Deliver as a downloadable file when the environment can create files; otherwise one complete fenced code block. Never emit fragments.

## 2. Mandatory labeling

Top of every file:

```html
<!--
  PROTOTYPE ONLY — not a production application.
  Styling: Tailwind CSS via the Play CDN; this CDN setup is not intended for production deployment.
  Behavior: implemented with vanilla JavaScript (no frameworks).
  Motif <date> · Direction: <name> · Brief: <one line>
  Accessibility exceptions (if any): <list or "none">
-->
```

And say in chat: "This uses the Tailwind Play CDN and is prototype-only; the compiled Action path produces static CSS for production-like output."

## 3. Document skeleton

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><Product> — <Page></title>
  <meta name="description" content="..." />
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- REQUIRED: tailwind.config token mapping + :root CSS variables (component_catalog.md §1) -->
</head>
<body>
  <a href="#main" class="sr-only focus:not-sr-only ...">Skip to content</a>
  <header>…</header>
  <main id="main">…</main>
  <footer>…</footer>
  <script>/* all behavior here */</script>
</body>
</html>
```

## 4. Semantics and accessibility (WCAG 2.2 AA intent)

- Landmarks: `header`, `nav` (with `aria-label`), `main`, `footer`. Exactly one `<h1>`; heading levels never skip.
- Keyboard: every interaction reachable and operable by keyboard; visible focus (`focus-visible:` ring/outline on ALL interactive elements); skip link first in DOM.
- Contrast: ≥4.5:1 body text, ≥3:1 large text and UI components. You chose the hex values — verify them; don't guess.
- State: never color alone; pair with text, icon, weight, or border.
- Forms: real `<label for>`, `aria-describedby` for help/errors, `role="status"`/`role="alert"` for async messages.
- Media: meaningful `alt`, or `alt=""` + `aria-hidden` when decorative.
- Touch targets ≈44px minimum. Respect `prefers-reduced-motion` for any animation.

## 5. Responsiveness

- Mobile-first utilities; must be sound at **390px** and **1440px** (and not broken between).
- No horizontal page scroll at 390px. Data tables get a scrollable wrapper (`overflow-x-auto`, `tabindex="0"`, `aria-label`), not a broken squeeze.
- Nav collapses to an accessible disclosure below `md`. Type scales down responsively (`text-4xl md:text-6xl`, etc.).

## 6. JavaScript rules

- Vanilla only, one script block, wrapped in an IIFE or `DOMContentLoaded` handler; no globals except an optional `motif` namespace.
- Behaviors bound via `data-*` attributes; every query null-checked so partial pages don't throw.
- **Zero console errors.** No `console.log` left in. No `eval`, no dynamic script injection, no external requests.
- Prototype forms `preventDefault()` and show an inline confirmation.
- Allowed behavior budget: nav toggle, tabs, dialog, accordion single-open, theme toggle, simple filtering/sorting of in-page data, scroll-spy. Anything heavier belongs in a real build, not a prototype.

## 7. Content rules

- No lorem ipsum. Write specific copy from the brief (rubric dimension 9).
- No fake verifiable claims (T12): placeholder metrics/testimonials are visibly marked as content-needed.
- No dead links: in-page anchors must resolve; genuinely-external stubs get `aria-disabled="true"` and a label like "(coming soon)".

## 8. Design-quality gate (before presenting)

1. Check against `anti_template_patterns.md` — justify or remove any flagged pattern.
2. Check against the project banned-patterns list.
3. Confirm the direction's tokens (radius, spacing, type roles, color logic) are applied consistently — the catalog skeletons must be re-tokened.
4. Mini self-audit with the rubric; fix severity ≥3 before presenting; mention remaining S2s honestly.
5. **Use demonstration (T11a):** the prototype visibly demonstrates at least one realistic user or visitor scenario; where applicable the input/context, action, response, and outcome are understandable; the primary CTA clearly communicates what happens next; any product mockups communicate a task rather than serving as decorative interface texture.
6. **Credibility (T12):** fictional testimonials, metrics, institutions, users, and citations are labeled as prototype content or removed.
7. **Typography (T6a):** review secondary text for uppercase saturation; uppercase is a deliberate, single-category choice, not the default microcopy treatment.
8. **Hook (T7a):** the direction's project-specific hook is expressed in the actual prototype — visible in its layout, interaction, content, or visual mechanism — not only described in accompanying prose.
9. **Clean output:** the returned HTML contains no Markdown fences, preambles, or commentary — nothing outside `<!doctype html>…</html>`, and no chat-style commentary inside the document. Literal ``` sequences anywhere in the deliverable fail this gate.

## 9. Compiled path (when `compile_prototype` exists)

Prefer emitting PDL to the compiler for validated output (static Tailwind CSS, checks, screenshots). On one failure: repair from diagnostics and retry once. On a second failure: fall back to direct HTML under these rules and disclose that automated validation did not run.
