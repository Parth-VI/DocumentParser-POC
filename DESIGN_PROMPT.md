# Design Prompt — "Schema Studio" (Document AI) beautiful UI

> Paste everything below into Claude (claude.ai / Claude Design) to generate the visual mockup.
> The goal: a **stunning, trustworthy, non-technical-friendly** redesign of a document-data-extraction app.
> Copy from the line `---PROMPT START---` to `---PROMPT END---`.

---PROMPT START---

You are a world-class product designer and front-end engineer. Design a **beautiful, modern, high-fidelity web app UI** and deliver it as a single self-contained, interactive HTML file (inline CSS + minimal vanilla JS, Google Fonts allowed, no build step). It must look like a real, polished SaaS product — not a wireframe.

## 1. Who this is for (the golden rule)

The person looking at this screen is a **non-technical business client**. They do **not** know what JSON, schemas, fields, enums, tenants, OCR, or tokens are — and they should never have to. Every label, every word, and every screen must feel like a friendly business tool, not a developer console. If a normal office worker can't understand a word at a glance, rewrite it in plain English. **Hide all technical detail behind a small optional "Advanced" area.**

## 2. What the product actually does (in plain words)

It's an app that **reads documents for you and pulls out the important information automatically.** A user:
1. Uploads a document (an invoice, a repair order, a spreadsheet, a scanned PDF).
2. Tells the app what pieces of information they care about (e.g. "Vendor name", "Invoice date", "Total amount", "Line items").
3. Clicks one button — the AI reads the whole document and fills in those pieces.
4. Sees the results laid out cleanly, can check each value against the original document, and downloads or sends the results.

There is also a second area — an **Inbox** — where documents that arrive by email are read automatically and results are delivered onward.

## 3. Product name & voice

- Name it **"Schema Studio"** (or show it as **"Document Studio"** — pick the friendlier one and use it consistently).
- Voice: calm, confident, human. Short sentences. Encouraging empty states. No jargon.

## 4. Plain-language translation (MANDATORY — never show the left column)

| Never say this (technical) | Say this instead (friendly) |
|---|---|
| Schema / Field Schema | **What to capture** / "Information to pull out" |
| Field | **A piece of information** (e.g. "Total amount") |
| Type: text/number/enum/object/list | **Text · Number · Date · Money · Yes/No · List · Group** |
| Enum values | **"Choose from a set list"** |
| Tenant | **Workspace** or **Client** |
| Extract | **Read document** / **Get the details** |
| JSON / payload | **Results** (JSON only inside an "Advanced / Developer" toggle) |
| OCR engine, tokens, cost, model | Hidden in a small **"Details"** expander, dimmed |
| Relevance check | **"Double-check it's a real document"** |
| Source locations / bbox | **"Show me where this came from"** (highlight on the page) |
| Webhook / HMAC / delivery sink | **"Where to send the results"** / **"Connection"** |

## 5. Visual design system (be decisive, commit to it)

**Overall aesthetic:** premium, intelligent, calm. Think a refined fintech dashboard crossed with a document reader — lots of white space, soft depth, gentle motion, one confident brand color. Trustworthy, not playful-childish, not cold-corporate.

**Color** (define as CSS variables; support light AND dark mode):
- Brand / primary: deep indigo-violet — `#5A46E0` (this is the existing brand color, keep the identity). Use it decisively for primary buttons, the active step, key highlights.
- One sharp accent for "success / found it": emerald `#10B981`.
- Warning / needs-attention: amber `#F59E0B`.
- Backgrounds: NOT flat white. Use a very soft layered gradient / faint grain / subtle indigo glow behind the header and hero so the page has atmosphere and depth. Cards sit on near-white (`#FBFBFE`) in light mode; deep slate-indigo (`#0F0F1A` range) in dark mode.
- Never use purple→blue gradients on plain white (the AI-slop cliché). Keep gradients subtle and tinted, not loud.

