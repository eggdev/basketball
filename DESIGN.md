---
name: Fantasy Basketball Draft Room
description: A calm, evidence-first front-office control deck for one fantasy basketball league.
colors:
  brand-navy: "#00428b"
  brand-gray: "#919798"
  brand-orange: "#f48327"
  brand-white: "#ffffff"
  canvas-deep: "#000a15"
  canvas: "#001225"
  surface-1: "#001a35"
  surface-2: "#00244a"
  surface-3: "#003164"
  surface-active: "#00428b"
  ink: "#ffffff"
  ink-muted: "#c8cccd"
  ink-subtle: "#919798"
  line: "rgb(145 151 152 / 0.22)"
  line-strong: "rgb(145 151 152 / 0.42)"
  signal: "#f48327"
  signal-soft: "#ffb172"
  success: "#63d6a2"
  danger: "#ff8f92"
  info: "#85caff"
  tier-elite: "#f4d37b"
typography:
  display:
    fontFamily: "Inter, 'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.8rem, 3.5vw, 2.7rem)"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter, 'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.93rem"
    fontWeight: 700
  title:
    fontFamily: "Inter, 'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.82rem"
    fontWeight: 650
  body:
    fontFamily: "Inter, 'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.5
  navigation:
    fontFamily: "Inter, 'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.78rem"
    fontWeight: 620
  label:
    fontFamily: "Inter, 'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.61rem"
    fontWeight: 700
    letterSpacing: "0.12em"
  data:
    fontFamily: "Inter, 'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.7rem"
    fontWeight: 400
  mono:
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', ui-monospace, monospace"
    fontSize: "0.66rem"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.canvas-deep}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  button-primary-hover:
    backgroundColor: "{colors.signal-soft}"
    textColor: "{colors.canvas-deep}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.navigation}"
    rounded: "{rounded.md}"
    padding: "9px 10px"
  navigation-item-active:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.brand-white}"
    typography: "{typography.navigation}"
    rounded: "{rounded.md}"
    padding: "9px 10px"
  field:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  stat-card:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  player-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  player-read-tooltip:
    backgroundColor: "{colors.canvas-deep}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "12px"
    width: "200px"
  status-badge:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "4px 7px"
---

# Design System: Fantasy Basketball Draft Room

## Overview

**Creative North Star: "The Front-Office Control Deck"**

The Draft Room is a continuous navy instrument frame for making evidence-backed decisions under pressure. Its product grammar is dark, compact, and operational: a restrained adaptation of Linear's structural clarity, not a copy of its marketing language or visual identity. League research, live decisions, and Eve all occupy the same composed field so the owner never loses context when moving from evidence to judgment.

The visual system earns confidence through stable geometry, dense but legible information, and explicit evidence states. Matte tonal layers and hairline rules establish hierarchy without turning each dataset into a floating card. Orange is deliberately scarce; it identifies an active, selected, or decisive moment, while white carries primary information and cool gray carries provenance, metadata, and uncertainty.

**Key Characteristics:**

- Continuous matte-navy frame with a narrow navigation rail, broad evidence workspace, and spatially stable Eve rail.
- Compact neutral typography, tight tracking, and tabular numerals for scan-heavy league evidence.
- Tonal depth and hairline borders instead of ambient shadows, glow, gradients, or a white SaaS card grid.
- Restrained orange decision signals, with labeled semantic colors for player evidence and projection tiers.
- Evidence caveats remain visible wherever data is inferred, incomplete, unavailable, or degraded.

## Colors

Court Navy and its darker tonal field create the operating environment; white and cool gray establish the information hierarchy, and Draft Orange marks decisions rather than atmosphere.

### Primary

- **Court Navy** (`brand-navy`): The committed brand anchor and selected-state field. It also appears as the active surface and key hover border.
- **Draft Orange** (`brand-orange`, `signal`): The decisive action, live-state, focus, rank, and evidence-emphasis color. Its softer companion (`signal-soft`) is reserved for hover and secondary emphasis.

### Secondary

