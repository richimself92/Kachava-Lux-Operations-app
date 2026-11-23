# Spec Delta

## MODIFIED Requirements

### Requirement: Append-only audit history
Every request SHALL keep an audit history. An entry SHALL be added for:
- creation
- each status change
- assignment or reassignment
- note added
- photo added
- detail edit (location, category, priority, supervisor)

Each entry records the server time, the acting user, their role, and details. Audit entries SHALL NOT be edited or deleted by any user. They are removed only by the backend, together with their request, when an admin deletes that request.

Entries SHALL store codes or fixed phrases, and the UI SHALL render the action, role, location, category, priority and photo details in the selected language. User-typed text (notes, pending reasons, completion notes) SHALL be stored as written; the UI SHALL show it in the selected language through a labelled machine translation, with the original available (see the `comment-translation` capability), or as written when it is already in that language or cannot be translated.

#### Scenario: Audit trail after workflow
- **WHEN** a request is created, moved to reconocida, and completed
- **THEN** its detail view shows three audit entries in order, with actor names and Cancun-time timestamps

#### Scenario: Audit shown in the UI language
- **WHEN** the app is set to Spanish and a user opens the audit history of a Gym / lighting / low request
- **THEN** the creation entry reads "Creada", "Gimnasio · Iluminación · Baja", with the role in Spanish

#### Scenario: User-typed note in another language
- **WHEN** the app is set to English and the audit history contains a pending reason written in Spanish
- **THEN** the reason is shown translated into English with a machine-translation label and a control to view the original, and the stored entry is unchanged

#### Scenario: Audit tampering rejected
- **WHEN** any user attempts to modify or delete an existing audit entry
- **THEN** the backend rejects the write

### Requirement: Request deletion
Admins SHALL be able to permanently delete a request from the Work Orders table (trash icon shown on row hover), after confirming in a dialog that names the ticket and location. The dashboard's recent work orders SHALL NOT offer deletion. Deleting a request SHALL also remove its audit history, its cached comment translations and its photos, done by the backend. No other role SHALL be able to delete a request.

#### Scenario: Admin deletes a request
- **WHEN** an admin hovers a row in the Work Orders table, clicks the trash icon and confirms
- **THEN** the request disappears from all views, and its audit history, cached translations and photos are removed

#### Scenario: Delete cancelled
- **WHEN** the admin cancels the confirmation dialog
- **THEN** nothing is deleted

#### Scenario: Control hidden from other roles
- **WHEN** a supervisor or staff user views the Work Orders table
- **THEN** no delete control is shown, and a direct delete attempt is rejected by the backend
