# Kachava Lux — DESIGN.md
Version: 1.0 | 31 October 2026
Status: Approved design direction for Staff Command Center; implementation subject to repository audit.

## Scope and precedence
This file governs the **Staff Command Center**. The Guest Experience App retains its own brand-led, editorial design direction. Material Design 3 is the reference for interaction, accessibility, states, navigation and components; this file defines Kachava-specific choices. Do not assume this is a Google-authored specification or that Google Labs DESIGN.md mandates this schema.

Priority: security and accessibility > existing working functionality > this file > design references. The approved Digital Product Library governs names, copy, photography and operational facts. If sources conflict, stop and ask the product owner.

## Design philosophy
Build a calm, efficient operations tool inspired by Google Workspace: high information clarity, low visual noise, consistent components and predictable workflows. Avoid recreating the marketing website inside the admin interface. Use a predominantly white canvas, subtle gray surfaces and restrained Kachava identity.

## Design tokens (Command Center)
Use these values as the **current app palette**, sampled from the four approved swatches supplied for this implementation. Do not silently replace them with the older print/marketing palette.

```css
:root {
  --kl-color-background: #FFFFFF;
  --kl-color-surface: #F3F3F1;
  --kl-color-primary: #6D4627;
  --kl-color-accent: #989166;
  --kl-color-text: #202124;
  --kl-color-text-secondary: #5F6368;
  --kl-color-border: #DADCE0;
  --kl-color-on-primary: #FFFFFF;
  --kl-color-focus: #1A73E8;
  --kl-radius-sm: 4px;
  --kl-radius-md: 8px;
  --kl-radius-lg: 12px;
  --kl-space-1: 4px;
  --kl-space-2: 8px;
  --kl-space-3: 12px;
  --kl-space-4: 16px;
  --kl-space-6: 24px;
  --kl-space-8: 32px;
  --kl-font-ui: "Roboto", Arial, sans-serif;
}
```

### Color roles
- White: page background and main table surfaces.
- Brown: primary actions, selected navigation, restrained brand emphasis. White text on brown.
- Soft gray: filters, secondary panels, subtle hover backgrounds. Do not turn every region into a card.
- Olive: rare secondary brand accent, never the only carrier of status or essential information.
- Near-black: primary text; medium gray: secondary text; hairline gray: separators.
- Semantic success, warning, error and info colors: use accessible existing component-library tokens; define and test them in code before deployment. Never substitute brown/olive for an error state.
- Focus outline must remain clearly visible; blue above is an implementation proposal for focus visibility, not a Kachava brand color.