**Typography** (load from Google Fonts, avoid generic fonts):
- Headings / display: **"Bricolage Grotesque"** (distinctive, modern, confident).
- Body / UI: **"Geist"** (extremely readable — this matters, it's a data tool). If Geist is unavailable use "Instrument Sans".
- Numbers & any code/JSON: **"JetBrains Mono"** (tabular numbers for money and dates).
- Use real weight contrast (e.g. 300/400 body vs 700/800 headings) and generous size jumps for hierarchy. Big, calm headings; comfortable body size (≥15px).

**Shape & depth:** rounded corners (12–16px on cards, pill buttons/chips), soft multi-layer shadows (not harsh), 1px hairline borders in a tinted neutral. Consistent 4/8px spacing scale, roomy padding.

**Motion:** one well-orchestrated page load with a gentle staggered reveal of sections (use `animation-delay`). Smooth hover lifts on cards/buttons. A calm, believable "reading your document…" loading state (animated scanning line over the document, friendly copy, live seconds counter). Keep it tasteful — no bouncing everywhere.

**Icons:** clean line icons (Lucide style).

## 6. Screens to design (make all of them, fully populated with realistic sample data)

Use a realistic example throughout: a **vendor service invoice** from "Northwind Auto Services" — invoice #INV-20482, dated 12 Mar 2025, subtotal $1,240.00, tax $99.20, total $1,339.20, with 3 line items.

### A. Top bar (all screens)
Brand mark + name on the left; two nav items in the middle: **"Documents"** and **"Inbox"**; light/dark toggle + a friendly avatar on the right. Sticky, glassy/blurred, subtle bottom border.

### B. Main screen — a clean 3-step flow (the hero of the app)
Present the flow as an obvious **3-step journey** (a horizontal stepper at the top: **1 Upload · 2 Choose what to capture · 3 Get results**). Layout as two columns on desktop, stacked on mobile.

- **Step 1 — Upload a document:** a large, inviting drag-and-drop zone with an illustration/icon, "Drag a document here, or browse", supported types shown as friendly chips (PDF, Image, Spreadsheet). After upload: show a document thumbnail/preview panel with page navigation.
- **Step 2 — Choose what to capture:** the MOST important reframe. Instead of a "field schema editor", show a friendly list of **"Information to pull out"** cards. Each card = one piece of info with: a plain name (e.g. "Total amount"), a **type picker shown as friendly pills** (Text · Number · Date · Money · Yes/No · List · Group — each with a small icon), an optional "required" star, and a short hint line. Add via a big **"+ Add information"** button. Show a couple of nested examples (a **"Group"** = "Vendor details" containing Name/Address; a **"List"** = "Line items" containing Description/Qty/Price) rendered as gently indented, clearly-nested cards — NOT raw JSON. Include a subtle **"Start from a template"** option (Invoice, Purchase order, Inspection).
- A small settings strip (collapsed by default): **Workspace** picker, and an "Advanced options" expander hiding model choice / document-type hint / the double-check toggle.
- **Primary action:** a big, confident sticky button: **"Read this document"** with a sparkle icon. Below it, one plain line confirming what will happen.

### C. Results view (Step 3) — make this delightful
This is where a non-technical user must feel "wow, it just worked." Show:
- A friendly success banner: "We found 12 pieces of information ✓" with a subtle confetti-free celebration (just a checkmark animation).
- Results as a **clean labeled card / definition list**, NOT JSON: each item shows the friendly label, the extracted value (money right-aligned & mono), and a small **"Show on document"** link that highlights the exact spot on the page preview (a colored highlight box appears on the doc). Nested groups shown as sub-cards; lists (line items) shown as a **simple, beautiful table**.
- A quiet confidence cue per value (e.g. a tiny green dot = "high confidence", amber = "please double-check").
- Actions: **"Download results"** (primary) and **"Copy"**; and a tiny, dimmed **"View as JSON / Developer"** toggle tucked in a corner for the rare technical user. All the tokens/cost/OCR metrics live inside a collapsed **"Details"** expander, small and grey.
- Design a great **loading state** (the scanning animation described above) and a great **empty state** (before any upload).

### D. Inbox screen
A calm list/inbox of documents that arrived by email and were auto-read: sender, subject, document type, a status pill (**Read ✓ / Reading… / Needs attention**), time, and a thumbnail. Clicking one opens the same beautiful Results view. Include a friendly setup card: **"Connect a mailbox"** and **"Where to send results"** — plain-language, no mention of webhooks/HMAC on the surface (put technical setup behind an "Advanced" expander).

### E. Small but important states
- Friendly error card when a file isn't really a document: "Hmm, this doesn't look like a document we can read" with a gentle retry.
- Empty states everywhere with a light illustration + one encouraging sentence.

## 7. Hard constraints (do NOT do these)

- Do NOT show raw JSON, curly braces, or code anywhere on the main surfaces (only inside the opt-in Developer toggle).
- Do NOT use the words in the left column of the table in section 4.
- Do NOT use Inter, Roboto, Arial, Open Sans, or default system fonts.
- Do NOT use a loud purple-to-blue gradient on white.
- Do NOT make it look like a wireframe or a generic Bootstrap/Material dashboard. It must feel custom-designed.
- Do NOT overcrowd — favor white space and clear hierarchy. One primary action per screen.
- Keep it fully **responsive** and support **light + dark mode** with a working toggle.

## 8. Deliverable

One polished, self-contained HTML file that opens in a browser and lets me click through: Upload → Choose what to capture → Read → Results, plus the Inbox screen (a simple nav switch or tab is fine). Populate every screen with the realistic sample invoice data so the client sees a believable, finished product. State your font and color choices in a short comment at the top, then build.

<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs — the "AI slop" aesthetic. Avoid this: make a creative, distinctive, genuinely designed frontend that surprises and delights, while staying calm and trustworthy for a business audience. Typography: use the specified distinctive fonts with real weight/size contrast. Color & theme: commit to the indigo-violet brand with one sharp accent; use CSS variables; dominant color with sharp accents beats a timid even palette. Motion: one well-orchestrated page-load with staggered reveals, plus tasteful hover and a believable document-scanning loader. Backgrounds: create atmosphere and depth with soft layered tinted gradients — never flat white. Avoid overused fonts, cliché purple-on-white gradients, predictable dashboard layouts, and cookie-cutter components. Make unexpected, context-specific choices.
</frontend_aesthetics>

---PROMPT END---

---

## Notes for me (Amit / not part of the prompt)
- If Claude returns a React artifact instead of HTML, that's fine — we can adapt it.
- If it's too much for one file, ask Claude to split into: (1) main Upload→Capture→Results flow, (2) Inbox. Same design system.
- After the client approves the look, I'll implement it in the real app (TanStack + Tailwind v4 + shadcn) matching this design.
