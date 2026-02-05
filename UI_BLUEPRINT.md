# UI Blueprint

This document outlines the UI structure, component breakdown, and visual direction for the app.

## Global Layout
- Three primary tabs: `Dashboard`, `About HSA`, and `Q&A`.
- Top bar with logo, tab switcher, and user profile menu.
- Content area with generous whitespace and warm neutral background.

## Dashboard Layout
- Upload section with drag-and-drop zone and buttons.
- KPI row with three cards: Total, Reimbursed, Not Reimbursed.
- Document table with search and export options.

## Upload Section
- Drag-and-drop zone for desktop.
- Browse files button.
- Manual entry button (+).
- Upload button.
- Clear queue button.

## KPI Cards
- Total Spend: Sum of all document amounts.
- Reimbursed: Sum of reimbursed document amounts.
- Not Reimbursed: Difference between total and reimbursed.

## Document Table
- Columns: Title, User, Category, Date, Amount, Reimbursed, Actions.
- Reimbursed is a clickable toggle button.
- Actions: View, Download, Delete.
- Search bar filters by title, user, category, notes.
- Export CSV button.
- Export Files button (downloads ZIP).
- Clear All button (with confirmation).

## Document Preview Modal
- Centered modal on desktop.
- Left panel: File preview (images or PDF).
- Right panel: Editable fields.
  - Title (text input)
  - User (dropdown with custom option)
  - Category (dropdown with custom option)
  - Date (date picker)
  - Amount (number input)
  - Notes (textarea)
  - Reimbursed (checkbox)
  - Reimbursed Date (date picker, disabled when not reimbursed)
- Close button in header.
- Save Changes button closes modal on success.

## User and Category Dropdowns
- Show all existing values from documents.
- Include session user's first name in User dropdown.
- "Custom..." option shows text input for new values.
- New custom values automatically appear in future dropdowns.

## Manual Entry Modal
- Same fields as document preview.
- No file preview section.
- Save button creates entry with `hasFile: false`.

## About HSA Tab
- Clean reading layout with sections.
- Topics: What is an HSA, Triple tax advantage, Investing, Reimburse later, Qualified expenses, Document requirements, Best practices.
- 2026 contribution limits displayed.
- Quick navigation chips.

## Q&A Tab
- Dashboard-focused content.
- Sections: Why this dashboard exists, Privacy and data storage, Common questions.
- Google Drive storage explanation.
- FAQ in card format.
- GitHub link at bottom.

## Visual Style
- Anthropic-inspired palette with warm neutrals.
- Background: soft off-white (#f8f5ef).
- Cards: white/80 with backdrop blur and soft shadows.
- Accent colors: muted coral, sage, dusty blue.

## Typography
- Headings: elegant serif font.
- Body: modern sans font.
- Generous line height for readability.
- Uppercase tracking for labels.

## Responsive Behavior
- Mobile uses a single-column layout.
- Tables scroll horizontally on small screens.
- Modal becomes full-width on mobile.

## Accessibility
- High contrast text and controls.
- Clear focus states on interactive elements.
- Keyboard-accessible modals and toggles.
- Semantic HTML structure.

## Color Reference
- Base background: #f8f5ef
- Text: #1a1a1a
- Muted text: #4b453f
- Coral accent: for warnings and destructive actions
- Sage accent: for success states
- Sky accent: for informational elements
