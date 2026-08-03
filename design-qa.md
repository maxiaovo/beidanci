# Design QA

## Comparison target

- Source visual truth:
  - `/Users/maxiao/Desktop/选中单词.png` — word-learning information architecture, 699 × 837 px.
  - `/Users/maxiao/Desktop/选中写作.png` — writing-learning information architecture, 672 × 845 px.
- Browser-rendered implementation:
  - `/tmp/vocab-home-words-699x837-final.png` — 684 × 819 px image captured from a 699 × 837 CSS viewport.
  - `/tmp/vocab-home-writing-672x845-final.png` — 657 × 826 px image captured from a 672 × 845 CSS viewport.
  - `/tmp/vocab-home-words-390x844.png` — 375 × 812 px phone content capture from a 390 × 844 CSS viewport.
  - `/tmp/vocab-me-390x844.png` — 375 × 812 px phone content capture of the new My page.
  - `/tmp/vocab-daily-settings-390x844.png` — 375 × 812 px phone content capture of the daily-task dialog.
- Density normalization: browser device scale factor 1. The in-app browser capture omits its scrollbar/chrome area, producing a slightly smaller raster than the requested CSS viewport. Source and implementation were compared as same-state, near-1:1 content views; differences caused by browser chrome were excluded from findings.
- State: signed-in student, no imported word books, no completed writing assessment. Word and writing module states were each captured separately.

## Full-view comparison evidence

The source and implementation captures were opened together for both selected states. The source images are information-architecture sketches, so their bright-blue placeholder styling was not treated as the production visual system. The implementation preserves the product’s existing theme tokens, rounded cards, typography, navigation, and real learning data while matching the source structure:

1. A horizontal learning-module strip appears first and shows the selected state clearly.
2. The selected module controls the Today’s Next Step task card.
3. The daily-task settings entry is visibly placed at the upper-right of that card.
4. The content below changes from the word-book shelf to the writing-practice menu.
5. The future-module card remains visible as an affordance for horizontal expansion.

No focused crop was needed: the source sketches contain no raster assets or dense detail, and the relevant typography, controls, selected borders, task hierarchy, and content-card boundaries are legible in the full-view comparison.

## Required fidelity surfaces

- Fonts and typography: existing product font variables and optical weights are preserved. Module names, Today’s Next Step, the current task, supporting copy, stats, and CTA form a clear hierarchy without clipping at 390, 672, or 699 CSS pixels.
- Spacing and layout rhythm: the source’s module strip → task → content sequence is preserved. Cards retain consistent 2rem/3xl radii, responsive padding, and vertical rhythm. Horizontal page overflow was not present (`documentElement.scrollWidth` remained below the viewport width in all checked states); only the intended module strip can scroll horizontally.
- Colors and visual tokens: the implementation deliberately uses the existing user-selectable product theme instead of the sketch’s placeholder blue. Foreground, accent, background, borders, and text opacity remain token-based and keep sufficient visual separation.
- Image quality and asset fidelity: the sketches contain no product imagery. All UI symbols use the installed Phosphor icon library; no emoji, placeholder drawings, handcrafted SVGs, or CSS-drawn icons were introduced in the redesigned surfaces.
- Copy and content: module labels, Today’s Next Step, word progress, writing assessment, five writing-practice types, future-learning affordance, daily-plan explanation, and My-page management labels reflect the requested product behavior and existing backend data.

## Findings

- No actionable P0, P1, or P2 differences remain.
- [P3] Active-state border color follows the user’s saved theme rather than always rendering black as in the sketch. This is intentional product consistency and still provides a clearly visible selected state.
- [P3] The real app retains its compact top header and persistent bottom navigation. These are intentional product-shell elements absent from the schematic reference.

## Interaction and browser checks

- Tested word → writing module switching; task headline, stats, CTA, and lower content all updated in place.
- Tested the upper-right daily-task settings button; the accessible modal opened with its explanatory copy and save control.
- Tested the new `/me` learning center at phone size.
- Tested My → Adjust daily plan; it navigated to `/?plan=1` and opened the daily-task dialog automatically.
- Checked the browser console after the primary flow: no errors.
- Verified desktop/tablet and phone layouts at 699 × 837, 672 × 845, and 390 × 844 CSS pixels.

## Comparison history

### Iteration 1

- Earlier finding: [P2] At the 672–699 px reference widths, the desktop navigation switched on too early, crowding the header and exposing an unnecessary horizontal navigation scrollbar.
- Fix: moved desktop navigation and desktop account controls to the `lg` breakpoint; retained the compact header and bottom navigation below that breakpoint. Updated the root layout’s bottom-safe-area padding to match.
- Post-fix evidence: `/tmp/vocab-home-writing-672x845-final.png` and `/tmp/vocab-home-words-699x837-final.png` show the compact header, uncluttered learning module strip, and persistent bottom navigation with no page-level horizontal overflow.

## Implementation checklist

- [x] Horizontal learning-module selector with selected states.
- [x] Word and writing task/content switching.
- [x] Daily-task settings entry at the top-right of Today’s Next Step.
- [x] Accessible daily-task dialog and real plan persistence flow.
- [x] New My learning center with progress, task arrangements, assessments, and management links.
- [x] Responsive navigation behavior.
- [x] Lint, tests, production build, primary interactions, responsive captures, and console check.

final result: passed