- **Verified Green** (`success`): Ready states, positive outcomes, modeled durability or role upside, and A-tier projection rank.
- **Exception Red** (`danger`): Errors, negative outcomes, modeled fragility, and role downside.
- **Evidence Blue** (`info`): Sourced team movement and B-tier projection rank; a compact evidence signal, never a competing brand surface.
- **Elite Gold** (`tier-elite`): S-tier projection rank only. The letter and explanation remain visible.
- **Caution Amber** (`signal-soft`): Managed durability and uncertain role evidence, reusing the existing soft signal.

### Neutral

- **Deep Bench** (`canvas-deep`): The darkest navigation, code, and scrim-adjacent foundation.
- **Night Court** (`canvas`): The page and central workspace canvas.
- **Navy Surface I–III** (`surface-1`, `surface-2`, `surface-3`): The progressive panel, control, and hover layers derived from Court Navy.
- **Scoreboard White** (`brand-white`, `ink`): Primary copy and high-confidence evidence.
- **Cool Silver** (`ink-muted`): Supporting copy and routine evidence.
- **League Gray** (`brand-gray`, `ink-subtle`): Metadata, labels, provenance, and unavailable evidence.
- **Hairline Gray** (`line`, `line-strong`): Quiet structural borders and stronger control boundaries.

### Named Rules

**The One Navy Family Rule.** Blue surfaces stay inside the Court Navy tonal family. Evidence Blue is reserved for compact labeled player signals.

**The Decision Signal Rule.** Draft Orange appears at active, selected, focused, or decisive moments. It must not become ambient decoration or a general-purpose fill.

**The Evidence Color Rule.** Semantic color describes a labeled state, model estimate, or projection rank band, never decorative mood. Missing evidence stays neutral; model-estimated durability is not live injury clearance.

## Typography

**Display Font:** Inter, with the SF Pro and system sans stack as fallbacks.

**Body Font:** Inter, with the same native sans fallbacks.

**Label/Mono Font:** Inter for compact labels; SFMono-Regular with Consolas, Liberation Mono, and `ui-monospace` for code evidence.

**Character:** Typography is compact, neutral, and built for scanning. Hierarchy comes from weight, scale, tracking, and case rather than switching typefaces; numbers use tabular figures in evidence tables and rule values.

### Hierarchy

- **Display** (`display`): Page titles use a responsive clamp, semibold weight, tight tracking, and a compact line height; this is the only large text role.
- **Headline** (`headline`): Panel titles are compact and bold enough to anchor a dense region without competing with the page title.
- **Title** (`title`): Section and card headings use restrained semibold emphasis.
- **Body** (`body`): Controls and analytical copy stay small with generous line height; long page descriptions stop at roughly 70 characters.
- **Navigation** (`navigation`): Rail items use a slightly larger compact label with medium-heavy weight.
- **Label** (`label`): Context, field, and table labels are uppercase where implemented, tightly sized, and widely tracked.
- **Data** (`data`): Tables and numeric metrics use tabular figures so columns remain stable while values change.
- **Mono** (`mono`): Inline and block code inside Eve responses only.

### Named Rules

**The No Hero Type Rule.** Operative screens begin with a clear page title, not a marketing headline; display type never overwhelms the evidence below it.

**The Tabular Evidence Rule.** Prices, ranks, budgets, scores, and rule values use tabular numerals whenever they appear in columns or changing readouts.

## Layout

The desktop shell is a three-column instrument frame: a fixed 232px navigation rail, a fluid evidence workspace, and a 376px Eve rail. Closing Eve collapses only its third column to zero; navigation and workspace remain in place. The top bar and rail brand share a 76px datum, reinforcing the continuous frame.

At 1180px and below, navigation narrows to 220px and Eve becomes a right-side overlay up to 390px or 92vw. At 760px and below, the navigation becomes a left drawer up to 250px or 86vw, the shell becomes a single content block, and the top bar contracts to 66px. Workspace grids simplify at 1000px; page padding changes from 30px to 18px 14px 30px and remaining multi-column content stacks at 680px.

