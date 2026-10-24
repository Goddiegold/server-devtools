# ServerDevTools Dashboard Theme Design

## Goal

Extend the existing dashboard semantic color system with a persisted Light/Dark/System preference without changing layout, backend behavior, or the landing page.

## Current foundation

- `dashboard/src/index.css` already defines light variables on `:root` and dark variables on `.dark`.
- Tailwind's existing `dark` custom variant is based on an ancestor `.dark` class.
- Dashboard surfaces and charts already use most semantic tokens.
- There is no theme preference state, first-paint bootstrap, or theme selector.

## Design

1. Add a small theme module/provider with the preference type `light | dark | system`.
   - Read and write one localStorage key defensively.
   - Default to `system` when storage is unavailable or invalid.
   - Resolve `system` using `prefers-color-scheme`.
   - Apply/remove `.dark` on `document.documentElement` and set `color-scheme`.
   - Subscribe to OS changes only while the preference is `system`.

2. Add an inline bootstrap in `dashboard/index.html` before the application bundle.
   - Read the same validated preference key in a try/catch.
   - Resolve the initial mode and apply the root class before first paint.
   - Fall back to system mode when localStorage or media-query APIs are unavailable.

3. Add a reusable accessible `ThemeSelector` using existing button/select styling.
   - Offer Light, Dark, and System options.
   - Render it on the authenticated dashboard header and login page.
   - Preserve keyboard navigation and native labels.

4. Extend semantic tokens only where needed.
   - Add success, warning, info, and overlay tokens in both themes.
   - Use them for the LIVE indicator, method/status distinctions, failure states, and dialog backdrop.
   - Keep chart colors and existing layout intact.

5. Verify behavior with focused theme utility tests plus existing typecheck/build checks.

## Non-goals

- No new theme dependency.
- No backend or landing-page changes.
- No dashboard layout redesign or feature changes.
