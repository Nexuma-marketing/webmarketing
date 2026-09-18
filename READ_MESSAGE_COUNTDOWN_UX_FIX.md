# Original Purpose Confirmed

Located in [src/app/forms/pymes/page.tsx](src/app/forms/pymes/page.tsx) — this is step 9 ("Review") of the Sales Leak Diagnosis form itself, the screen shown immediately after answering all 7 diagnostic questions and before the "Get Full Results" submit actually fires (which then creates the `pymes_diagnosis` row and redirects to `/results/pymes/[id]`). It's the screen the task describes as "after completing the form and viewing results."

The intent is explicit in the existing code comment (`// Steve #6-2: when entering review step (9), start 6-second countdown so user has time to read the urgency message before submitting`): this step shows a PDF-5.1.1.1-style urgency card (title/body/emoji, estimated annual loss, diagnostic score) plus the recommended-plan summary, and the 6-second delay is a deliberate pacing mechanism to stop the user from reflexively clicking through without reading it — a business-relevant message, not filler. There's already a supporting line above the card ("Take your time to review. Click 'Get Full Results' below when ready."), but it sits well above the button itself and does nothing to explain *why the button won't respond* when the user reaches it.

**Finding: the delay serves a real, intentional purpose and should stay.** The bug is purely presentational — a static `Read the message (Xs)` label with no other visual signal reads as a frozen/broken control, not a countdown.

# UX Redesign Implemented

Chose a **ring-progress indicator + status-style wording**, rather than only smoothing the text, because a bare countdown number in parentheses was the exact thing already reading as glitchy — pairing it with a visibly *moving* element is what makes "this is intentionally timed" legible at a glance, without the user having to parse the number.

- **Draining ring icon**: a small inline SVG circle (no new dependency) drawn next to the label, using `stroke-dasharray`/`stroke-dashoffset` to show a ring depleting from full to empty over the 6 seconds. The offset target is recalculated once a second in sync with `reviewCountdown`, but a CSS `transition-[stroke-dashoffset] duration-1000 ease-linear` interpolates smoothly between each second's value — so the ring visibly drains continuously rather than jumping in six discrete steps.
- **Status wording instead of an instruction**: `"Read the message (Xs)"` (phrased like a command the user is failing to follow) became `"Reviewing your plan… Xs"` (phrased like something happening on its own, which is what's actually true — nothing further is required of the user but to wait).
- **A short caption under the button**, shown only while counting down: *"Take a moment to read the message above — this unlocks automatically."* This directly satisfies the "clearly communicates this will be clickable in a moment" requirement and explicitly rules out "stuck/broken" as an interpretation, without cluttering the button label itself.
- **Smooth disabled→enabled transition**: the shared `Button` component ([src/components/ui/button.tsx](src/components/ui/button.tsx)) already applies `transition-all` unconditionally and `disabled:opacity-50` conditionally — so as soon as `reviewCountdown` hits 0 and `disabled` is lifted, the browser already animates the opacity change from 50%→100% for free. No new transition logic was needed for that part; confirmed it was already there and just wasn't visible before because nothing else about the disabled state looked intentional enough to notice the fade.

What was **not** changed: the 6-second duration, the `onSubmit` handler, and everything that happens once the button is actually clickable and clicked (form submission, redirect to `/results/pymes/[id]`) — untouched.

# Files Modified

- [src/app/forms/pymes/page.tsx](src/app/forms/pymes/page.tsx) — replaced the step-9 submit button's plain text countdown with the ring indicator, updated wording, and added the reassurance caption. `reviewCountdown` state and its `useEffect` timer are untouched.

# Expected Result

On the Sales Leak Diagnosis review step, the "Get Full Results" button now shows a small ring that visibly drains over 6 seconds alongside "Reviewing your plan… Xs," with a caption underneath explaining that it unlocks on its own — reading as a deliberate, running process rather than a stuck or broken control. When the countdown ends, the button fades from its dimmed disabled state into its normal clickable state (already-existing button transition, now actually noticeable) and behaves exactly as before once clicked.

Not visually verified in a browser — this sandbox has no `node`/`npm` available to run the dev server, so the change was verified by careful reading of the JSX/CSS logic rather than a live render.
