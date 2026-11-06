# maintenance-requests Specification

## Purpose
Defines how maintenance and operational work orders are submitted, identified, stored, and viewed. This includes locations, categories, priorities, photos, and audit history, so every request persists securely in the company-owned backend.

## Requirements

### Requirement: Persistent request storage
Maintenance requests SHALL be stored in the company-owned backend (`maintenanceRequests` collection, project `kachava-lux-ops`). They SHALL remain available after a page refresh, sign-out, or sign-in from another device. Production SHALL contain no mock or sample requests.

#### Scenario: Cross-device persistence
- **WHEN** a staff user submits a request on a phone, signs out, and signs in on another device
- **THEN** the request is shown with the same data and status

#### Scenario: Clean production data
- **WHEN** the production app is first opened after deployment
- **THEN** the work orders list contains only requests submitted by real users

### Requirement: Request contents
Each request SHALL record:
- location (id and type)
- category, plus sublocation when the category is Common Areas (required on the new-request form; may be absent after a supervisor edit moves a request into Common Areas)
- priority
- description (formatted text, see "Formatted description")
- submitter identity
- submission time
- status
- assigned supervisor
- supervisor notes
- before and after photo references
- last-updated time

The form SHALL NOT ask for a separate location detail.

#### Scenario: Legacy location detail
- **WHEN** a request created with the former location-detail field is opened
- **THEN** the detail is shown, and it is still validated on update

#### Scenario: Required fields missing
- **WHEN** a user submits a request without a description
- **THEN** the form shows a validation message and nothing is saved

#### Scenario: Common Areas sublocation
- **WHEN** a user selects the Common Areas category
- **THEN** they must choose a sublocation (Hall or Parking), and it is stored with the request

### Requirement: Locations
The selectable locations SHALL be:
- villas 102, 104, 106, 108, 101, 103, 105, 107
- facilities Management Office (Oficina Gerencia), Warehouse Office (Oficina Almacén), Kitchen (Cocina), Gym (Gimnasio), Storage (Almacén), Storeroom (Bodega)

Facilities SHALL NOT be presented or classified as villas. The locations page SHALL summarize the counts as "8 Villas • 6 Facilities" / "8 Villas • 6 Instalaciones", derived from the location list.

#### Scenario: Location grouping
- **WHEN** a user opens the location selector
- **THEN** villas and facilities appear in separate groups, and a request for Gym is stored with location type `facility`

#### Scenario: Unknown facility rejected
- **WHEN** a client attempts to save a request for a facility code that is not in the list
- **THEN** the backend rejects the write

### Requirement: Formatted description
The description editor SHALL offer a toolbar that stays visible while scrolling a long description, with: bold, italic, underline, strikethrough, text color, numbered list, bulleted list, indent/outdent, and link. The description SHALL be stored as sanitized HTML, limited to those formats and to http(s), mailto and tel links, at most 10,000 characters. Search SHALL match the plain text of the description.

#### Scenario: Formatting persists
- **WHEN** a user submits a description with bold text, a bulleted list and a link
- **THEN** the request detail shows the same formatting, and the link opens in a new tab

#### Scenario: Unsafe markup removed
- **WHEN** a pasted description contains a script or an event-handler attribute
- **THEN** it is removed before saving and never rendered

### Requirement: Filter work orders by day
The work orders list SHALL offer a "Date / Fecha" calendar filter, next to the period filters, that shows only requests submitted on the selected America/Cancun calendar day. Choosing a period filter clears the selected day. Future days SHALL NOT be selectable.

#### Scenario: Requests of one day
- **WHEN** a supervisor picks November 6 in the calendar
- **THEN** only requests submitted on November 6 (Cancun time) are listed

### Requirement: Request deletion
Admins SHALL be able to permanently delete a request from the Work Orders table (trash icon shown on row hover), after confirming in a dialog that names the ticket and location. The dashboard's recent work orders SHALL NOT offer deletion. Deleting a request SHALL also remove its audit history and photos, done by the backend. No other role SHALL be able to delete a request.

#### Scenario: Admin deletes a request
- **WHEN** an admin hovers a row in the Work Orders table, clicks the trash icon and confirms
- **THEN** the request disappears from all views, and its audit history and photos are removed

#### Scenario: Delete cancelled
- **WHEN** the admin cancels the confirmation dialog
- **THEN** nothing is deleted

#### Scenario: Control hidden from other roles
- **WHEN** a supervisor or staff user views the Work Orders table
- **THEN** no delete control is shown, and a direct delete attempt is rejected by the backend

### Requirement: Categories
The selectable categories SHALL be:
- Plumbing
- HVAC
- Electrical
- Pool
- Jacuzzi
- Fauna nociva (pest control)
- Carpentry
- Appliances
- Lighting
- Audio/Video & Tech
- Structural
- Glass & Windows
- Grounds
- Common Areas

