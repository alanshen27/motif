# Motif — Fixed UI/UX Critique Rubric

This is the ONLY critique format Motif uses. Every audit scores all ten dimensions unless the user explicitly narrows scope, in which case name the skipped dimensions.

## 1. Output format (mandatory)

```
# Design Audit: <artifact name>

## Evidence inventory
<What is literally visible: viewport(s), sections, components, copy, colors, type. No judgments yet.>

## Scores
| # | Dimension | Score (1–5) | Confidence |
|---|-----------|------------|------------|
| 1 | Brief and audience fit | | |
...all ten rows...

## Dimension detail
### 1. Brief and audience fit — <score>/5 (<confidence>)
- Evidence: <observable facts supporting the score>
- Issues:
  - [S<severity>] <issue> → <concrete recommended change>
- Unknowns: <what requires interaction, code, or user testing>

...repeat for all ten...

## Top fixes (by severity, then impact)
1. [S4] ...
2. [S3] ...

## What this audit cannot tell you
<behavioral unknowns, states not shown, conformance limits>
```

## 2. Scoring anchors

- **5 — Exemplary:** decisions actively reinforce the brief; no issues above S1.
- **4 — Strong:** sound with minor friction; nothing above S2.
- **3 — Adequate:** works but with recurring inefficiency or genericness; at most one S3.
- **2 — Weak:** likely task failure or exclusion for some users; multiple S3 or one S4.
- **1 — Failing:** blocks core use or is fundamentally misaligned with the brief.

Confidence:

- **High:** directly observable in the artifact.
- **Medium:** strongly implied but partially assumed (e.g., hover states, breakpoints not shown).
- **Low:** substantially assumption-based; flag it and say what evidence would settle it.

## 3. Severity scale

- **S0 — Observation:** preference or opportunity, not a usability problem.
- **S1 — Minor:** noticeable friction with limited task impact.
- **S2 — Moderate:** recurring confusion or inefficiency.
- **S3 — Major:** likely task failure, exclusion, or serious misunderstanding.
- **S4 — Critical:** blocks core use, creates material risk, or makes content inaccessible.

## 4. The ten dimensions

### 1. Brief and audience fit
Do decisions support the stated user, goal, medium, and brand position? If no brief exists, state the inferred brief first and score against it. Example S3: a B2B compliance dashboard styled like a consumer lifestyle brand with no density for data work.

### 2. Information architecture
Grouping, labeling, navigation, task sequence, content prioritization. Example S3: primary task buried below promotional sections; navigation labels that don't predict destinations.

### 3. Visual hierarchy
Attention order, emphasis, scanning path, focal points, CTA prominence. Example S2: three competing same-weight CTAs above the fold.

### 4. Layout and composition
Grid, alignment, balance, rhythm, whitespace, density, responsive intent. Example S2: elements off-grid without compositional intent; identical section rhythm producing scroll blindness.

### 5. Typography
Roles, hierarchy, readability, line length (45–75ch body target), sizing, spacing, personality. Example S3: body text under ~14px at desktop density, or line lengths over ~95ch.

### 6. Color and accessibility
Contrast (compute when hex values are known: ≥4.5:1 normal text, ≥3:1 large text and UI components), non-color state cues, legibility, focus visibility. Example S4: essential text below 3:1; state communicated by color alone.

### 7. Consistency and standards
Repeated patterns behave the same; familiar conventions respected; token consistency (spacing, radii, shadows). Example S2: three different button styles for the same action class.

### 8. Affordance and feedback
Discoverability, system-status visibility, control clarity, error prevention and recovery. Example S3: destructive action with no confirmation or undo; interactive elements indistinguishable from static ones.

### 9. Content quality
Specificity, clarity, information scent, empty states, no interchangeable marketing copy. Example S2: "Unlock the power of seamless solutions" style copy that could describe any product.

### 10. Originality and art direction *(project-specific visual-craft layer — explicitly not a standard heuristic)*
Product-specific visual logic, reference transformation vs. imitation, composition diversity, template convergence per `anti_template_patterns.md`. Genericness is a checklist result, never an AI-authorship claim.

## 5. Interaction foundation

Dimensions 2, 7, and 8 operationalize Nielsen's ten heuristics: visibility of system status, match with the real world, user control and freedom, consistency and standards, error prevention, recognition over recall, flexibility and efficiency, aesthetic and minimalist design, error recovery, and help/documentation. Cite the specific heuristic when it grounds an issue.

## 6. Accessibility baseline

- Target WCAG 2.2 AA for generated prototypes: semantic structure, keyboard access, visible focus, meaningful alt text, non-color state indicators, contrast thresholds above.
- Screenshot-only audits: evaluate what is visible, list the rest under Unknowns, and NEVER claim full WCAG conformance.

## 7. Evidence discipline

Every score cites evidence visible in the supplied artifact. Anything inferred about behavior (hover, focus, animation, breakpoints, error states) is an assumption and belongs under Unknowns with the confidence downgraded accordingly.
