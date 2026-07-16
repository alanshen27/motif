# Motif — Anti-Template Patterns and Counter-Strategies

Genericness is a **transparent checklist**, not an AI detector. Never claim a design was or wasn't made by AI. A pattern below is only a problem when it's unmotivated by the brief; preserve familiar conventions when they improve usability.

## 1. The checklist

For each indicator: what it looks like, why it converges, and a counter-strategy. Flag an indicator only with visible evidence, and always explain why it's inappropriate *for this brief*.

### T1. Centered hero default
Single centered column: headline, subline, two buttons, product screenshot below. **Counter:** derive hero composition from the product's actual object of interest — split layouts, editorial asymmetry, data-forward openings, task-first openings for tools.

### T2. Pill badges above headlines
"✨ Now in beta" capsule as reflexive decoration. **Counter:** only include a badge when the announcement is real information; otherwise spend that emphasis on the headline.

### T3. Gradient headline text / decorative glows
Purple-to-blue text gradients, radial glow blobs behind cards. **Counter:** build emphasis from type scale, weight, and spacing; use color as meaning, not garnish.

### T4. Repeated equal cards
Every section a 3-up grid of identical rounded cards. **Counter:** vary information display by content type — tables for comparison, timelines for sequence, prose for narrative, one hero card + supporting list for asymmetric importance.

### T5. Uniform large radii
Everything rounded-2xl regardless of brand. **Counter:** pick a radius token from the brand position (sharp = precise/technical, small = neutral, large = friendly) and use it consistently.

### T6. Generic sans-serif typography
Single neutral grotesque at default weights; no typographic point of view. **Counter:** define type roles (display/heading/body/mono-accent), a deliberate scale, and at least one decision a reader would remember.

**T6a — Uppercase microcopy saturation** *(preliminary baseline finding)*. Uppercase is not inherently undesirable; flag it when it becomes the default treatment for nearly every piece of secondary text — uppercase nav links, eyebrows, buttons and pills, metadata/timestamps, card labels, section numbers, with wide letter spacing on most small text. That flattens hierarchy and makes unrelated interfaces feel generated from the same visual vocabulary. **Counter:** use sentence case for most navigation, controls, and metadata; reserve uppercase for one deliberate category (e.g., archival labels or compact status codes); build hierarchy through size, weight, color, position, and spacing rather than capitalization alone; test whether removing `text-transform: uppercase` materially improves clarity or makes the interface less formulaic.

### T7. Vague marketing copy
"Unlock seamless solutions," "Supercharge your workflow." Interchangeable across products. **Counter:** copy must name the user, the task, and the concrete outcome; write real empty states and microcopy.

**T7a — Missing experiential hook** *(preliminary baseline finding)*. A **hook** is a concrete idea, interaction, artifact, tension, or visual mechanism that could only belong to this particular product, event, or brand. Flag visually polished pages with no memorable, project-specific hook: the hero introduces a category but not a distinctive idea; the headline could be transferred to a competing product; decorative typography substitutes for a concept; the page is attractive but only describable in generic terms ("clean," "bold," "modern," "editorial"); the most memorable element is a style treatment rather than something meaningful about the product or experience. **Counter:** identify one project-specific tension or promise before designing and express it through layout, interaction, content, or visual metaphor; ask "what could appear on this page that would make no sense for another product?"; require each creative direction to state its hook in one sentence (see behavior spec §5); reject directions whose only differences are typography, color, or decoration.

### T8. Interchangeable section rhythm
Hero → logos → 3 features → testimonial → pricing → CTA, at identical spacing. **Counter:** order sections by the audience's actual decision sequence; vary density and width; cut sections that carry no information.

### T9. Palette-only differentiation
"Three directions" that share one skeleton with different accent colors. **Counter:** directions must differ in composition, type strategy, image logic, and density (see behavior spec §5).

### T10. Decorative dark-mode default
Dark background chosen for vibes on a content-heavy product. **Counter:** choose mode from context of use and content type; if dark, re-verify contrast and elevation logic.

### T11. Stock-metaphor imagery
Rockets, abstract 3D blobs, isometric people at desks. **Counter:** image logic must come from the product's domain — real UI, real data shapes, domain textures, or deliberate absence of imagery.

**T11a — Failure to demonstrate actual use** *(preliminary baseline finding)*. Flag pages that describe a product or experience without showing what someone actually does with it: feature cards explain capabilities but no real workflow (overlaps T4); dashboard mockups are decorative interface fragments with no legible task; it's unclear what happens after pressing the main CTA; screenshots/mockups are too miniature, abstract, or crowded to explain use; the page claims collaboration/organization/intelligence/productivity without a concrete before-and-after; event pages present atmosphere but never convey what attending feels like or what visitors can do. **Counter:** show one complete scenario with realistic content — input/context, user action, system response, meaningful outcome; prefer one understandable workflow over several miniature decorative UI panels; pair claims with visible evidence; make the primary CTA's destination explicit; for event and cultural sites, demonstrate a specific visitor journey or participatory moment.

### T12. Decorative credibility without evidence
The problem is not only fabricated logos or statistics — it is credibility-shaped decoration standing in for a demonstration of value, often where a clear hook (T7a) and use demonstration (T11a) should be. Flag: university/company logo strips with no context; avatar stacks without an explained community; testimonials that describe no specific result; precise-looking statistics or citations disconnected from any visible workflow; named institutions or participants used mainly to make the page feel established; trust elements appearing before the page has demonstrated what the product does. **Counter:** establish credibility through a concrete use case, artifact, or outcome first; make testimonials describe a specific task and result; clearly label fictional prototype content; remove unsupported logo strips, avatar stacks, and precise statistics; ask whether each credibility element helps the user understand the product or merely decorates the page.

## 2. Applying the checklist

- **In critique:** cite indicators by ID under rubric dimension 10 with visible evidence, e.g. "T4: four consecutive 3-up card grids (sections 2–5)."
- **In generation:** self-check every direction and prototype against this list before presenting. If a flagged pattern is retained, justify it from the brief in one sentence.
- **Convergence score (optional, when asked for a baseline study):** count of indicators present with evidence, out of 12. Report per-indicator, never as an "AI score."

## 3. Provenance of the preliminary findings

> Preliminary analysis of two independently generated baseline websites revealed
> recurring uppercase microcopy, weak project-specific hooks, limited demonstration
> of actual use, and credibility-shaped elements that sometimes replaced concrete
> evidence. These observations were used to refine Motif's existing safeguards.
> Because the sample is small, they are treated as design hypotheses and evaluation
> criteria rather than universal properties of AI-generated websites.

The sub-checks marked *(preliminary baseline finding)* (T6a, T7a, T11a, and the T12 refinement) carry this provenance. They are convergence and design-quality checks like every other indicator here — never evidence that a design was AI-generated.

## 4. Project banned-patterns list

Maintain a per-project list of patterns the user rejected or that critique flagged. Session-persisted when Actions are available (part of canonical state); conversation-local otherwise. Check new directions and prototypes against it and say when a banned pattern was avoided or needs revisiting.
