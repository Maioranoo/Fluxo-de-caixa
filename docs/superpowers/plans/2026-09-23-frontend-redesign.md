# Professional Front-end Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the presentation layer of Finanças da Família as a calm, premium financial interface while preserving every existing API, permission, authentication, database, and financial behavior.

**Architecture:** Keep `app/page.tsx` as the client-side state and request coordinator, then extract focused presentational components for the shell, feedback, dashboard, transactions, forms, and dialogs. Centralize the visual language in CSS tokens and local SVG icons; retain the current zero-runtime-UI-dependency approach and protect behavior with Node contract tests, the production build, browser inspection, and print verification.

**Tech Stack:** React 19, Next.js 16/Vinext, TypeScript, CSS, Node test runner, local SVG React components.

**Spec:** `docs/superpowers/specs/2026-09-23-frontend-redesign-design.md`

## Global Constraints

- Preserve all financial rules, authentication, permissions, APIs, database behavior, and household isolation.
- Desktop is the primary usage context; mobile remains a complete, structurally adapted experience.
- Keep green as the product identity and use red only for expenses, errors, or destructive actions.
- Do not add glassmorphism, decorative gradients, strong shadows, oversized elements, or heavy animation.
- Use motion only for state feedback, normally between 160 ms and 220 ms, with `prefers-reduced-motion` support.
- Meet WCAG AA contrast, preserve visible focus, keyboard operation, semantic labels, and 44 px touch targets.
- Positive and negative amounts must be distinguishable by sign and text as well as color.
- Do not add new product capabilities such as goals, pagination, monthly comparisons, or unsupported analytics.
- Do not add a heavy icon or component library; use local reusable SVG components.
- Do not commit, push, deploy, or publish until the user explicitly authorizes it.

## Review Focus

- A family with `allowIncome: false` must never see income navigation, income category selectors, or redundant expense labels.
- A family with `allowIncome: true` must retain income/expense category separation and all existing filters.
- An empty month, a failed fetch, and a failed write must each produce an understandable state without losing entered form data.
- Keyboard focus must remain visible, enter and leave dialogs predictably, and close with `Escape` without affecting financial state.
- Printing from a narrow browser viewport must still use the desktop report table and hide every fixed navigation element.

## File Map

- Create `app/components/icons.tsx`: local stroke-based SVG icon set and icon name type.
- Create `app/components/ui.tsx`: panels, empty states, status notices, skeletons, buttons, and shared dialog frame.
- Create `app/components/app-shell.tsx`: desktop sidebar, mobile navigation, page header, household selector, and month trigger.
- Create `app/components/finance-summary.tsx`: financial metric cards and category/payment bars.
- Create `app/components/transactions.tsx`: expense table, income list, filter toolbar, and responsive transaction presentation.
- Create `app/lib/finance-ui.ts`: shared UI-facing finance types, Brazilian money/date formatting, and grouped totals.
- Modify `app/page.tsx`: retain state and network operations; compose extracted components and improve accessible feedback/dialog behavior.
- Modify `app/globals.css`: replace incumbent visual world with tokens and component styles for the approved direction.
- Modify `app/not-found.tsx`: align the 404 screen with the new system.
- Modify `tests/rendered-html.test.mjs`: keep behavior contracts valid after component extraction and add accessibility/print contracts.
- Create `tests/finance-ui.test.mjs`: import the TypeScript utility with Node 22 type stripping and test formatting and grouping without introducing a test framework dependency.
- Create `DESIGN.md` and `.impeccable/design.json` only after the implemented design passes final visual review.

---

### Task 1: Protect behavior and extract shared finance presentation utilities

**Files:**
- Create: `app/lib/finance-ui.ts`
- Create: `tests/finance-ui.test.mjs`
- Modify: `app/page.tsx`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: `CategoryKind`, `Category`, `Member`, `Payment`, `Expense`, `Income`, `Household`, `FinanceData`.
- Produces: `formatMoney(cents: number): string`, `formatDate(date: string): string`, `groupTotals<T extends { amountCents: number }>(items: T[], key: (item: T) => string): Array<{ name: string; total: number }>`.
- Consumes: existing API payload fields without renaming them.

- [ ] **Step 1: Add contract assertions before moving source code**

Add tests that assert the public data fields and permission branches remain present after extraction:

```js
assert.match(page, /household\?\.allowIncome/);
assert.match(page, /expensePayment === "all"/);
assert.match(page, /incomeCategory === "uncategorized"/);
assert.match(page, /status === 401 \|\| response\.status === 403/);
```

Create `tests/finance-ui.test.mjs` with executable utility cases:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { formatDate, formatMoney, groupTotals } from "../app/lib/finance-ui.ts";

