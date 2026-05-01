# Contact Form for cpj.fyi

## Overview

A contact form on cpj.fyi that lets visitors send a message to Clay. Submissions go to Slack via the existing cpj-worker Cloudflare Worker. The form lives in a custom Ghost page template, matching the standard site style.

## Components

### 1. Ghost Theme: `custom-contact.hbs`

A new custom page template, following the same pattern as `custom-buy.hbs`.

**Template structure:**
- Extends `default.hbs` via `{{!< default}}`
- Wrapped in a `.contact-page` container
- All classes prefixed `cf-` (contact form)
- Use `:where(.contact-page)` for any element-level resets to avoid specificity conflicts with theme base styles (per project convention)

**Form fields:**
- **Name** — text input, required, maxlength 200
- **Email** — email input, required, maxlength 254
- **Phone** — tel input, optional, maxlength 30. Helper text: "Add your cell if text is faster!"
- **Message** — textarea, required, maxlength 5000
- **Honeypot** — hidden text input (`cf-website`), visually hidden via CSS. Submissions with a value are silently rejected by the worker.
- **Submit button** — standard `btn btn-primary`

**Behavior:**
- Form submits via `fetch()` to `https://cpj-worker.clay-893.workers.dev/contact` (same worker domain used by click tracking in `main.js`)
- On success: form element is replaced inline with: "Thanks for reaching out! I'll get back to you soon."
- On error: inline error message below the submit button: "Something went wrong. Please try again."
- Submit button shows a loading state (disabled + text change) during submission
- Basic client-side validation via HTML5 `required`, `type="email"`, and `maxlength` attributes

**Styling:**
- Dedicated `contact-form.css` in `assets/css/` (loaded unconditionally in `default.hbs` alongside `buy-page.css` — both are small)
- Standard site style: cream background (`#F8F8F8`), Freight Text Pro for body text, system sans for labels/inputs
- Form centered, max-width ~600px
- Minimal, clean layout — no hero, no special effects

**JS:**
- Inline `<script>` at the bottom of the template to avoid adding another unconditionally-loaded JS file
- Handles form submission, loading state, success/error display

### 2. Cloudflare Worker: `POST /contact` route

New route in `cpj-worker/src/index.js`.

**Validation:**
- Check `Content-Type: application/json` header; return 400 if not JSON
- `name`, `email`, `message` must be present and non-empty after trimming
- `email` must pass a basic format regex
- `phone` is optional
- Server-side length limits: name 200, email 254, phone 30, message 5000
- If honeypot field (`website`) has a value, return `{ ok: true }` silently (don't send to Slack)
- Returns `400` with `{ error: "missing fields" }` or `{ error: "invalid email" }` on failure

**Rate limiting:**
- Uses the existing `isDuplicate()` dedup mechanism
- Key: `contact:${ip}` — prevents the same IP from submitting twice within 10 seconds
- Note: This is best-effort since Workers run on multiple isolates. Acceptable for v1; CAPTCHA can be added later if spam becomes a problem.

**Slack message format:**

Uses the existing `postToSlack()` helper with Slack Block Kit, following the `formatClick()` pattern (section block + context block):

```javascript
{
  text: ':envelope: Contact form: Name (email)',
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ':envelope: *New Contact Form Submission*\n*Name:* Clay Parker Jones\n*Email:* clay@example.com\n*Phone:* 555-1234\n\n> Message text here...'
      }
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'cpj.fyi · 3/17/2026, 2:30:00 PM' }]
    }
  ]
}
```

**Response:** `{ ok: true }` on success.

### 3. Footer: Contact Button

Add a "Contact" link in `partials/footer.hbs` on the same line as the existing Subscribe/Account Settings button in the `footer-newsletter-inner` div. Both buttons sit side by side.

**Styling:**
- White background (`#FFFFFF`), dark text (`#222222`)
- Uses a new class `btn btn-contact` defined in `screen.css` or `contact-form.css`
- Links to `/contact/`

### 4. `default.hbs` Updates

Add `contact-form.css` to the `<head>` alongside `buy-page.css`.

## Setup Steps (Manual)

After deploying the theme:

1. Create a new Ghost **Page** (not post) with slug `contact`
2. In page settings, select Template: **contact**
3. Page title/content in Ghost editor are optional — the template provides everything
4. The footer link will work automatically once the page exists at `/contact/`

## Files Changed

| File | Change |
|------|--------|
| `cpj-theme/custom-contact.hbs` | New file — contact form template with inline JS |
| `cpj-theme/assets/css/contact-form.css` | New file — form styles |
| `cpj-theme/partials/footer.hbs` | Add Contact button next to Subscribe/Account Settings |
| `cpj-theme/default.hbs` | Add `contact-form.css` reference |
| `cpj-worker/src/index.js` | Add `POST /contact` route with validation, honeypot, dedup, Slack notification |

## Out of Scope

- Email delivery (Slack only)
- CAPTCHA (can be added later if spam becomes an issue; honeypot provides baseline protection)
- File uploads
- Auto-reply emails to the submitter
