# Current design decisions

Use this document and the updated coding prompts when older frames disagree. Existing PNGs, the homepage HTML, and draw_frames.py are historical visual references, not current screenshots. Their outcome numbers are illustrative and must not be seeded.

## Shared shell
- Keep the warm light palette, orange primary CTA, rounded white cards, and Muse blue/avatar treatment from AGENTS.md.
- Footer: How we verify / Request / Create / Privacy / Terms / Feedback. Three columns/two rows on mobile, naturally wrapping links on desktop; 44px tap targets, no tagline or large row gaps.
- Keep descriptive labels in the mobile menu. Internal navigation, including the logo/home link, must not flash a blank page.

## Request a playbook (P12d)
- Page title: Request a playbook. No introductory paragraph underneath.
- Form heading: What would you like AI to help with?
- Topic: required icon choices, two columns below 640px; naturally wrapping chips on wider screens. No preselection.
- Goal: required native dropdown of purposes for the selected topic. Disabled until a topic is selected; every topic offers Something else. Changing topic clears Goal, but preserves typed text.
- Exact topics and purposes are in P12d of the coding prompts; preserve Shopping, Creativity, Travel planning, Travel booking, Personal finance, Productivity, Small business, Health, and Something else with their icons.
- Tell us a little more: required 3–500 characters, with a tailored example hint, never automatically submitted as content.
- Email (optional), then Send request. No privacy helper paragraph. Preserve all fields after failure; show a short failure message only after a failed send, and dismiss it on editing. Keep inline field errors.
- Below the form: brief What happens next expectations and a secondary Create a playbook link. No sign-in required.

## Create, Try, and Report
- Six numbered creation sections; no public creator-name field or live author-credit line. Existing P10b attribution is retained; public profiles remain deferred.
- Automatic input keys, clear user-input labels, editable generated prompt in the prompt box, and input insertion controls named for the inputs. Do not expose an editable technical key field.
- Steps to use the playbook: Step 1 has the editable default “Enter your details, then copy the prompt into Muse.” Step 2 is optional; further steps are added only as needed. Creator submissions accept 1–5 completed steps; curated YAML import uses 3–5.
- Creation actions: Submit for review / Preview playbook / Save draft. Incomplete drafts are saveable. Validation identifies the specific fields.
- Try steps are instructional bullets, not checkbox inputs.
- Reports: clear evidence-upload control, inline redaction tips that preserve the form, concise field labels with optional markers in parentheses. Use Amount saved where appropriate; report measurement follows the playbook outcome type.
- Referral placement is possible only after verification, never guaranteed; referrals do not affect ranking.
- Feedback: footer button says Feedback; dialog and report-success action say Send feedback. Accessible desktop dialog/mobile sheet, text preserved on errors.

## Agent assets
Use assets/muse-avatar.png and assets/agents/{chatgpt,grok,manus}.svg. Preserve the accompanying license and source notes. Muse is the only selectable launch agent. Display ChatGPT, Grok, and Manus as disabled upcoming choices. Hide Instinct, Claude, and Gemini. Legacy data identifiers chatgpt-dots and grok-bot do not determine display names.

## Verification
Check keyboard use, focus, labels, readable wrapping, and no horizontal overflow at 360px, 390×844, and desktop widths. Existing fixtures contain no real outcome statistics.