test("formata valores, datas e totais para o painel", () => {
  assert.equal(formatDate("2026-09-23"), "23/09/2026");
  assert.match(formatMoney(123456), /1\.234,56/);
  assert.deepEqual(
    groupTotals([{ amountCents: 100, kind: "A" }, { amountCents: 250, kind: "A" }], item => item.kind),
    [{ name: "A", total: 350 }],
  );
});
```

- [ ] **Step 2: Run the focused test and confirm the new utility assertions fail**

Run: `node --experimental-strip-types --test tests/finance-ui.test.mjs tests/rendered-html.test.mjs`

Expected: the new utility test fails because `app/lib/finance-ui.ts` does not exist.

- [ ] **Step 3: Extract types and pure formatting helpers**

Create the exported contracts with Brazilian formatting:

```ts
export const formatMoney = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export const formatDate = (date: string) => date.split("-").reverse().join("/");
```

Move only pure presentation helpers and shared types. Keep date creation, parsing, network calls, optimistic writes, and permission decisions in `app/page.tsx`.

- [ ] **Step 4: Update the page imports and all helper call sites**

Replace `money(...)` with `formatMoney(...)`, replace duplicated date reversal with `formatDate(...)`, and import the shared types. Do not change request payloads or calculations.

- [ ] **Step 5: Run focused tests and the TypeScript production build**

Run: `node --experimental-strip-types --test tests/finance-ui.test.mjs tests/rendered-html.test.mjs`

Run: `npm run build`

Expected: all tests pass and Vinext completes the production build.

- [ ] **Step 6: Record a local checkpoint**

Run: `git diff --check`

Expected: no whitespace errors. Do not commit.

---

### Task 2: Build the visual primitives and icon vocabulary

**Files:**
- Create: `app/components/icons.tsx`
- Create: `app/components/ui.tsx`
- Modify: `app/page.tsx`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: `Icon({ name, size?, decorative? })` with `IconName = "home" | "plus" | "expenses" | "income" | "categories" | "report" | "settings" | "calendar" | "edit" | "trash" | "close" | "check" | "wallet" | "arrowUp" | "arrowDown" | "retry"`.
- Produces: `Panel`, `EmptyState`, `StatusNotice`, `LoadingSkeleton`, `IconButton`, `DialogFrame`.
- Consumes: content, event callbacks, accessible labels, and loading state from `app/page.tsx`.

- [ ] **Step 1: Add failing source contracts for the new primitives**

```js
const icons = await readFile(new URL("../app/components/icons.tsx", import.meta.url), "utf8");
assert.match(icons, /export type IconName/);
assert.match(icons, /aria-hidden/);
assert.doesNotMatch(page, />✎<\/button>|>🗑<\/button>/);
```

- [ ] **Step 2: Run the focused contract test and confirm failure**

Run: `node --test tests/rendered-html.test.mjs`

Expected: failure because the components do not yet exist and emoji action icons remain.

- [ ] **Step 3: Implement the local SVG icon component**

Use one 24×24 outline vocabulary, `stroke="currentColor"`, `strokeWidth={1.8}`, rounded caps and joins. Decorative icons receive `aria-hidden="true"`; meaningful icon-only buttons receive their accessible name from `IconButton`.

- [ ] **Step 4: Implement shared UI primitives**

Use semantic elements and stable class names. `EmptyState` must accept `icon`, `title`, `description`, and optional `action`. `StatusNotice` must use `role="status"` for success and `role="alert"` for errors. `DialogFrame` must expose `titleId`, `onClose`, and footer content.

- [ ] **Step 5: Replace the existing inline primitives and character icons**

Replace `Metric`, `Panel`, `Empty`, edit/delete symbols, navigation symbols, modal close symbols, and confirmation symbols with the new components. Preserve every current callback and label.

- [ ] **Step 6: Verify contracts and build**

Run: `node --test tests/rendered-html.test.mjs`

Run: `npm run build`

Expected: no character icons remain in interactive controls; tests and build pass.

---

### Task 3: Recompose the application shell and feedback states

**Files:**
- Create: `app/components/app-shell.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: `AppSidebar`, `MobileNavigation`, `PageHeader`, `MonthDialog`, and `AppLoadingState`.
- Consumes: current tab, available navigation items, admin state, selected household, month label, and callbacks from `app/page.tsx`.

- [ ] **Step 1: Add failing accessibility contracts**

```js
assert.match(page, /href="#main-content"/);
assert.match(page, /id="main-content"/);
assert.match(page, /aria-current=/);
assert.match(page, /role="status"|StatusNotice/);
```

- [ ] **Step 2: Run the source test and confirm failure**

Run: `node --test tests/rendered-html.test.mjs`

- [ ] **Step 3: Implement the desktop and mobile shell**

Keep navigation derived from `allowIncome`. The sidebar receives brand, sections, current location, household context, and admin entry. The mobile navigation retains five context-aware destinations and never covers page content.

