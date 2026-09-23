# Design System — Finanças da Família

<!-- impeccable:design-schema 1 -->

## Direção

**Banco familiar sereno** combina a confiança de um banco digital com uma linguagem acolhedora para finanças compartilhadas. A interface privilegia leitura rápida, superfícies calmas e valores financeiros precisos.

## Cores

- Canvas: `#f4f1e9`
- Surface: `#fafbf9`
- Raised surface: `#ffffff`
- Text: `#17231f`
- Secondary text: `#68766f`
- Border: `#dbe3de`
- Primary: `#176a52`
- Primary hover: `#11523f`
- Primary soft: `#e1f0e8`
- Expense/destructive: `#a9453b`
- Expense soft: `#fae9e6`

Green identifies the product, positive values, selected navigation and primary actions. Red is reserved for expenses, errors and destructive actions.

## Typography

The interface uses a single system sans stack led by Inter when available. Important amounts use tabular numerals, strong contrast and restrained size changes. Page titles use compact tracking; labels and eyebrows use small uppercase text only for navigation and grouping.

## Shape and depth

- Radius scale: 9, 14 and 20 px.
- Borders separate most surfaces.
- Shadows are limited to overlays and very subtle card separation.
- No decorative gradients, glass surfaces or floating-card movement.

## Components

- Sidebar: deep forest background, 44 px navigation targets and a soft green active indicator.
- Buttons: green filled primary, neutral bordered secondary, icon-only actions with labels.
- Fields: 46 px minimum desktop height and 48 px on touch layouts.
- Financial cards: balance leads; income and expense use distinct soft surfaces plus signs and labels.
- Tables: compact desktop rows with tabular amounts; structured labeled rows on mobile.
- Charts: simple green bars on neutral tracks with text values always visible.
- Dialogs: shared heading, close action, focus containment and `Escape` support.
- Feedback: contextual status/alert notices, skeleton loading and instructive empty states.

## Motion

State transitions use 160–210 ms with `cubic-bezier(.2,.8,.2,1)`. Motion communicates selection, focus, dialog entry or chart loading. `prefers-reduced-motion` reduces all transitions and animations.

## Responsive behavior

Desktop uses a 248 px sidebar and wide content grid. Below 1100 px, summary and content grids simplify. At 800 px, the sidebar becomes a compact brand header, navigation moves to the bottom, forms stack and transaction tables become labeled cards. Safe-area padding prevents the fixed navigation from covering content.

## Print

The final print block is the last CSS rule. It removes application navigation and actions, restores report tables even from a mobile viewport, uses A4 portrait margins and prevents transaction rows from splitting across pages.
