# Contact Form Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contact form to cpj.fyi that sends submissions to Slack via the existing Cloudflare Worker.

**Architecture:** Custom Ghost page template (`custom-contact.hbs`) with inline JS submits to a new `POST /contact` route on cpj-worker. The worker validates, checks honeypot/dedup, formats a Slack Block Kit message, and posts via the existing `postToSlack()` helper. A white "Contact" button is added to the site footer.

**Tech Stack:** Ghost 6.x Handlebars templates, vanilla CSS/JS, Cloudflare Workers (vanilla JS)

**Spec:** `docs/superpowers/specs/2026-03-17-contact-form-design.md`

---

### Task 1: Worker — `POST /contact` route

**Files:**
- Modify: `cpj-worker/src/index.js`

This task is independent of the theme tasks and can be built/deployed first.

- [ ] **Step 1: Add `formatContact()` function**

Add after the `formatClick()` function (around line 157):

```javascript
// ── Contact form formatter ─────────────────────────────────────
function formatContact(data) {
  const phone = data.phone ? `\n*Phone:* ${data.phone}` : '';
  return {
    text: `:envelope: Contact form: ${data.name} (${data.email})`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:envelope: *New Contact Form Submission*\n*Name:* ${data.name}\n*Email:* ${data.email}${phone}\n\n> ${data.message}`,
        },
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `cpj.fyi · ${timestamp()}` }] },
    ],
  };
}
```

- [ ] **Step 2: Add `handleContact()` function**

Add after `handleClick()` (around line 211):

```javascript
async function handleContact(request, env) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return json({ error: 'invalid content type' }, 400);

  let data;
  try { data = await request.json(); }
  catch { return json({ error: 'invalid json' }, 400); }

  // Honeypot — silent success
  if (data.website) return json({ ok: true });

  // Trim and validate
  const name = (data.name || '').trim();
  const email = (data.email || '').trim();
  const message = (data.message || '').trim();
  const phone = (data.phone || '').trim();

  if (!name || !email || !message) return json({ error: 'missing fields' }, 400);
  if (name.length > 200 || email.length > 254 || phone.length > 30 || message.length > 5000) {
    return json({ error: 'input too long' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid email' }, 400);

  // Dedup
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (isDuplicate(`contact:${ip}`)) return json({ ok: true, deduped: true });

  const msg = formatContact({ name, email, phone, message });
  await postToSlack(env.SLACK_WEBHOOK_URL, msg.blocks, msg.text);
  return json({ ok: true });
}
```

- [ ] **Step 3: Add route to fetch handler**

In the `fetch()` entry point, add the `/contact` route before the 404 fallback (around line 233):

```javascript
    if (request.method === 'POST' && pathname === '/contact') {
      return handleContact(request, env);
    }
```

- [ ] **Step 4: Test locally with wrangler**

```bash
cd cpj-worker
npx wrangler dev
```

Then in another terminal:

```bash
# Should return { ok: true } (honeypot test — no Slack message sent)
curl -X POST http://localhost:8787/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"test@example.com","message":"Hello","website":"gotcha"}'

# Should return { error: "missing fields" }
curl -X POST http://localhost:8787/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"","email":"test@example.com","message":"Hello"}'

# Should return { error: "invalid email" }
curl -X POST http://localhost:8787/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"notanemail","message":"Hello"}'

# Should return { error: "invalid content type" }
curl -X POST http://localhost:8787/contact \
  -d 'name=Test&email=test@example.com&message=Hello'

# Should succeed and send to Slack (requires SLACK_WEBHOOK_URL secret)
curl -X POST http://localhost:8787/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Clay","email":"clay@cpj.fyi","phone":"555-1234","message":"Testing the contact form"}'
```

- [ ] **Step 5: Commit**

```bash
git add cpj-worker/src/index.js
git commit -m "feat(worker): add POST /contact route for contact form submissions"
```

---

### Task 2: Theme — Contact form CSS

**Files:**
- Create: `cpj-theme/assets/css/contact-form.css`
- Modify: `cpj-theme/default.hbs`

- [ ] **Step 1: Create `contact-form.css`**

Create `cpj-theme/assets/css/contact-form.css`:

```css
/* Contact Form — classes prefixed cf- */
/* Uses :where() for element resets to avoid specificity conflicts with screen.css */

:where(.contact-page) h1,
:where(.contact-page) p,
:where(.contact-page) label {
  margin: 0;
  padding: 0;
}

.cf-wrapper {
  max-width: 600px;
  margin: 0 auto;
  padding: 80px 20px;
}

.cf-heading {
  font-family: 'freight-text-pro', Georgia, serif;
  font-size: 2.4rem;
  font-weight: 700;
  color: #222;
  margin-bottom: 8px;
}

.cf-subheading {
  font-size: 1.1rem;
  color: #666;
  margin-bottom: 40px;
}

.cf-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.cf-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cf-label {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  color: #222;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cf-hint {
  font-size: 0.85rem;
  color: #888;
  font-style: italic;
}

.cf-input,
.cf-textarea {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 1rem;
  padding: 12px 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  color: #222;
  transition: border-color 0.2s;
}

.cf-input:focus,
.cf-textarea:focus {
  outline: none;
  border-color: #222;
}

.cf-textarea {
  min-height: 160px;
  resize: vertical;
}

/* Honeypot — visually hidden */
.cf-hp {
  position: absolute;
  left: -9999px;
  top: -9999px;
  opacity: 0;
  height: 0;
  width: 0;
  overflow: hidden;
}

.cf-submit {
  align-self: flex-start;
}

.cf-submit .btn {
  min-width: 160px;
}

.cf-submit .btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cf-error {
  color: #d63333;
  font-size: 0.9rem;
  margin-top: 4px;
  display: none;
}

.cf-error.is-visible {
  display: block;
}

/* Success state */
.cf-success {
  text-align: center;
  padding: 60px 20px;
}

.cf-success-heading {
  font-family: 'freight-text-pro', Georgia, serif;
  font-size: 1.8rem;
  font-weight: 700;
  color: #222;
  margin-bottom: 12px;
}

.cf-success-text {
  font-size: 1.1rem;
  color: #666;
}

/* Footer contact button */
.btn-contact {
  background: #fff;
  color: #222;
  border: none;
}

.btn-contact:hover {
  background: #f0f0f0;
  color: #222;
}

@media (max-width: 600px) {
  .cf-wrapper {
    padding: 40px 16px;
  }

  .cf-heading {
    font-size: 1.8rem;
  }
}
```

- [ ] **Step 2: Add CSS reference to `default.hbs`**

In `cpj-theme/default.hbs`, add after line 10 (`buy-page.css` link):

```html
    <link rel="stylesheet" href="{{asset "css/contact-form.css"}}">
```

- [ ] **Step 3: Commit**

```bash
git add cpj-theme/assets/css/contact-form.css cpj-theme/default.hbs
git commit -m "feat(theme): add contact form CSS and load in default template"
```

---

### Task 3: Theme — Contact form template

**Files:**
- Create: `cpj-theme/custom-contact.hbs`

- [ ] **Step 1: Create `custom-contact.hbs`**

Create `cpj-theme/custom-contact.hbs`:

```handlebars
{{!--
    Custom template for the Contact page
    Uses: custom-contact.hbs (select "contact" template in Ghost page settings)
--}}

{{!< default}}

<div class="contact-page">
  <div class="cf-wrapper" id="cf-wrapper">
    <h1 class="cf-heading">Get in Touch</h1>
    <p class="cf-subheading">Have a question, idea, or just want to say hello?</p>

    <form class="cf-form" id="cf-form">
      <div class="cf-field">
        <label class="cf-label" for="cf-name">Name</label>
        <input class="cf-input" type="text" id="cf-name" name="name" required maxlength="200" autocomplete="name">
      </div>

      <div class="cf-field">
        <label class="cf-label" for="cf-email">Email</label>
        <input class="cf-input" type="email" id="cf-email" name="email" required maxlength="254" autocomplete="email">
      </div>

      <div class="cf-field">
        <label class="cf-label" for="cf-phone">Phone</label>
        <span class="cf-hint">Add your cell if text is faster!</span>
        <input class="cf-input" type="tel" id="cf-phone" name="phone" maxlength="30" autocomplete="tel">
      </div>

      <div class="cf-field">
        <label class="cf-label" for="cf-message">Message</label>
        <textarea class="cf-textarea" id="cf-message" name="message" required maxlength="5000"></textarea>
      </div>

      {{!-- Honeypot --}}
      <div class="cf-hp" aria-hidden="true">
        <label for="cf-website">Website</label>
        <input type="text" id="cf-website" name="website" tabindex="-1" autocomplete="off">
      </div>

      <div class="cf-submit">
        <button type="submit" class="btn btn-primary" id="cf-btn">Send Message</button>
        <p class="cf-error" id="cf-error"></p>
      </div>
    </form>
  </div>
</div>

<script>
(function() {
  var WORKER_URL = 'https://cpj-worker.clay-893.workers.dev/contact';
  var form = document.getElementById('cf-form');
  var btn = document.getElementById('cf-btn');
  var errorEl = document.getElementById('cf-error');
  var wrapper = document.getElementById('cf-wrapper');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('is-visible');
  }

  function hideError() {
    errorEl.classList.remove('is-visible');
  }

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    hideError();

    var name = form.elements.name.value.trim();
    var email = form.elements.email.value.trim();
    var phone = form.elements.phone.value.trim();
    var message = form.elements.message.value.trim();
    var website = form.elements.website.value;

    if (!name || !email || !message) {
      showError('Please fill in all required fields.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending\u2026';

    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, email: email, phone: phone, message: message, website: website })
    })
    .then(function(res) {
      if (!res.ok) return res.json().then(function(d) { throw new Error(d.error || 'request failed'); });
      wrapper.innerHTML =
        '<div class="cf-success">' +
          '<h2 class="cf-success-heading">Thank you!</h2>' +
          '<p class="cf-success-text">Thanks for reaching out! I\u2019ll get back to you soon.</p>' +
        '</div>';
    })
    .catch(function(err) {
      showError(err.message || 'Something went wrong. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Send Message';
    });
  });
})();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add cpj-theme/custom-contact.hbs
git commit -m "feat(theme): add contact form page template"
```

---

### Task 4: Theme — Footer contact button

**Files:**
- Modify: `cpj-theme/partials/footer.hbs:55-67`

- [ ] **Step 1: Add Contact button to footer**

In `cpj-theme/partials/footer.hbs`, modify the `footer-newsletter-inner` div. After the existing Subscribe/Account Settings button (line 63 or 65), add the Contact button. The result should look like:

```handlebars
        <div class="footer-newsletter">
            <div class="footer-newsletter-inner">
                <div class="footer-newsletter-text">
                    <h4>{{@custom.sidebar_newsletter_heading}}</h4>
                    <p>{{@custom.sidebar_newsletter_text}}</p>
                </div>
                <div class="footer-newsletter-actions">
                    {{#if @member}}
                        <a href="#/portal/account" class="btn btn-primary">Account Settings</a>
                    {{else}}
                        <a href="#/portal/signup" class="btn btn-primary">Subscribe</a>
                    {{/if}}
                    <a href="/contact/" class="btn btn-contact">Contact</a>
                </div>
            </div>
        </div>
```

Note: This wraps the buttons in a new `footer-newsletter-actions` div so they can sit side by side. The existing CSS for `footer-newsletter-inner` likely uses flexbox — the new wrapper groups the buttons together.

- [ ] **Step 2: Add layout CSS for the button group**

Append to `cpj-theme/assets/css/contact-form.css`:

```css
/* Footer button group */
.footer-newsletter-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

@media (max-width: 768px) {
  .footer-newsletter-actions {
    flex-direction: column;
    gap: 8px;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add cpj-theme/partials/footer.hbs cpj-theme/assets/css/contact-form.css
git commit -m "feat(theme): add Contact button to site footer"
```

---

### Task 5: Deploy and verify

- [ ] **Step 1: Deploy worker**

```bash
cd cpj-worker
npx wrangler deploy
```

Expected: Successful deployment to `https://cpj-worker.clay-893.workers.dev`

- [ ] **Step 2: Test deployed worker endpoint**

```bash
# Validation error test
curl -X POST https://cpj-worker.clay-893.workers.dev/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"","email":"test@example.com","message":"Hello"}'
# Expected: {"error":"missing fields"}
```

- [ ] **Step 3: Deploy theme**

Zip the theme and upload to Ghost Admin:

```bash
cd cpj-theme
zip -r ../cpj-theme.zip . -x "node_modules/*" -x ".git/*" -x "docs/*"
```

Upload `cpj-theme.zip` in Ghost Admin → Design → Change theme → Upload.

- [ ] **Step 4: Create Ghost page**

In Ghost Admin:
1. Pages → New page
2. Title: "Contact" (or leave blank — template provides heading)
3. Page settings → URL slug: `contact`
4. Page settings → Template: select **contact**
5. Publish

- [ ] **Step 5: Verify end-to-end**

1. Visit `https://cpj.fyi/contact/` — form should render with cream background, correct fonts
2. Submit with empty fields — client-side validation should prevent submission
3. Fill and submit — should show "Thanks for reaching out!" message
4. Check Slack — should see the formatted contact notification
5. Scroll to footer on any page — "Contact" button should appear next to Subscribe/Account Settings, white with dark text
6. Click footer Contact button — should navigate to `/contact/`

- [ ] **Step 6: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: final adjustments after deployment verification"
```