- [ ] **Step 4: Add the skip link, semantic main landmark, and compact page header**

The header keeps the current page title and period selector. The month dialog retains month/year selection and uses the shared dialog frame.

- [ ] **Step 5: Replace plain loading and notice output**

Use a shell-shaped skeleton while initial data loads. Use `StatusNotice` for API errors and operation completion; closing a notice must remain possible without changing data.

- [ ] **Step 6: Add first-pass shell tokens and layout CSS**

Define `--color-canvas`, `--color-surface`, `--color-surface-raised`, `--color-ink`, `--color-muted`, `--color-border`, `--color-primary`, `--color-primary-hover`, `--color-primary-soft`, `--color-danger`, spacing, radius, shadow, motion, and focus tokens at `:root`.

- [ ] **Step 7: Run tests and build**

Run: `npm test`

Expected: essential flow tests and the production build pass.

---

### Task 4: Redesign summary cards and bar charts

**Files:**
- Create: `app/components/finance-summary.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: `FinancialSummary`, `MetricCard`, `DistributionBars`.
- Consumes: total expenses, total income, balance, counts, category totals, payment totals, month label, and `allowIncome`.

- [ ] **Step 1: Add failing semantics contracts for signed values and chart labels**

```js
assert.match(summary, /aria-label/);
assert.match(summary, /data-tone="positive"|data-tone="negative"/);
assert.match(summary, /role="list"/);
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/rendered-html.test.mjs`

- [ ] **Step 3: Implement the hierarchy for families with and without income**

With income enabled, make balance primary and expenses/income secondary. Without income, make total expenses primary. Include `+` or `−`, descriptive labels, counts, and `font-variant-numeric: tabular-nums`.

- [ ] **Step 4: Implement accessible distribution bars**

Render each row as text, track, fill, and aligned amount. Apply `aria-label` with category/payment name and formatted amount. Keep a nonzero minimum visible fill without implying a false scale in the label.

- [ ] **Step 5: Style the responsive summary grid and charts**

Use the approved calm banking direction: restrained surfaces, hierarchy through size and spacing, green for positive/active state, and signed red expense indicators.

- [ ] **Step 6: Run tests and build**

Run: `npm test`

---

### Task 5: Redesign transactions, filters, categories, and forms

**Files:**
- Create: `app/components/transactions.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: `FilterToolbar`, `ExpenseTable`, `IncomeList`, `TransactionActions`.
- Consumes: current filtered arrays, category/payment options, totals, edit/delete callbacks, and readonly report mode.
- Page retains all controlled form state and submit handlers.

- [ ] **Step 1: Add failing behavior contracts for permission-sensitive category controls**

```js
assert.match(page, /allowIncome.*categoryKind|categoryKind.*allowIncome/s);
assert.match(page, /categoryFilter === "all"/);
assert.match(page, /expensePayment === "all"/);
assert.match(page, /incomeCategory === "uncategorized"/);
```

- [ ] **Step 2: Add failing structural contracts for responsive transaction output**

Assert that transaction cells retain `data-label`, readonly mode removes actions, values have an explicit expense/income marker, and every icon action has an `aria-label`.

- [ ] **Step 3: Implement the filter toolbar and responsive tables/lists**

Keep desktop tables for expenses and report data. On mobile, use CSS to create structured transaction rows without horizontal overflow. Preserve category, payment, person, date, description, and value.

- [ ] **Step 4: Restyle every controlled form with a shared field rhythm**

Keep visible labels and current native validation. Add field grouping, consistent help text, disabled/loading feedback, and `aria-busy` on forms during saves. Do not clear fields after a failed request.

- [ ] **Step 5: Preserve category permission behavior**

For expense-only families, render only the category input, add button, and expense category list. For full families, retain kind selection and Entrada/Saída/Todas filtering.

- [ ] **Step 6: Preserve payment creation and installment behavior**

Keep payment method creation inline and expose installments only when the selected method has `isCard: true`.

- [ ] **Step 7: Run tests and build**

Run: `npm test`

Expected: all current finance contracts plus the new responsive/accessibility contracts pass.

---

### Task 6: Make dialogs, administration, errors, and empty states coherent

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/not-found.tsx`
- Modify: `app/components/ui.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- `DialogFrame` consumes `open`, `title`, `description?`, `onClose`, content, and actions.
- Admin sections continue consuming current household/member state and existing callbacks.

- [ ] **Step 1: Add failing dialog accessibility contracts**

```js
assert.match(ui, /role="dialog"/);
assert.match(ui, /aria-modal="true"/);
assert.match(page, /event\.key === "Escape"/);
```

Also add a contract for a focusable close button and restoration target via a saved trigger ref.

- [ ] **Step 2: Implement shared dialog keyboard behavior**

