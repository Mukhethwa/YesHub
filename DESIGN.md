# MASLink design rules

MASLink is a procurement tool for South African enterprises, funders and SMEs. People use it to make
decisions about money and suppliers, so it should feel like a well-made business product: confident,
colourful in the way the brand is, dense with real information, and obvious about what to do next.

## Principles

1. **Information over decoration.** Every element shows data, explains it, or lets someone act on it.
2. **The brand is the logo's colours.** Navy, MASLink blue, and the logo's green, yellow and red are part of
   the interface, not just the logo. A screen with no colour is wrong.
3. **Attention means an action.** When something needs doing, show the thing to do (a button, a link with
   the count) rather than a coloured marker that hopes to be noticed.
4. **Hierarchy comes from type, space and colour blocks**, not a card around everything.
5. **Write like a person.** Plain South African English. Name things the way buyers and SMEs do.

## Colour

All colours are tokens in `src/app/globals.css`; never write raw Tailwind colours (`green-500`).

| Token | Where |
| --- | --- |
| `brand-navy` | The sidebar, in both themes. It's the frame of the app. |
| `primary` (MASLink blue) | The summary band at the top of each dashboard, the current page in the sidebar, the main button on a screen, links, focus. |
| `brand-blue`, `brand-green`, `brand-yellow` | Kinds of opportunity (tender, RFQ, grant) as solid tiles; chart series. |
| `brand-green` | In charts, "meets the requirements". |
| `brand-yellow` | The underline under actions in the blue band (yellow text on blue isn't readable). |
| `success`, `warning`, `destructive` | Status icons, the left edge of a "needs attention" list, error text, destructive buttons. |

- Text on colour must stay readable: white on `primary` and on `brand-blue`; `brand-navy` on `brand-green` and
  `brand-yellow`.
- A tinted background (`bg-warning/10`) is for an alert only: a banner telling someone something needs action.

## Avoid: what makes a screen look generated

| Don't | Do instead |
| --- | --- |
| A grey dashboard: white cards on white, colour nowhere | The navy sidebar, a blue summary band, logo colours in tiles and charts |
| A row of identical KPI cards | One `StatStrip`: the brand band at the top, a plain strip lower down |
| Coloured dots for status, or "glowing" dots to draw attention | A small status icon with plain text; for attention, an action ("Review", "Verify 4") |
| The middle dot (·) between bits of text | Commas, separate lines, or columns |
| Pastel tinted pills for every status | `Status` (icon and text) for state, `Tag` for categories |
| Numbers coloured by how good they are | Plain numbers ("72/100"); words and icons carry the meaning |
| Progress bars and rings for every ratio | "4 of 8", a chart when comparing several things, `CheckSegments` for the one metric a page is about |
| Every section in a card with a title and a sentence restating it | A section heading, and the content under it |
| `UPPERCASE TRACKED` micro-labels | Sentence-case labels in `text-xs font-medium text-muted-foreground` |
| ✓ ✗ characters and emoji | Lucide icons, or words ("Met", "Not met") |
| Gradients, glows, blurred blobs, sparkle icons | Flat colour from the brand palette |
| Centred empty states with a title and one line | An illustration, what's empty, and what to do next |
| Hype headings ("Unlock insights") | Plain ones ("Applications", "Closing this week") |

## Never name internal systems

The interface talks about what MASLink does, not what it's built with. Buyers and SMEs see "review",
"evaluation" and "MASLink's eligibility rules", never the model, vendor or service behind them (Jev,
OpenRouter, Resend, Convex), the same way an email doesn't say which provider sent it. Model names and costs
appear only in staff-only technical detail (the admin area's evaluation trail, with `technical`).

## Building blocks

These live in `src/components/app/`. Use them instead of styling the same thing again.

- **`StatStrip`**: up to four figures in one row. `variant="brand"` is the blue band at the top of a dashboard;
  the default is a plain bordered strip. Each figure has a label, a value, and either one line of context or
  an `action` (a link such as "Verify 4") when there's something to do.
- **`Status`**: a small coloured icon (check, alert, cross, clock) and plain text, for state. Neutral states are
  muted text with no icon.
- **`Tag`**: a hairline-bordered neutral label for categories: SME, Staff, a province.
- **`KindTile`** (`src/components/enterprise/tenders.tsx`): a solid tile in the logo colour for a tender, RFQ or
  grant, with its icon. Use it wherever opportunities are listed.
- **`Section`**: a heading, an optional link on the right, and the content.
- **`BarChart`**: horizontal stacked bars for comparing a few things, coloured from the brand palette, with a
  legend of small squares.
- **`EmptyState`**: an unDraw illustration, a short title, what to do next, and the action.
- **`Score`**: a score as "72/100". **`CheckSegments`**: one segment per check, for the one metric a page is
  about.

### Attention and actions

- Something that needs doing gets a button or a link with what to do and how many: "Review", "Verify 4",
  "Upload 2 required".
- A list of things that need attention gets a `warning` left edge (`border-l-4 border-l-warning`) and a button
  on each row.
- Never rely on colour alone: an icon or words always say the same thing.

### Type

- Geist (sans) and Geist Mono. Page title `text-2xl font-semibold tracking-tight`, section heading `text-base font-semibold`,
  body `text-sm`, secondary `text-xs text-muted-foreground`.
- Numbers in tables and stats use `tabular-nums`. Right-align numbers in tables; left-align text.
- Sentence case everywhere, including buttons.

### Layout and surfaces

- Corners `--radius` (0.5rem). No shadows on surfaces; borders are hairline.
- Tables sit in one bordered container with no zebra striping, and drop secondary columns on narrower screens
  (`hidden lg:table-cell`) rather than scrolling sideways.
- Main column and a narrower aside (`xl:grid-cols-[minmax(0,1fr)_380px]`) when a page has supporting information.
- `space-y-8` between sections of a page, `space-y-3` inside one.

### Mobile

- Every screen works at 375px wide with no sideways scroll.
- The sidebar becomes a 15rem sheet; the header keeps the menu button, the current page and the theme toggle.
- Stat strips are two columns on phones. Long actions truncate to one line.
- Tables hide secondary columns; lists keep one action per row.

### Icons

- Lucide, 16px (`size-4`), `text-muted-foreground` unless they're a status or part of a button.
- Use icons to identify a type of thing or an action, and for status. Not as decoration next to headings or stats.

### Illustrations

- From [unDraw](https://undraw.co) (free to use without attribution), converted so their colours follow the
  theme (`--illustration-*` in `globals.css`) and work in dark mode. To add one, download its SVG and run it
  through `scripts/convert-undraw.mjs`.
- Only in empty states, onboarding and confirmations. At most one per screen, about `h-24` to `h-36`.

## Copy

- Say what's true and what to do: "No SMEs have applied yet. Applications appear here as they arrive."
- No exclamation marks, no hype ("powerful", "seamless", "unlock", "supercharge").
- Numbers: "R1.2m" in summaries, full amounts ("R1 236 000") where money is decided. Dates as "21 Oct 2026".
- Separate bits of information with commas or put them on separate lines. Never the middle dot (·).

## Checklist before shipping a screen

- [ ] Does the brand show: navy frame, blue band or primary action, logo colours where they mean something?
- [ ] Does everything that needs attention have an action, not just a colour?
- [ ] Any middle dots, coloured dots, tinted pills or progress bars left?
- [ ] Are internal systems (models, vendors) kept out of the copy?
- [ ] Does the empty state tell someone what to do?
- [ ] Does it work in dark mode and at 375px wide with no sideways scroll?
