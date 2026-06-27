# PRD — Build a single-page HLD site (standalone task spec)

> **This is a self-contained task specification.** You are an autonomous coding agent running inside a
> sealed container with no internet access and no access to any external skill, tool catalog, or design
> system. Everything you need is in this file or in the named seed file on disk. Do not look anything up.
> Do not install anything. Do not start a server. Build static files only.

---

## 1. Objective

Build a **single-page static website** that presents a **High-Level Design (HLD) summary** of the key
phases of the source document named in §2, rendered in the visual identity specified in §5.

HLD means: **top-level concepts only.** Five to seven phases, each one card, each a heading plus a one-
or two-sentence summary. No deep detail, no exhaustive coverage. The craft of the build is the point,
not the completeness of the content.

## 2. The only content source

- **`/tmp/work/seed/the-new-sdlc-with-vibe-coding.md`** — read it, and build the summary strictly from it.
- The document presents its ideas in **prose and figure concepts, not as a tidy list of headings.** Read
  it through and **identify the 5 to 7 principal phases / steps yourself**, then name them using the
  document's own language where you can.
- **Do not invent content beyond the source.** If something is not in the document, it does not go in.

## 3. Output — where to write

- Write all files to **`/tmp/work/output/`**.
- Entry point: **`/tmp/work/output/index.html`**.
- Allowed: `index.html`, plus optionally `style.css` and `script.js`. Inline CSS is also fine.
- The page must open by double-clicking `index.html` — **no build step, no bundler, no server, no
  network at view time** (except the one font CDN link in §5, which degrades gracefully if offline).

## 4. Technology constraints (hard)

- **Static HTML, CSS, and (optional) vanilla JS only.** No framework, no npm install, no package
  manager, no build tool, no images, no screenshots, no headless browser.
- Self-contained: a person opens `index.html` in a browser and sees the finished page.

## 5. Visual identity — the OAC brand-ID (complete, inline, authoritative)

Use these exact values. Specify colors as exact hex. Background is always `#1b1b1f`, strict, **no navy
and no blue cast.**

### 5.1 Palette
| Role | Hex |
|---|---|
| Background | `#1b1b1f` |
| Card / panel | `#232328` |
| Elevated panel | `#2b2b31` |
| Border — soft | `#3c3c43` |
| Border — mid | `#4a4a52` |
| Border — strong | `#8e8e93` |
| Text — primary (titles) | `#e3e3e8` |
| Text — body | `#c4c4cc` |
| Text — secondary (labels) | `#9e9ea6` |
| Text — dim (captions) | `#6b6b73` |

**Accents** — assign one per phase card, in this order (cycle if more than seven):
`#fabb5c` amber · `#81c995` green · `#8ab4f8` blue · `#aecbfa` light-blue · `#d7aefb` purple ·
`#b4b7e8` lavender · `#f28b82` coral. No teal. Positive signals use green `#81c995`.

### 5.2 Typography
- **Inter** — titles, headings, body prose, card text (the content itself).
- **JetBrains Mono** — labels, section numbers, tags, ALL CAPS, the source/meta line (things that
  *annotate* the content). The brand voice leans on mono labels around fewer Inter prose blocks.
- **Font stacks** (declare these exactly; load Inter + JetBrains Mono from Google Fonts via one `<link>`,
  and they fall back cleanly if offline):
  - `Inter, "Segoe UI", Calibri, sans-serif`
  - `"JetBrains Mono", "Cascadia Code", Consolas, monospace`
- **Weights are binary: only `400` and `600`. No 300, 500, or 700.** Express hierarchy with size,
  color, and case, never with a third weight or italics-for-emphasis.
- **Case:** Title Case for the page title and card headings; sentence case for body; **ALL CAPS only in
  JetBrains Mono** (labels, section numbers), with letter-spacing `0.14em`. Never ALL CAPS in Inter.
- **Line-height:** Inter body `1.8`, Inter titles `1.2`, card body `1.625`, mono `1.65`.
- **Web type scale (guide, keep the hierarchy):** page title ~34px/600 Inter · card heading ~18px/600
  Inter · body ~15-16px/400 Inter · mono labels/section numbers ~12-13px/600 mono ALL CAPS.

### 5.3 Structure
- **No shadows anywhere.** Depth comes from the background levels, the solid borders, and the accent
  stripe. Never use `box-shadow` / drop shadow.
- **Radius:** cards `8px`; the main container `12px`; small tags/chips `3-4px`.
- **Accent-stripe card (the signature):** each phase is a card with `background:#232328`, a `4px` solid
  **left border in that card's accent color**, generous padding (`24-28px`), `8px` radius, a soft border
  (`#3c3c43`) on the other edges.
- **Section number / label:** a small JetBrains Mono ALL CAPS label (e.g. `PHASE 01`) in the card's
  accent color, above the card heading.

## 6. Layout

- A centered column, max width ~`900px`, comfortable margins, mobile-first.
- **Header:** the page title (Inter 600), a one-line subtitle (Inter 400, `#c4c4cc`), and a mono meta
  line crediting the source as the Google "The New SDLC with Vibe Coding" guide.
- **Body:** the 5-7 accent-stripe phase cards, in document order, single column (a two-column grid above
  ~720px viewport is acceptable but not required).
- **Footer:** a thin top border (`#3c3c43`) and a mono dim line.
- **Responsive:** no horizontal scroll at 360px width.

## 7. Acceptance criteria (a separate judge agent grades each pass/fail)

- **AC1 — opens standalone:** `index.html` renders with no build, no server, valid HTML.
- **AC2 — content fidelity:** 5-7 phases (synthesized from the source's prose and figures, not copied
  from headings) as accent-stripe cards, each with a card heading + 1-2 sentence HLD summary, all
  grounded in the source, none invented.
- **AC3 — palette:** background `#1b1b1f` (no navy), card `#232328`, the text and accent hexes from §5.1,
  one accent per card in order. No off-palette colors.
- **AC4 — typography:** Inter + JetBrains Mono via the §5.2 stacks; **only weights 400 and 600**;
  ALL CAPS only in mono; correct mono/Inter split (labels mono, prose Inter).
- **AC5 — structure & responsive:** accent-stripe cards present, **no shadows**, correct radii, no
  horizontal scroll at 360px.

## 8. Process

1. Read the source (§2) and choose the 5-7 phases.
2. Build the site into `/tmp/work/output/` per §3-§6.
3. **Dispatch a judge via the Agent tool** to grade the result against every AC in §7. The judge returns
   pass/fail per criterion plus one overall verdict, and reads only the built files and these criteria.
4. If any criterion fails, do **one** revision pass to fix it, then stop. Do not loop indefinitely.
5. End with a short plain summary of what you built and which ACs passed.

## 9. Out of scope (do not do these — they are how this task fails)

Frameworks · npm / package installs · bundlers · dev servers · live web search · images or screenshots ·
headless browsers · multi-page sites · animation beyond simple CSS · any third weight or italic emphasis ·
inventing content not in the source.