On open, save the active trigger, focus the first meaningful control, contain `Tab` and `Shift+Tab`, close on `Escape`, and return focus after close. Overlay click closes only when the pointer target is the overlay itself.

- [ ] **Step 3: Migrate month, expense, income, and member dialogs**

Use the same frame, spacing, close control, footer actions, and transition. Preserve all current submit handlers and form fields.

- [ ] **Step 4: Refine administration sections**

Create clear groups for new household, per-family feature permissions, and members of the selected household. Keep the selected household explicit and keep destructive actions visually secondary until hover/focus.

- [ ] **Step 5: Upgrade empty, access denied, and 404 states**

Use helpful titles, descriptions, local icons, and a useful next action. Preserve the existing access error status/message and login retry behavior.

- [ ] **Step 6: Verify tests and build**

Run: `npm test`

---

### Task 7: Finish responsive behavior, accessibility, and print isolation

**Files:**
- Modify: `app/globals.css`
- Modify: `app/page.tsx`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes the class names and semantic structure established in Tasks 2–6.
- Produces final behavior at 375, 768, 1024, and 1440 px plus A4 print.

- [ ] **Step 1: Add failing CSS contracts for accessibility and print**

```js
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion/);
assert.match(printCss, /\.mobile-bottom-nav.*display:none!important/s);
assert.match(printCss, /\.app-sidebar.*display:none!important/s);
```

- [ ] **Step 2: Implement complete interaction states**

Buttons, links, inputs, selects, segmented controls, cards, and icon actions receive default, hover, focus-visible, active, disabled, loading, error, and selected styling where applicable.

- [ ] **Step 3: Implement structural breakpoints**

- At 1440 px: centered wide content with full sidebar and multi-column dashboard.
- At 1024 px: narrower content and two-column summary where appropriate.
- At 768 px: collapsed desktop shell, mobile navigation, single-column forms, and reorganized filters.
- At 375 px: single-column cards, touch-first transaction rows, no unintended horizontal scrolling.

- [ ] **Step 4: Implement reduced motion**

Under `@media (prefers-reduced-motion: reduce)`, remove nonessential transforms and animations and reduce transition duration to effectively immediate feedback.

- [ ] **Step 5: Rebuild final print rules after every screen rule**

Keep the final `@media print` block last. Hide `.app-sidebar`, `.app-header`, `.mobile-bottom-nav`, notices, buttons, filters, and actions. Force expense report tables back to table layout even when the browser preview width activates mobile CSS.

- [ ] **Step 6: Run the complete automated suite**

Run: `npm test`

Run: `npm run lint`

Run: `git diff --check`

Expected: tests, production build, lint, and whitespace validation pass.

---

### Task 8: Inspect the running application and correct visual regressions

**Files:**
- Modify as evidence requires: `app/page.tsx`, `app/globals.css`, and files under `app/components/`.
- Create after approval-quality review: `DESIGN.md`, `.impeccable/design.json`.

**Interfaces:**
- Consumes the complete implementation and local API/database configuration.
- Produces visual evidence and durable design tokens after review.

- [ ] **Step 1: Start the local application**

Run: `npm run dev`

Expected: Vinext serves the application locally without compilation errors.

- [ ] **Step 2: Inspect desktop at approximately 1440 and 1024 px**

Check summary hierarchy, sidebar active state, period selection, filters, tables, forms, category permissions, report, admin editing, notices, empty states, access denied, and 404.

- [ ] **Step 3: Inspect tablet and mobile at approximately 768 and 375 px**

Check mobile navigation, safe-area spacing, touch targets, transaction list conversion, modal height, form keyboard flow, filter stacking, and absence of horizontal page scrolling.

- [ ] **Step 4: Inspect keyboard and reduced-motion behavior**

Navigate from the skip link through the shell, forms, tables, and dialogs. Confirm visible focus, logical order, focus containment/restoration, `Escape`, and reduced-motion behavior.

- [ ] **Step 5: Inspect PDF/print preview**

Open Relatório and invoke **Imprimir / salvar PDF** from both a desktop and narrow viewport. Confirm A4 layout, desktop-style table rows, repeated browser page flow without fixed navigation, and unobstructed final entries.

- [ ] **Step 6: Fix only evidence-backed visual or interaction defects**

For each defect, first add or update an automated contract where meaningful, reproduce it, apply the smallest correction, and rerun the owning test plus `npm run build`.

- [ ] **Step 7: Document the shipped visual system locally**

Create `DESIGN.md` with the approved direction, token values, typography, component rules, motion, responsive rules, and print behavior. Create `.impeccable/design.json` with the same canonical tokens in machine-readable form.

- [ ] **Step 8: Run final verification**

Run: `npm test`

Run: `npm run lint`

Run: `git diff --check`

Run: `git status --short`

Expected: all checks pass; only intentional local redesign and documentation files are modified. Do not commit, push, deploy, or publish.
