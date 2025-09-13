# BacklogGenXpert — Design Language & UI Guidelines

BacklogGenXpert must feel modern, intuitive, and aligned with Thrivara’s consulting brand. The UI should evoke trust, expertise, and clarity while supporting fast interactions for technical and business users.

## Core Principles
- **Clarity over clutter**: clean layouts, clear hierarchy, no unnecessary ornamentation.
- **Consistency**: same component patterns across views (buttons, cards, modals, navigation).
- **Responsiveness**: mobile, tablet, and desktop optimized; must feel fluid at all breakpoints.
- **Subtle delight**: micro-animations and smooth transitions to create polish without distraction.
- **Accessibility**: WCAG 2.1 AA minimum, proper contrast, keyboard navigation.

## Branding & Aesthetics
### Palette
- Primary: Thrivara deep blue (#1A2C6E) and gradient accents (blue-to-violet).
- Secondary: Purple highlights (#6A42D5) and teal accents (#28B4B8).
- Neutral: Gray scale from #111111 (text) to #F5F7FA (background).

### Typography
- Headings: Sans-serif, geometric (e.g., Inter, plus fallback).
- Body: Humanist sans-serif (Inter/Roboto).
- Code snippets: Monospace (JetBrains Mono).
- Sizing: Use modular scale (1.125× increments).

### Imagery
- Use abstract gradients, geometric shapes, subtle linework.
- Avoid stock photography; prefer illustrations/icons.

## Layout & Spacing
- Grid: 12-column responsive grid.
- Spacing scale: 4, 8, 12, 16, 24, 32px.
- Card-based UI: group related information in rounded, shadowed cards.
- Whitespace: generous padding; no dense clustering.

## Motion & Interactions
### Micro-animations
- Buttons: 150–200ms hover scale and shadow change.
- Page transitions: fade/slide with easing (ease-in-out, 200–300ms).
- Dropdowns/menus: scale+fade, spring easing.

### Feedback
- Success: subtle checkmark animation + green highlight.
- Error: shake animation or red border pulse.
- Loading: skeletons and progress spinners, never blocking text only.

## Components
- Navigation: Left sidebar for main nav (Projects, Work Items, Templates, Context, Settings). Top bar for user profile + notifications.
- Tables & Lists: Zebra striping optional, hover highlight row, sticky header.
- Forms: Inline validation, floating labels, large tap targets, minimal required fields.
- Diff Viewer: Split view (before/after) with syntax-like highlights (additions in green, deletions in red).

## Dark Mode
- Supported at launch; use the same brand accents, inverted neutrals.
- Respect system preference (prefers-color-scheme).

## Branding Integration
- Include Thrivara logo in header and favicon.
- Apply Thrivara gradient (blue → violet) in key CTAs (primary buttons, onboarding hero).
- Ensure design tone is professional and enterprise-ready (consulting look, not consumer app).

## Iconography
- Use lucide-react icons (light, minimal line style).
- Ensure consistent stroke weight and size (16–24px).

## Deliverables
- `tokens.json` (color/spacing/type tokens)
- Storybook with component examples (light/dark)
- Figma/Sketch source file or exported components
- Accessible component checklist (keyboard & ARIA)

## Implementation notes
- Provide a small design-system package (React components + tokens) to be shared across projects.
- Keep tokens and Storybook sources under `design/` in the repo and publish a private package for use in the frontend.

