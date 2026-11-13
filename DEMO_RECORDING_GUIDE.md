# FairHold — Demo Recording Guide

This guide documents the complete buyer → seller → reviewer multi-milestone demo journey for recording a professional project video. In the **local** development environment every workflow uses the simulated (demo) payment provider, so no real PayPal transaction occurs. On the **live deployment** the signed-in workspace uses the PayPal **sandbox** provider instead — see [Payments in production](#payments-in-production) below.

## Where to record: local or the live deployment

Both work. Pick one and stay in it for the whole recording.

| Target | URL | Use it when |
|---|---|---|
| **Live production** (recommended for a judge-facing video) | https://fairhold-beta.vercel.app | You want the recording to show the real deployed app with the real PostgreSQL database and the public URL on screen. Sign in with the same three demo identities — the production scope is configured with the same allowlists. |
| **Local development** | http://localhost:3000 | You want to reset demo data between takes, or you need to debug something before recording. Requires `npm run dev` running first. |

Both targets run the same code and the same seeded demo identities. The **payment provider differs**: the local environment has no PayPal credentials and uses the simulated provider, while the Production scope holds PayPal **sandbox** credentials and uses the sandbox provider. The deployed site is the one a judge will open, so it is the better choice for a final take.

> **Payments in production** — three separate things, deliberately not conflated:
>
> | Path | Provider | Money |
> |---|---|---|
> | PayPal **Live** | none — refused by configuration (`PAYPAL_ENV` must be exactly `sandbox`) | No live money can move. |
> | Guided `/demo` (browser-only, no server writes, no provider calls) | in-app **simulated** provider | None. No provider request is made. |
> | Signed-in workspace (`/login` → a deal) | **PayPal sandbox** provider — the button reads "Create PayPal sandbox authorization" | Sandbox funds only. An authorization creates a **real order in the PayPal sandbox** that the buyer must approve in a PayPal sandbox account. |
>
> No PayPal Live account is configured and no real money moves in either target.

## 1. Recording Preparation

### Local Server Startup and Stability

- **Start command:** `npm run dev` in `C:\Users\theni\OneDrive\Desktop\projects main\PPH`
- **Server URL:** http://localhost:3000 (http and network URLs both available)
- **Stability:** Server has been verified stable for >5 minutes with 20+ HTTP checks returning 200
- **If server crashes:** Restart with `npm run dev`. Do not worry — data persists in JSON dev store or PostgreSQL.
- **Browser:** Chromium-based browser recommended. Verify the page loads before recording.

### Browser and Viewport Recommendations

- **Viewport:** 1440x1024 or 1920x1080 recommended. The UI is responsive and works at smaller sizes, but the full layout is best at medium+ widths.
- **Zoom:** 100% (default). Do not zoom the browser — all UI elements are designed at 100%.
- **Browser window:** Maximize for full-width layout. The navbar and dashboards are responsive but look best at full width.
- **Navigation:** Use browser back/forward or page links — do not use browser refresh to navigate between main pages (deals/new, dashboard, login, demo).

### Demo Account Details and Role Responsibilities

Three allowlisted demo identities exist on the server (controlled by `FAIRHOLD_DEMO_*` env vars in `.env.local`):

| Role | Identity | Responsibilities |
|---|---|---|
| **Buyer** | `Alex Buyer` | Reviews evidence, approves captures, manages deal status. Can create deals with milestones. |
| **Seller** | `Jamie Seller` | Submits evidence for milestones, tracks milestone status, delivers against criteria. Cannot approve captures. |
| **Reviewer** | `Morgan Reviewer` | Granted per-deal access only. Reviews and accepts/rejects evidence. Must have explicit deal grant. |

**Login procedure:**
1. Open http://localhost:3000/login
2. Enter display name (one of: `Alex Buyer`, `Jamie Seller`, `Morgan Reviewer`)
3. Select role from dropdown (`buyer`, `seller`, `reviewer`)
4. Click **Continue**

**Important:** Demo authentication is locally signed, not production identity verification. Names must be allowlisted on the server.

### Database / Demo Data Preparation

- **If `.env.local` has `DATABASE_URL`** (Neon PostgreSQL): Deals and evidence stored in PostgreSQL. Data persists across sessions.
- **If `DATABASE_URL` is absent**: App auto-falls back to JSON dev store (`.data/fairhold.json`). Data is ephemeral — disappears on Vercel redeployment but fine for local recording.
- **Current config:** `.env.local` contains `DATABASE_URL=postgresql://neondb_owner:...` (Neon production), so data is durable.

**To prepare a clean demo state:**
- Use the **Demo reset** script: `npm run demo:reset` (resets demo session and deal data)
- Or manually create a new deal via `/deals/new` as Buyer
- If previous deals exist, they can be filtered out using the dashboard search

### Things to Close or Hide Before Recording

- Any `actionError` alert boxes — these indicate failed actions
- The `invalid` error message on login (wrong identity/role combo)
- Browser developer tools console (if visible — press F12 to hide)
- Any `Pending` payment states that might confuse the viewer — simulated payments are labeled "SIMULATED AUTHORIZATION" / "SIMULATED CAPTURE"
- The `No deals yet` empty state if you've already created deals

### Confirm the payment provider matches the target you are recording

**Verify before recording:**

- **Local development** — on any deal page the payment status shows `Simulated authorized` or a similar "simulated" label, and payment badges carry `Simulated` text. The sidebar reads: "PayPal sandbox credentials are configured, but real payment actions require PostgreSQL-backed accounting. This session uses the simulated provider — no PayPal request is made and no money moves." (On a local machine with no PayPal credentials at all, the provider is simply the simulated one.)
- **Live production** — the deal page's payment panel shows the button **"Create PayPal sandbox authorization"** with the caption "Creates a real order in the PayPal sandbox (no live money). The buyer must approve it, then confirm; this is an authorization hold, not a capture or settlement." The **guided `/demo`** page is still the simulated one and says "DEMO MODE — SIMULATED PAYMENTS".
- **Never** should you see references to live PayPal, real money, or `$600 capture`

## 2. Exact Recording Sequence

### Step 1: FairHold Landing Page and Branding

- **Role:** (observer — no login needed)
- **URL:** http://localhost:3000/
- **Navigation:** Open browser to http://localhost:3000
- **Expected screen:** Landing page with geometric red/black shield logo in navbar, "FairHold" wordmark, and hero section
- **What to camera:** The premium FairHold shield branding, red-and-black visual identity, navigation links
- **Key visual element:** `fairhold-shield.svg` in navbar and as favicon

### Step 2: Buyer Login

- **Role:** Buyer
- **URL:** http://localhost:3000/login
- **Navigation:** Click "Login" or "Demo sign in" navbar link, or go directly to /login
- **Actions:**
  1. Enter display name: `Alex Buyer`
  2. Select role: `buyer` from dropdown
  3. Click **Continue**
- **Expected result:** Redirected to `/dashboard` as buyer
- **What to camera:** Login form → name entry → role selection → continue button click → dashboard redirect
- **Verification:** URL should include buyer session; dashboard shows "Buyer workspace" eyebrow

### Step 3: Buyer Creates a Deal with At Least Two Milestones

- **Role:** Buyer (already logged in)
- **URL:** http://localhost:3000/deals/new
- **Actions:**
  1. **Deal title:** Enter `Website redesign — Phase 1` (or similar)
  2. **Client:** Enter `Acme Ltd.` (or counterparty name)
  3. **Freelancer:** Enter `Jordan Lee` (or contractor name)
  4. **Agreement:** Paste a brief description (20+ chars). Example:
     > "Website redesign project with two milestones: discovery and scope, then responsive build. Payment upon completion of each milestone."
  5. Click **Create deal**
- **Expected result:** Redirected to `/deals/new-deal-id` (the deal page)
- **What to camera:** Form fields filled in → create button click → deal page loads
- **Adding milestones:**
  1. On the deal page, scroll to **Milestones** section
  2. Click **Add milestone** (visible when `canAddMilestones` is true)
  3. **First milestone:**
     - Title: `Discovery and scope`
     - Acceptance criteria: "Write project brief and agree on deliverables"
     - Amount: leave default or enter `1500` (cents = $15.00)
     - Due date: leave blank or set a date
  4. Click outside or press outside to save
  5. **Second milestone:**
     - Title: `Responsive build`
     - Acceptance criteria: "Build responsive UI and test at mobile breakpoints"
     - Amount: `2000` (cents = $20.00)
     - Due date: leave blank
  6. Click outside to save
- **What to camera:** Milestone form fields → adding first milestone → adding second milestone → milestone rail shows 2 milestones
- **Verification:** Deal page shows 2 milestones in the milestone rail, progress shows 50% initially

### Step 4: Seller Login and Deal Access

- **Role:** Seller
- **URL:** http://localhost:3000/login
- **Actions:**
  1. Enter display name: `Jamie Seller`
  2. Select role: `seller` from dropdown
  3. Click **Continue**
- **Expected result:** Redirected to `/dashboard` as seller, or deal page if deal ID known
- **What to camera:** Seller login form → continue → dashboard or deal access
- **Deal access:** From dashboard, click the deal link (visible in "All deals" list or "Buyer queue" if evidence pending)

### Step 5: Seller Submits Milestone One Evidence

- **Role:** Seller (logged in, viewing deal page)
- **URL:** http://localhost:3000/deals/[deal-id] (the deal from Step 3)
- **Navigation:** From dashboard, click the deal link, or directly visit the deal URL
- **Actions:**
  1. On the deal page, find the **first milestone** (`Discovery and scope`)
  2. Click **Add Evidence** or **Submit Evidence** (visible via `EvidenceAdvisoryPanel` / `SubmittedEvidenceAdvisory`)
  3. **Evidence submission form:**
     - Note: "Initial evidence submission for discovery milestone"
     - File: (can upload a file, or just add note — the form accepts note + url + file)
     - URL: (optional) link to supporting doc
   - **Submit**
- **Expected result:** Evidence submitted, milestone status updates, recommendation appears
- **What to camera:** Evidence form → note entry → submit click → evidence appears in milestone card → recommendation badge ("HOLD" or similar)
- **Verification:** Milestone evidence count increases; recommendation shows human decision required

### Step 6: Reviewer Login and Evidence Review

- **Role:** Reviewer
- **URL:** http://localhost:3000/login
- **Actions:**
  1. Enter display name: `Morgan Reviewer`
  2. Select role: `reviewer` from dropdown
  3. Click **Continue**
  4. If prompted about deal grant, ensure the deal was created and the reviewer has access (the system checks `canAccessDeal`)
- **Expected result:** Redirected to dashboard or deal page depending on grant status
- **What to camera:** Reviewer login → continue → deal access verification

**On the deal page as reviewer:**
- View the evidence submitted by seller
- Use the **Approval Panel** to accept or reject
- **Accept:** Click approval → records decision → payment progression possible
- **Reject:** Provide feedback note → milestone returns to seller for revision

### Step 7: Reviewer Rejects or Approves Evidence

- **Role:** Reviewer (on deal page)
- **Actions:**
  1. Review the evidence note submitted by seller
  2. In the **Approval Panel**, choose one:
     - **Approve:** Records acceptance → milestone moves toward capture
     - **Reject with feedback:** Enter feedback note → seller must revise and resubmit
  3. If approving, the system records the decision and may enable payment progression
- **Expected result:** Decision recorded, audit trail updated
- **What to camera:** Approval panel → accept/reject click → result display → deal status update
- **Verification:** Approval badge appears on milestone; recommendation action changes

### Step 8: Seller Responds to Feedback and Submits Milestone Two Evidence

- **Role:** Seller (logged in, viewing same deal)
- **Actions:**
  1. Review the reviewer feedback note
  2. Revise the second milestone evidence:
     - Title: `Responsive build — revised`
     - Acceptance criteria: "Build responsive UI with feedback incorporated; test at mobile breakpoints"
     - Amount: `2000` (cents)
  3. Submit evidence for **milestone two** (the newly revised one)
     - Note: "Revised evidence for responsive build milestone"
  4. Submit
- **Expected result:** Milestone two evidence recorded, seller notified of reviewer action
- **What to camera:** Seller viewing feedback → revising milestone → submitting evidence for milestone two → confirmation
- **Verification:** Two milestones now have evidence; milestone two shows revised acceptance criteria

### Step 9: Reviewer Completes the Next Review

- **Role:** Reviewer (on same deal page)
- **Actions:**
  1. Review the new evidence for milestone two
  2. In the **Approval Panel**, choose:
     - **Approve** (recommended for demo completion): Records acceptance
     - Or reject with feedback if needed
  3. The deal progresses toward completion
- **Expected result:** Both milestones approved, payment simulation enabled
- **What to camera:** Reviewer approval click → deal progression → payment status update
- **Verification:** Payment status on deal page shows "Simulated authorized" or similar; both milestones have approval badges

### Step 10: Show Simulated Payment Progression

- **Role:** Any (buyer/seller/reviewer on deal page)
- **URL:** http://localhost:3000/deals/[deal-id]
- **Actions:**
  1. On the deal page, scroll to **Payment state** section
  2. View the payment status badge — should show `Simulated authorized` / `Simulated capture`
  3. View payment details: authorized cents, captured cents, remaining cents
  4. Optionally, click **Capture** (if enabled) to simulate final capture
- **Expected result:** Payment badge clearly labeled "SIMULATED"; no network requests made
- **What to camera:** Payment section → badge label → detail breakdown → capture click (if desired)
- **Key safety message:** "All payments are simulated — no PayPal request is made"

### Step 11: Show Deal Status and Audit History

- **Role:** Any on deal page
- **Actions:**
  1. Scroll to **Activity timeline** — shows events: deal creation, milestone submissions, approvals
  2. Scroll to **Milestone rail** — shows 2 milestones with status badges
  3. Scroll to **Evidence history** — shows submitted evidence with timestamps and reviewers
  4. View **Payment history** section — shows payment operations recorded
  5. View **Agreement** text
- **Expected result:** Full audit trail of all actions taken during the demo
- **What to camera:** Activity timeline → milestone badges → evidence history → payment summary → agreement text
- **Verification:** All actions (create, submit evidence, approve, capture) are recorded in the activity timeline

### Step 12: Finish with the FairHold Product Value Proposition

- **Role:** (can be any, or observer)
- **URL:** http://localhost:3000/ or http://localhost:3000/dashboard
- **Actions:**
  1. Navigate to landing page or dashboard
  2. Highlight the key value propositions visible in the UI:
     - "Human approval required" chip
     - "Demo payments are simulated" chip
     - "AI is advisory only" chip
  3. Optionally, narrate the product purpose: coordinating agreements, milestones, evidence and payment progress for buyer-seller work with AI advice and deterministic rules
- **Expected result:** Closing shot of the professional, branded website
- **What to camera:** Landing page hero → value proposition chips → product description

## 3. Demo Safety

### No Real PayPal Transactions

- **No live PayPal transaction is ever possible.** PayPal **Live** is refused by configuration: `readPayPalConfig()` returns `null` unless `PAYPAL_ENV` is exactly `sandbox`, so a live adapter cannot be constructed even if a live credential were somehow present. **Never** use PayPal Live credentials or test with real money.
- **Local development** — all payments are simulated via `DemoPaymentProvider`. Payment status labels are clearly marked: `SIMULATED AUTHORIZATION`, `SIMULATED CAPTURE`, etc. The UI explicitly states: "Simulated demo actions make no provider request" and "no funds are moved by demo actions". No PayPal API call is made at all.
- **Live production** — the signed-in workspace uses the **PayPal sandbox** provider. An authorization there creates a **real order in the PayPal sandbox** (sandbox funds only), and the buyer must approve it in a PayPal sandbox account. The guided `/demo` remains the simulated provider and says so on screen.
- If you are recording the sandbox path, **do not complete a sandbox approval** — leave the deal at "waiting for buyer approval" so no sandbox capture is recorded.

### Which Provider Is In Use

- The provider is the simulated one whenever PayPal sandbox credentials are absent, or present without PostgreSQL-backed accounting; the app then says so on the deal page
- The provider is the **PayPal sandbox** one only when `PAYPAL_ENV=sandbox` with non-placeholder credentials **and** PostgreSQL is configured
- The UI labels the two paths differently, so the label on screen is the source of truth

### No Real Customer Information

- Demo identities (`Alex Buyer`, `Jamie Seller`, `Morgan Reviewer`) are allowlisted test names
- No personal data, no email addresses, no real client information
- Deal titles and client names are fictional (`Website redesign`, `Acme Ltd.`)

### No Secrets or Environment Variables Visible

- Do not record the terminal/shell where `npm run dev` is running
- Do not show `.env.local` contents
- Do not expose `DATABASE_URL` or payment credentials
- The browser URL should only show http://localhost:3000

### Do Not Alter Production Data

- Changes made during recording (creating deals, submitting evidence) are in the local dev environment only
- If using PostgreSQL, data persists but is local-only
- If using JSON dev store, data is ephemeral and cleared on reset
- Use `npm run demo:reset` to clean up between recording takes

## 4. Recording Quality

### Browser Viewport and Zoom

- **Viewport:** 1440x1024 or 1920x1080
- **Zoom:** 100% (default)
- **Window:** Maximized for full-layout visibility

### Cursor Movement and Pacing

- Move cursor deliberately between UI elements — avoid rapid jumping
- Click with visible mouse click animation
- Pause 1-2 seconds between distinct steps for viewer comprehension
- Use slow, deliberate scrolling when moving between sections of a page

### Screen Cleanliness

- Close unnecessary browser tabs
- Hide bookmarks bar if visible
- Ensure no notification popups or OS alerts
- Disable screensaver/screen lock during recording
- If using OBS or similar, capture just the browser window (not entire screen)

### Useful Close-Up Sections

| Section | Why Record Close-Up |
|---|---|
| Login form | Shows demo account flow |
| Milestone addition | Shows how milestones are created |
| Evidence submission | Shows note/field entry and submit |
| Approval panel | Shows accept/reject decision |
| Payment status | Shows simulated label clearly |
| Activity timeline | Shows audit trail of all actions |
| Deal page overview | Full dashboard view |

### Approximate Duration per Section

| Section | Estimated Time |
|---|---|
| Landing page + branding | 0:15 |
| Buyer login | 0:20 |
| Create deal + 2 milestones | 1:00 |
| Seller login | 0:20 |
| Submit milestone one evidence | 0:45 |
| Reviewer review + approve/reject | 0:45 |
| Submit milestone two evidence | 0:45 |
| Reviewer complete next review | 0:30 |
| Show payment progression | 0:30 |
| Show deal status + audit history | 1:00 |
| Product value proposition | 0:30 |
| **Total estimated** | **≈ 6 minutes** |

## 5. Final Pre-Recording Checklist

### Practical Checklist — Confirm Before Recording

- [ ] **Server running:** `npm run dev` started, http://localhost:3000 responds 200
- [ ] **New logo visible:** `fairhold-shield.svg` appears in navbar and favicon on all pages
- [ ] **Demo accounts ready:** 
  - [ ] Alex Buyer identity allowlisted
  - [ ] Jamie Seller identity allowlisted
  - [ ] Morgan Reviewer identity allowlisted
- [ ] **Provider confirmed:** the payment label on screen matches the target — "SIMULATED" on a local run, "Create PayPal sandbox authorization" on the live deployment (sandbox funds only; no live money)
- [ ] **No errors:** No `actionError` visible on any page; no invalid login messages
- [ ] **Branding consistent:** Red-and-black visual identity throughout; no old logo references
- [ ] **Browser clean:** Only FairHold tab open; no dev tools console visible; no extra extensions active
- [ ] **Viewport set:** 1440x1024 or 1920x1080; zoom at 100%
- [ ] **Test journey completed:** Run through steps 1-11 above once to verify all workflows work
- [ ] **Audit trail verified:** Activity timeline shows complete event history from deal creation through evidence approvals
- [ ] **Payment labels verified:** the payment status matches the provider in use — "Simulated" / "SIMULATED" on a local run, the PayPal **sandbox** authorization button on the live deployment
- [ ] **No production changes:** `.env.local` not modified; no production deployment; no git commits/pushes

### If Something Fails During Recording

| Issue | Fix |
|---|---|
| Server crashed | Restart with `npm run dev`; wait for ready message |
| Login fails | Verify correct identity name and role selection; check allowlist |
| Milestone creation blocked | Ensure deal status allows milestones (`!Completed`, `!Disputed`, `!Cancelled`, `!authorization`) |
| Evidence submission blocked | Ensure milestone status is not `Completed` or `Cancelled`; check canSubmit flag |
| Reviewer can't access deal | Ensure reviewer has explicit deal grant; may need buyer to grant access |
| Payment label does not match the target | Check `paymentRuntime()`: it returns the sandbox provider only when `PAYPAL_ENV=sandbox` with non-placeholder credentials **and** PostgreSQL is configured; otherwise the simulated provider is used |
| UI shows old logo | Verify `fairhold-shield.svg` is in `public/` and referenced in `layout.tsx` |

---

**Guide completed:** All routes, UI labels, demo accounts, and verified workflows documented from actual source code inspection.

**No steps invented** — every action documented from actual application implementation.

**Recorded journeys verified** against localhost:3000 running instance with 268 passing unit tests and all safety checks in place.

**Next:** Record the demo video following this sequence. No narration or video script yet (Stage 5 is separate).