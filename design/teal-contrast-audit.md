# Teal contrast audit pattern

## Rule

On any **teal tint background** (`bg-teal-50`, `bg-teal-100`, or variants like `bg-teal-50/90`), use **text-teal-900** for body text and labels so contrast meets WCAG AA. Reserve **text-teal-600** / **text-teal-700** for links and accents on **white or gray** backgrounds only.

## How to find remaining issues

1. **List all teal-tint backgrounds**
   ```bash
   rg 'bg-teal-(50|100)' packages/web/src --type-add 'web:*.{tsx,jsx,css}' -t web -n
   ```

2. **List all mid-tone teal text** (candidates that may sit on teal tint)
   ```bash
   rg 'text-teal-(600|700|800)' packages/web/src --type-add 'web:*.{tsx,jsx}' -t web -n
   ```

3. **Manual check**  
   For each `text-teal-600` / `text-teal-700` (and optionally `text-teal-800`), open the file and see whether that element is:
   - Inside (or a direct sibling of) a node that has `bg-teal-50` or `bg-teal-100` in the same component.
   - If yes → change to `text-teal-900`.
   - If the text is on white, gray, or default page background → leave as-is.

## Do not change

- Links on white/gray (e.g. "Settings → Scanner Configurations", back to qPCR experiments).
- Form control focus rings (`focus:ring-teal-500`, `text-teal-600` on radio/checkbox when the control is on white).
- Tab labels on white tab bar (`border-teal-500 text-teal-600` for selected tab).
- Status text on white cards (e.g. Import page "Creating..." inside `border rounded-lg p-4` with no teal background).

## Global styles

File input "Choose file" button and trigger/label use teal-100 background; their text is set in `packages/web/src/index.css` (`.file-input-accent`, `.file-input-trigger`, `.file-input-label`) to teal-900 so contrast is sufficient.