Spa SHALL NOT be offered. The backend SHALL reject any other category value.

#### Scenario: New categories available
- **WHEN** a user opens the category selector
- **THEN** "Jacuzzi" and "Fauna nociva" are listed (bilingual labels) and "Spa" is not

#### Scenario: Invalid category rejected
- **WHEN** a client attempts to save a request with category `spa`
- **THEN** the backend rejects the write

### Requirement: Priorities and response targets
Each request SHALL have one priority. Each priority has a response target:

| Priority | Response target |
|----------|-----------------|
| Urgent   | Immediate, operationalized as 15 minutes |
| High     | 2 hours |
| Normal   | 4 hours |
| Low      | 24 hours |

The form SHALL show each priority's target.

#### Scenario: Target shown on selection
- **WHEN** a user selects priority High
- **THEN** the form shows a 2-hour response target

### Requirement: Automatic submission time
The submission date and time SHALL be set automatically from the server clock at the moment of submission. Users SHALL NOT enter or edit it. While the form is open, it SHALL show the current date and time in America/Cancun.

#### Scenario: Date shown on open form
- **WHEN** a user opens the new request form
- **THEN** the current date and time (America/Cancun) is displayed and no date field is editable

#### Scenario: Tampered timestamp rejected
- **WHEN** a client attempts to save a request with a submission time other than the server time
- **THEN** the backend rejects the write

### Requirement: Server-assigned ticket IDs
Each request SHALL receive a unique, human-readable ticket ID in the format `KLM-<YYYY>-<NNNN>`. The backend SHALL assign it sequentially per year. Two requests SHALL never share a ticket ID, even when submitted at the same moment.

#### Scenario: Concurrent submissions
- **WHEN** two users submit requests at the same moment
- **THEN** each request receives a distinct ticket ID

#### Scenario: ID shown after submit
- **WHEN** a request is submitted
- **THEN** the user sees the assigned ticket ID once the backend assigns it, with a placeholder shown until then

### Requirement: Request photos
A request SHALL accept up to 5 before-repair photos (from the submitter at creation) and up to 5 after-repair photos (from a supervisor or admin). Rules:
- only JPG, PNG, or WebP
- each photo at most 5 MB
- photos are stored in Cloud Storage and referenced from the request

#### Scenario: Oversized photo
- **WHEN** a user attaches a 7 MB image
- **THEN** it is rejected with a size message, and the backend would also reject the upload

#### Scenario: Sixth photo
- **WHEN** a request already has 5 before-repair photos and another is added
- **THEN** the addition is refused

#### Scenario: Wrong file type
- **WHEN** a user attaches a PDF or HEIC file
- **THEN** it is rejected with a format message

### Requirement: Photo access control
Request photos SHALL be readable only by:
- the request's submitter
- supervisors
- admins

Unauthenticated or non-approved users SHALL NOT be able to read them.

#### Scenario: Other staff cannot view photos
- **WHEN** a staff user who did not submit a request tries to fetch its photos
- **THEN** access is denied

### Requirement: Append-only audit history
Every request SHALL keep an audit history. An entry SHALL be added for:
- creation
- each status change
- assignment or reassignment
- note added
- photo added
- detail edit (location, category, priority, supervisor)

Each entry records the server time, the acting user, their role, and details. Audit entries SHALL NOT be edited or deleted by any user. They are removed only by the backend, together with their request, when an admin deletes that request.

Entries SHALL store codes or fixed phrases, and the UI SHALL render the action, role, location, category, priority and photo details in the selected language. User-typed text (notes, pending reasons, completion notes) SHALL be shown as written.

#### Scenario: Audit trail after workflow
- **WHEN** a request is created, moved to reconocida, and completed
- **THEN** its detail view shows three audit entries in order, with actor names and Cancun-time timestamps

#### Scenario: Audit shown in the UI language
- **WHEN** the app is set to Spanish and a user opens the audit history of a Gym / lighting / low request
- **THEN** the creation entry reads "Creada", "Gimnasio · Iluminación · Baja", with the role in Spanish

#### Scenario: Audit tampering rejected
- **WHEN** any user attempts to modify or delete an existing audit entry
- **THEN** the backend rejects the write

### Requirement: Staff edits limited to own unreviewed requests
A submitter SHALL be able to edit the description and add before-repair photos only while their request is `sin_revisar`. Staff SHALL NOT be able to change these fields:
- status
- assignment
- supervisor notes
- timestamps
- KPI fields

#### Scenario: Staff edits after review
- **WHEN** a staff user tries to edit their request after it moved to `pendiente`
- **THEN** the backend rejects the write

### Requirement: Display timezone
All dates and times SHALL be displayed in the America/Cancun timezone, regardless of the device's timezone.

#### Scenario: Device in another timezone
- **WHEN** a supervisor views a request from a device set to a different timezone
- **THEN** times are shown in America/Cancun