## Typography
**Staff Command Center:** Roboto (Google's open-source UI typeface) with Arial/system sans-serif fallback. Use installed/authorized font files or a reputable font delivery method consistent with privacy and performance requirements. Do not assume Google Sans is freely licensed for third-party use. Avoid Libre Baskerville in operational tables and controls.

Recommended starting hierarchy (adjust to existing component framework):
- Page title: 24px / 32px, weight 500
- Section heading: 18px / 26px, weight 500
- Body and table cells: 14px / 20px, weight 400
- Field labels and navigation: 14px / 20px, weight 500
- Supporting text: 12px / 16px, weight 400, only where legible
- Primary controls: minimum 14px text; target sizes and spacing should meet accessibility standards.

**Guest Experience App:** separate design direction using approved Libre Baskerville and Libre Franklin. Do not apply admin typography wholesale to guest-facing screens.

## Navigation
Use this exact information architecture; no numeric prefixes:

- Dashboard
- GUEST OPERATIONS: Reservations, Guests, Residences
- HOSPITALITY: Services, Experiences, Dining, Transportation, Wellness
- OPERATIONS: Tasks, Notifications
- TEAM: Resort Hosts, Staff

Use a persistent desktop sidebar and an accessible compact/mobile navigation pattern. Selected item uses a restrained brown treatment. Section headings are labels, not clickable duplicate destinations. Badges only for actionable counts.

## Dashboard
Place operational overview first, then activity and exceptions:
1. Current local property date and selected reporting period.
2. Arrivals, Departures, In House, Villa Nights, Reservations, Cancellations, Overbookings.
3. Occupancy %, Available Units, Reserved Units, Out of Service and Blocked Dates.
4. Today's guest activity table: Guest, Residence, Stay, Status, Assigned Resort Host, Notes.
5. Open Requests and Tasks, then Notifications and urgent Alerts.

Do not fabricate metrics. Use existing verified data sources; if Cloudbeds integration is unavailable, label metrics unavailable rather than simulating live production values. Clearly define metric formulas and date boundaries with Juan.

## Module responsibilities
**Reservations:** search, filter, arrival/departure, reservation state, assigned Resort Host; source of truth must be confirmed before editing.
**Guests:** guest profile, communication, language, approved preferences, linked stays and requests; protect sensitive information.
**Residences:** eight-unit inventory, category, occupancy, housekeeping status, out-of-service/blocked periods.
**Services:** shared catalog, approval/visibility, bilingual copy, inclusion/pricing and request rules.
**Experiences:** guest-facing curated experiences and operational bookings.
**Dining:** breakfast and special dining requests, scheduling and dietary needs with appropriate access controls.
**Transportation:** airport/local transfers, timing, flight details where needed, assigned driver and status.
**Wellness:** treatment requests, practitioners, availability and confirmation.
**Tasks:** owner, residence, priority, due time, state, completion evidence.
**Notifications:** event-driven alerts with links to originating records; sound reserved for genuinely urgent guest actions.
**Resort Hosts:** assignment, availability, workload, linked guest conversations.
**Staff:** role and access administration, active status, assigned operational tasks.

Services/Experiences/Dining/Transportation/Wellness should share a coherent service/request data model rather than duplicate unrelated catalogs.

## Interaction and components
- Prefer existing React/UI infrastructure and reusable components. Do not install a new Material UI library without an impact estimate.
- Use consistent top app bar, sidebar, tables, search, filters, dialogs, forms, tabs, buttons, menus and status chips.
- Favor tables for dense operational information; reserve cards for a small number of KPI summaries.
- Keep corner radii restrained (4–12px); use borders over large shadows.
- Provide loading, empty, success, error and disabled states; never show fake success.
- Confirm destructive actions. Support keyboard focus and navigation.
- Meet WCAG 2.2 AA where applicable; test contrast, focus visibility, keyboard operation, zoom and mobile responsiveness.
- Use Lucide icons or the project's existing icon set consistently; do not mix unrelated icon families. Icons must have accessible labels when used without text.

## Content and terminology
- Use **Resort Host**, not **Concierge**, throughout guest- and staff-facing product UI.
- Use approved EN/ES strings; do not machine-invent Spanish translations or copy.
- Do not invent residence names, amenities, guest profiles, providers, service inclusions, prices, lead times or booking guarantees.
- Photography and logos must come from the approved Digital Product Library with confirmed usage rights.
- Display only production-approved catalog items to guests.

## Roles and security
Preserve role-based access: Master Admin, Resort Host and Housekeeping for current scope. Resort Host assignment may use round-robin among available hosts, subject to backend design and admin override. This is a **functional requirement**, not a styling change. Do not expose all guest data to every staff user.

## Engineering workflow for Juan
1. Audit frontend stack, current tokens/components, existing data sources and deployment architecture.
2. Create a dedicated branch (suggested `feature/kachava-command-center-design`) and add this file at repository root.
3. Map these tokens to the existing styling solution; do not create competing token systems.
4. Implement a narrow pilot: sidebar and Dashboard visual structure using existing functionality.
5. Share desktop/mobile screenshots and a concise list of changed files for approval.
6. After approval, extend reusable components to other modules. Estimate backend-dependent work separately.

### Explicit non-goals
Do not migrate Firebase/GCP, alter IAM/security rules, change API contracts, rewrite reservation logic, change database schema, or deploy to production as part of a design-only pull request. These require separate scoped approval.

## Acceptance checklist
- [ ] Exact navigation hierarchy and no numeric prefixes
- [ ] Roboto in admin UI, appropriate fallback
- [ ] Four core colors applied consistently by role
- [ ] White canvas, restrained borders/cards, readable tables
- [ ] Resort Host terminology in UI
- [ ] EN/ES strings preserve approved wording
- [ ] Keyboard, contrast, mobile and empty/error states reviewed
- [ ] Existing business logic and production configuration unchanged
- [ ] Before/after screenshots approved by Kachava

## References
- Material Design 3: https://m3.material.io/
- Google Labs design.md: https://github.com/google-labs-code/design.md
- Kachava Lux Digital Product Library: company-controlled Google Drive folder (link to be added by owner)