Pages cap at 1480px and use a compact 4/8/12/16/24/32px spacing rhythm. Evidence-dense regions prefer explicit grids, sticky table headers, stable metric cells, and internal scrolling over oversized cards or empty whitespace.

**The Stable Frame Rule.** Eve joins or overlays the instrument frame without reordering navigation or displacing the owner's current evidence context.

**The Dense, Not Cramped Rule.** Use the established spacing rhythm and clear tonal grouping; do not enlarge controls or add whitespace merely to make the interface feel simpler.

## Elevation & Depth

The system is flat at rest. It uses no ambient card shadows: depth comes from the ordered canvas and surface tones, one-pixel gray hairlines, and limited scrims behind compact overlays. The only box shadow in the shipped vocabulary is a three-pixel, low-opacity orange focus halo around active fields; it communicates interaction, not physical elevation.

### Shadow Vocabulary

- **Signal Focus Halo** (`0 0 0 3px rgb(244 131 39 / 0.1)`): Reinforces the orange focus border on active fields and the Eve composer.

### Named Rules

**The Flat Instrument Rule.** Surfaces remain shadowless at rest; use tonal steps and hairlines for structure, and reserve the focus halo for keyboard or text-entry focus.

## Shapes

Corners are compact and functional. Small inline details use 4–6px rounding, standard controls and statistic cards use 8px, major panels use 12px, and only badges, status lights, or scrollbar thumbs use the pill shape. A small number of tightly scoped chat and status elements use intermediate 7–11px radii as shipped.

Borders are one-pixel hairlines. Geometry stays rectangular and aligned to the evidence grid; circles are limited to state dots and the basketball mark. Content is clipped only where the panel or table viewport owns scrolling.

**The Radius Follows Scope Rule.** The larger the information region, the larger its established corner step; do not use oversized rounding to make dense analytical panels feel playful.

## Components

### Buttons

- **Shape:** Standard action buttons use the medium corner (`rounded.md`), compact padding, and heavy labels.
- **Primary:** Draft Orange on Deep Bench. Hover moves to Signal Soft; active state translates down by one pixel.
- **Secondary:** Navy Surface II with muted ink and a strong gray hairline. Hover shifts to Navy Surface III with a Court Navy border and white ink.
- **Focus / Disabled:** All buttons receive the two-pixel orange global focus outline with a three-pixel offset. Disabled controls retain their geometry and drop to 45% opacity where implemented.

### Chips

- **Style:** Status badges use a pill outline, compact muted label, and a six-pixel state dot.
- **State:** Orange is the default attention state, green means ready or verified, and labels must name the state rather than relying on color alone.

### Cards / Containers

- **Corner Style:** Statistic cards use the medium corner; major panels and decision containers use the large corner.
- **Background:** Statistic cards sit on Navy Surface II; panels use Navy Surface I with Surface II headers.
- **Shadow Strategy:** None at rest; rely on tonal separation and hairline borders.
- **Border:** Quiet Hairline Gray for standard regions, with stronger semantic borders only for active, warning, or success states.
- **Internal Padding:** Dense cards generally use 14–16px; panel headers use 14px 17px.

### Player Cards and Evidence Icons

The shared `PlayerCard` combines player identity, a native disclosure, one headline measure, and labeled evidence controls for projection tier, team movement, durability, opportunity, observed auction value, and evidence/season. The standard card uses Navy Surface I, a 12px corner, a quiet hairline, 16px disclosure padding, and a neutral initials tile. Its compact variant removes the outer border, background, and initials tile for projection research and trade rosters; the identity and evidence behavior remain the same.

Opening the disclosure reveals available projection values, role evidence, source caveats, and the contextual “Analyze team fit” action. Historical draft ownership and price stay distinct from the latest projection season. Unknown availability or opportunity must remain explicitly unavailable or unclassified.

Evidence icons are labeled buttons with 18px strokes in 30×32px targets, growing to 36×40px at 680px and below. Hover and keyboard focus add Navy Surface III and Signal Soft. Tooltip content opens on hover or focus; click/tap pins it, a second click or Escape dismisses it, and blur, scroll, or resize closes it. The tooltip is portaled to the document body, uses a fixed 200px width capped at 70vw, and clamps its position eight pixels inside the viewport. Deep Bench, a strong hairline, an 8px corner, and 12px padding distinguish the explanation without a shadow. Accessible descriptions remain present while the visual tooltip is closed.

