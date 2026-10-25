# ServerDevTools Dashboard Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted Light/Dark/System theme selection and apply the existing semantic theme tokens consistently across the ServerDevTools dashboard.

**Architecture:** Keep the current `.dark` class and CSS variable system. Add a small theme utility/provider for preference state, a first-paint bootstrap in `index.html`, and one reusable selector rendered on login and authenticated navigation. Replace only the dashboard’s remaining hardcoded theme-sensitive colors with shared semantic tokens.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, existing Base UI components, browser `localStorage` and `matchMedia` APIs.

**Spec:** `docs/superpowers/specs/2026-10-24-dashboard-theme-design.md`

## Global Constraints

- Do not modify the landing page or backend behavior.
- Do not add a theme dependency or a second theme system.
- Preserve existing layout, functionality, filtering, sorting, polling, and chart data.
- Preserve readable HTTP method, status, and error distinctions in both themes.
- Handle unavailable localStorage safely.

## Review Focus

- Invalid or unavailable localStorage: fall back to System without crashing; test in the theme utility task.
- OS theme changes: update only when preference is System; test subscription and cleanup in the provider task.
- First paint: root mode must be applied before the application bundle runs; verify bootstrap behavior in the HTML/bootstrap task.
- Theme-specific chart and overlay colors: verify semantic CSS variables are used in both modes in the styling task.
- Keyboard and screen-reader access: selector must have an accessible label and native keyboard behavior; verify in the selector task.

---

### Task 1: Theme preference utilities and provider

**Files:**
- Create: `dashboard/src/theme.ts`
- Create: `dashboard/src/theme-provider.tsx`
- Test: `dashboard/src/theme.test.ts`
- Modify: `dashboard/src/main.tsx`

**Interfaces:**
- Produces `ThemePreference = "light" | "dark" | "system"`.
- Produces `THEME_STORAGE_KEY`, `readThemePreference()`, `writeThemePreference()`, `resolveThemePreference()`, and `applyTheme()` from `dashboard/src/theme.ts`.
- Produces `ThemeProvider` and `useTheme()` with `{ preference, resolvedTheme, setPreference }` from `dashboard/src/theme-provider.tsx`.

- [ ] **Step 1: Write failing utility tests** for valid/invalid preference reads, localStorage failures, system resolution, and applying/removing the root `.dark` class plus `color-scheme`.
- [ ] **Step 2: Run `npx tsx --test dashboard/src/theme.test.ts` and verify the new tests fail for missing utilities.**
- [ ] **Step 3: Implement the pure utilities** with defensive storage access and no module-level browser assumptions.
- [ ] **Step 4: Implement `ThemeProvider`** to initialize from the saved preference, apply the resolved mode, subscribe to `matchMedia` changes only in System mode, and unsubscribe on cleanup.
- [ ] **Step 5: Wrap `<App />` with `ThemeProvider` in `main.tsx`.**
- [ ] **Step 6: Run the focused tests and verify they pass.**

### Task 2: First-paint bootstrap and semantic tokens

**Files:**
- Modify: `dashboard/index.html`
- Modify: `dashboard/src/index.css`
- Test: `dashboard/src/theme.test.ts` or a focused bootstrap assertion in the same test file.

**Interfaces:**
- Consumes `THEME_STORAGE_KEY` and the same `light | dark | system` contract from Task 1.
- Produces semantic `success`, `warning`, `info`, and `overlay` color tokens available to dashboard classes.

- [ ] **Step 1: Add a failing bootstrap test/assertion** covering saved Light, saved Dark, invalid storage, and System fallback behavior.
- [ ] **Step 2: Implement a small inline script before the app module** that safely reads the preference, resolves the initial mode with `matchMedia`, toggles `.dark` on `<html>`, and sets `color-scheme` before first paint.
- [ ] **Step 3: Extend both light and dark CSS token sets** with semantic status/overlay values and expose them through the existing Tailwind theme mapping.
- [ ] **Step 4: Run the focused tests and inspect the generated HTML/build output to confirm the bootstrap precedes `src/main.tsx`.**

### Task 3: Reusable selector and page integration

**Files:**
- Create: `dashboard/src/components/theme-selector.tsx`
- Modify: `dashboard/src/pages/dashboard-header.tsx`
- Modify: `dashboard/src/pages/login-page.tsx`

**Interfaces:**
- Consumes `useTheme()` from Task 1.
- Produces an accessible selector with Light, Dark, and System options, preserving native keyboard interaction and the existing visual language.

- [ ] **Step 1: Add selector behavior tests** for rendering all options, exposing an accessible label, and calling `setPreference` with the selected value.
- [ ] **Step 2: Implement the selector using existing input/select/button styling** and a compact responsive presentation.
- [ ] **Step 3: Render it in the authenticated header and login page** without changing existing navigation or authentication behavior.
- [ ] **Step 4: Run the focused selector tests/typecheck and verify the selector remains usable at narrow widths.**

### Task 4: Replace remaining hardcoded dashboard theme colors

**Files:**
- Modify: `dashboard/src/pages/dashboard-header.tsx`
- Modify: `dashboard/src/pages/overview-page.tsx`
- Modify: `dashboard/src/pages/requests-page.tsx`
- Modify: `dashboard/src/components/ui/alert-dialog.tsx`
- Modify: any additional dashboard component found by the focused hardcoded-color audit.

**Interfaces:**
- Consumes semantic tokens from Task 2.
- Preserves existing method/status/error distinctions and all current component behavior.

- [ ] **Step 1: Replace the LIVE indicator, overview failure state, method/status badge colors, and dialog backdrop with semantic token classes or variables.**
- [ ] **Step 2: Check request details, execution timeline, database/HTTP details, JSON/code viewers, filters, pagination, and chart tooltip classes for remaining theme-incompatible colors; change only necessary dashboard instances.**
- [ ] **Step 3: Run the hardcoded-color audit and confirm no unrelated landing-page assets or backend files were changed.**

### Task 5: Verification and handoff

**Files:**
- No additional product files unless verification exposes a focused defect.

- [ ] **Step 1: Run focused theme tests.**
- [ ] **Step 2: Run dashboard typecheck and production build.**
- [ ] **Step 3: Run existing relevant tests/lint, recording any pre-existing failures separately.**
- [ ] **Step 4: Exercise Login, Overview, Requests, and Request Details in Light, Dark, and System modes; verify reload persistence, OS-change behavior, charts, popovers, dialogs, JSON/code areas, loading/empty/error states, mobile layout, and keyboard focus.**
- [ ] **Step 5: Review `git diff` and `git status`, ensuring the pre-existing modified database is not included and no push/publish occurs.**
