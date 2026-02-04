# UI Blueprint

This document outlines the UI structure, component breakdown, and visual direction for the app.

## Global Layout
- Two primary tabs: `Dashboard` and `HSA Education`.
- Top bar with logo, tab switcher, and user profile menu.
- Content area with generous whitespace and warm neutral background.

## Dashboard Layout
- Hero row with upload dropzone and quick actions.
- KPI row with three cards: Total, Reimbursed, Not Reimbursed.
- Chart panel with `Yearly` / `Monthly` toggle.
- Receipt table with inline actions and search.

## Chart Panel
- Stacked bar chart: reimbursed vs not reimbursed.
- `Yearly` view shows all years, no dropdown.
- `Monthly` view shows a year dropdown.
- Tooltip shows totals and breakdown.

## Receipt Table
- Columns: Title, Merchant, Category, Date, Amount, Reimbursed, Actions.
- Actions: View, Download, Delete.
- Reimbursed is a toggle with optional reimbursed date picker.
- Row click opens receipt preview modal.

## Receipt Preview Modal
- Centered modal on desktop, full screen on mobile.
- Large receipt preview with basic zoom controls.
- Right panel with editable fields and save button.

## Upload Experience
- Drag-and-drop zone for desktop.
- Browse button for mobile.
- Multi-file upload supported.
- OCR results shown in a review form per receipt.

## Search
- Single search bar that filters by title, merchant, category, notes, filename.
- Search results update table and chart totals.

## HSA Education Tab
- Clean reading layout with sections, cards, and callouts.
- Topics: HSA overview, contribution limits, eligible expenses, reimbursement steps.

## Visual Style
- Anthropic-inspired palette with warm neutrals.
- Background: soft off-white with subtle texture.
- Cards: light warm surfaces with soft shadows.
- Accent colors: muted coral, sage, dusty blue.

## Typography
- Headings: elegant serif.
- Body: modern sans.
- Generous line height for readability.

## Responsive Behavior
- Mobile uses a single-column layout.
- Chart and table stack vertically.
- Receipt preview becomes full-screen modal.

## Accessibility
- High contrast text and controls.
- Clear focus states.
- Keyboard-accessible modals and toggles.