Player signals share the same evidence tooltip behavior across scouting and roster views. S/A/B/C/D tiers encode projection rank bands (1–12 / 13–36 / 37–72 / 73–120 / 121+); absent or invalid rank is neutral and unassigned. S uses Elite Gold, A Verified Green, B Evidence Blue, and C/D neutral ink. Durability maps durable/managed/fragile to green/amber/red; role direction maps up/uncertain/down to the same colors. Sourced new-team evidence uses Evidence Blue. Letters, directional glyphs, accessible labels, explanations, and the visible legend carry meaning alongside color. These are evidence summaries, not guarantees or recommended bids.

The disclosure chevron rotates over 220ms with the existing ease-out curve. Global reduced-motion styling collapses this transition along with other interface motion.

### Inputs / Fields

- **Style:** Inputs, selects, and textareas use Navy Surface I, Cool Silver text, a strong hairline, an 8px corner, and 8px 10px padding.
- **Focus:** The border turns Draft Orange and gains the Signal Focus Halo; the global outline remains available for keyboard focus.
- **Placeholder / Disabled:** Placeholder text uses League Gray at full declared opacity. Disabled state must remain legible and unambiguously unavailable.

### Navigation

Primary navigation is a grouped 232px desktop rail on Deep Bench. Group labels are small uppercase League Gray; items use compact icons, medium-heavy labels, and an 8px corner. Hover adds Navy Surface I. The active item becomes Court Navy with white ink and a five-pixel Draft Orange dot. On small screens the same rail becomes a left drawer behind a dark scrim.

### Evidence Notices

Notices, warnings, and success messages keep the same compact 8px container. Neutral notices use a Court Navy border on Navy Surface II; warnings use a faint orange wash and orange hairline; success uses the equivalent restrained green treatment. The text must explicitly identify whether evidence is factual, inferred, assumed, unavailable, or degraded.

### Data Tables

Tables are border-collapsed, numeric columns align right, identity columns align left, and values use tabular numerals. Sticky Surface II headers use compact uppercase gray labels. Rows do not become cards; hover is only a 3.5% orange wash, and the rank column alone uses the decision signal.

### Eve Rail

Eve is a persistent 376px analyst rail on wide screens and a compact right overlay below 1180px. It uses the same surfaces, hairlines, buttons, fields, and status language as the main workspace. Opening, closing, and prompt states move on the 140ms fast duration or 220ms panel duration with the shipped ease-out curve; reduced-motion preferences collapse those transitions. The composer uses the standard focus halo and a decisive orange Send/Steer button.

### Live Decision

The live decision container is a large-corner, hairline panel within the draft workspace. Its action word is uppercase and semantic—green, red, or orange—while the supporting metrics remain neutral. Eve's judgment is separated by a single orange left rule and a 5% orange wash so qualitative analysis never visually replaces the deterministic cap.

## Do's and Don'ts

### Do:

- **Do** preserve one continuous navy operating field across navigation, evidence, and Eve.
- **Do** reserve Draft Orange for the current action, active state, focus, rank, or decisive evidence signal.
- **Do** label facts, projections, inferences, unavailable evidence, and degraded AI states in visible language.
- **Do** use tabular numerals and stable metric geometry for values that change or must be compared.
- **Do** keep the owner spatially oriented when Eve opens, closes, streams, fails, or resumes.

### Don't:

- **Don't** introduce gradients, glow, ambient card shadows, a white SaaS canvas, or an unrelated blue accent.
- **Don't** spread orange across passive decoration or multiple competing calls to action.
- **Don't** turn every dataset into an isolated floating card or trade scan density for ornamental whitespace.
- **Don't** use color alone to communicate readiness, risk, failure, or evidence quality.
- **Don't** present inferred roster activity, historical prices, projections, or Eve output as authoritative fact without its caveat.
