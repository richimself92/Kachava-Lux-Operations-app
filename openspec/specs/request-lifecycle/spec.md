# request-lifecycle Specification

## Purpose
Defines the operational lifecycle of a work order from submission until it is fully addressed. It covers who may move it between states, how each transition is timestamped, and the live timer that shows response and work time on the ticket.

## Requirements

### Requirement: Lifecycle states
Every request SHALL be in exactly one state:

| State | Meaning |
|-------|---------|
| `sin_revisar` (Unreviewed / Sin revisar) | Nobody has addressed it yet |
| `pendiente` (Pending / Pendiente) | Checked by someone, but it can't be completed yet |
| `reconocida` (Acknowledged / Reconocida) | Checked and under work |
| `completada` (Completed / Completada) | Fully addressed |

New requests SHALL start in `sin_revisar`. States SHALL display with bilingual labels.

#### Scenario: New request state
- **WHEN** a staff user submits a request
- **THEN** it is saved with state `sin_revisar`

### Requirement: Allowed transitions
Only these transitions SHALL be permitted:
- `sin_revisar` to `pendiente`
- `sin_revisar` to `reconocida`
- `pendiente` to `reconocida`
- `reconocida` to `pendiente`
- `reconocida` to `completada`

`completada` is final, except that an admin MAY reopen it to `pendiente` (see Reopening a completed request). The backend SHALL reject any other transition.

#### Scenario: Blocked work returns to pendiente
- **WHEN** a supervisor moves a `reconocida` request to `pendiente` (e.g. waiting for parts)
- **THEN** the change is saved and the request can later return to `reconocida`

#### Scenario: Skipping work is rejected
- **WHEN** a client attempts to move a request from `sin_revisar` or `pendiente` directly to `completada`
- **THEN** the backend rejects the write

#### Scenario: Other changes to a completed request are rejected
- **WHEN** a client attempts to change the state of a `completada` request other than through an admin reopen
- **THEN** the backend rejects the write

### Requirement: Who may change state
Only supervisors and admins SHALL change a request's state. Staff (including the submitter) SHALL NOT change state.

#### Scenario: Staff attempts state change
- **WHEN** a staff user attempts to move their own request to `reconocida`
- **THEN** the backend rejects the write

### Requirement: Trusted transition timestamps
Every state change SHALL record:
- the server time of the change
- the acting user

The system SHALL also retain:
- first response time and actor (the first transition out of `sin_revisar`)
- completion time and actor (the transition to `completada`)

Clients SHALL NOT be able to set or alter these values.

#### Scenario: First response recorded
- **WHEN** a supervisor moves a `sin_revisar` request to `pendiente`
- **THEN** the first response time is that server time and the first responder is that supervisor

#### Scenario: Forged time rejected
- **WHEN** a client submits a state change with a timestamp other than the server time
- **THEN** the backend rejects the write

### Requirement: Assignment
A request SHALL have at most one assigned supervisor. When a supervisor moves an unassigned request into `pendiente` or `reconocida`, they SHALL become the assignee. Supervisors and admins SHALL be able to reassign a non-completed request to any active supervisor from the Work Orders table (see Detail edit), and the reassignment is recorded in the audit history.

#### Scenario: Auto-assign on first handling
- **WHEN** supervisor Randel moves an unassigned request to `reconocida`
- **THEN** Randel becomes the assigned supervisor

#### Scenario: Reassignment persists
- **WHEN** an admin reassigns a request to another supervisor
- **THEN** after refresh on another device, the new assignee is shown and an audit entry records the change

### Requirement: Default supervisor
On creation, the backend SHALL assign the configured default supervisor (Randel Can Chuc, `randel@kachavalux.com`, configurable as `DEFAULT_ASSIGNEE_EMAIL`) if that user is active with role supervisor or admin, and record it in the audit history. It SHALL never replace an existing assignee.

#### Scenario: Default supervisor on creation
- **WHEN** a staff user submits a new request and Randel is an active supervisor
- **THEN** the request shows Randel Can Chuc as assigned supervisor within a few seconds, and an audit entry records the default assignment

#### Scenario: Default supervisor unavailable
- **WHEN** the default supervisor is deactivated and a request is submitted
- **THEN** the request stays unassigned until a supervisor handles or assigns it

### Requirement: Completion record
Moving a request to `completada` SHALL require a completion note. It MAY include up to 5 after-repair photos. The completion time and the completing user SHALL be recorded.

#### Scenario: Complete with note and photo
- **WHEN** a supervisor completes a `reconocida` request with a note and one after photo
- **THEN** the request shows state `completada`, the note, the photo, the completion time, and the supervisor's name

#### Scenario: Missing completion note
- **WHEN** a supervisor tries to complete a request without a note
- **THEN** the form asks for the note and nothing is saved

### Requirement: Reopening a completed request
An admin SHALL be able to reopen a `completada` request whose work was not done correctly, moving it to `pendiente`. Reopening SHALL require a note on what is still wrong and MAY include photos, up to 5 per request across all reopens. The note SHALL be stored in the audit entry of the transition. The request's completion time, completing user and completion note SHALL be cleared, while the audit history keeps the previous completion and after-repair photos are kept. The most recent reopen note and all reopen photos SHALL be shown on the request to everyone who can view it. Supervisors and staff SHALL NOT reopen requests.

A reopened request SHALL follow the normal lifecycle and MAY be completed again. It SHALL NOT count as completed while reopened. Work and blocked time SHALL include its periods after the reopen, and total time SHALL run from submission to the latest completion.

#### Scenario: Admin reopens with note and photo
- **WHEN** an admin reopens a `completada` request with a note and one photo
- **THEN** the request shows state `pendiente`, the note and the photo, and the audit history shows both the earlier completion and the reopen

#### Scenario: Reopen without a note rejected
- **WHEN** an admin attempts to reopen a request with an empty or blank note
- **THEN** the form asks for the note, and the backend rejects the write

#### Scenario: Supervisor cannot reopen
- **WHEN** a supervisor views a `completada` request or attempts to reopen it
- **THEN** no reopen option is shown, and the backend rejects the write

#### Scenario: Reopened request completed again
- **WHEN** a reopened request moves through `reconocida` and is completed again
- **THEN** it shows the new completion, and its work time includes the work from both before and after the reopen

### Requirement: Pending reason
Moving a request to `pendiente` SHALL require the reason it cannot be completed yet. The reason field SHALL appear only after the supervisor chooses "Mark pending". The reason SHALL be stored in the audit entry of the transition, and the backend SHALL reject a move to `pendiente` without one.

#### Scenario: Reason requested on demand
- **WHEN** a supervisor clicks "Mark pending"
- **THEN** a required reason field appears, with confirm and cancel actions

#### Scenario: Missing reason rejected
- **WHEN** a client attempts to move a request to `pendiente` with an empty or blank reason
- **THEN** the form asks for the reason, and the backend rejects the write

### Requirement: Detail edit from the Work Orders table
A supervisor or admin SHALL be able to edit the location, category, priority and assigned supervisor of a request that is not `completada`, using dropdowns opened from the pencil icon shown on row hover in the Work Orders table. The editor SHALL NOT ask for the Common Areas sub-location (Hall/Parking): an existing one is kept while the category stays Common Areas and removed when the category changes, and a request moved into Common Areas has none. The changes SHALL be saved in one write with one audit entry listing each changed field as `old → new`. A new assignee SHALL be an active supervisor or admin, and an assigned request cannot be unassigned. When the priority changes, the backend SHALL recompute the request's response SLA. Staff SHALL NOT edit these fields after submission. The request detail view SHALL NOT offer reassignment or priority editing.

#### Scenario: Supervisor edits an open request
- **WHEN** a supervisor changes an open request from Gym / lighting / low / Randel to Kitchen / common areas / high / Carla
- **THEN** the table shows the new values and the audit history shows one "Details edited" entry with each change, and no sub-location is asked for

#### Scenario: Detail edit rejected
- **WHEN** staff edit these fields, anyone edits a completed request, the assignee is not an active supervisor, the sub-location is invalid or set outside Common Areas, or the audit entry is missing or mislabeled
- **THEN** the backend rejects the write

#### Scenario: Pencil hidden on completed requests
- **WHEN** a supervisor hovers a completed request in the Work Orders table
- **THEN** no pencil icon is shown

### Requirement: Work time accumulates only while reconocida
Work time SHALL be the sum of all periods the request spent in `reconocida`. The work timer SHALL start when the request enters `reconocida`, pause when it moves to `pendiente`, resume on re-entry to `reconocida`, and stop at `completada`.

#### Scenario: Paused while blocked
- **WHEN** a request is `reconocida` for 1h, then `pendiente` for 3h, then `reconocida` for 30min, then completed
- **THEN** its work time is 1h 30min

### Requirement: Live response clock on the ticket
While a request is `sin_revisar`, its detail view SHALL show a live response clock: the time elapsed since submission, updated at least every second, next to the priority's response target. The clock SHALL turn red with an overdue label once the target is exceeded. Once the request is `completada`, the view SHALL show the final response time, work time, and total time to completion as static values.

#### Scenario: Overdue unreviewed ticket
- **WHEN** a High-priority request has been `sin_revisar` for 2h 05min and its detail is opened
- **THEN** the response clock reads about 2:05:00 and is shown in red with an "overdue" label

#### Scenario: Within target
- **WHEN** a Normal-priority request has been `sin_revisar` for 1h
- **THEN** the response clock is shown in the normal (non-red) style

#### Scenario: Completed ticket shows final times
- **WHEN** a user opens a `completada` request
- **THEN** response time, work time, and total time to completion are shown and do not advance

### Requirement: Live work timer on the ticket
While a request is `reconocida`, its detail view SHALL show a running work timer (accumulated work time plus the current period), updated at least every second and never shown in red. While `pendiente`, it SHALL show the accumulated work time, not advancing, labeled as paused.

#### Scenario: Running work timer
- **WHEN** a supervisor opens a request that entered `reconocida` 10 minutes ago with no prior work time
- **THEN** the work timer shows about 0:10:00 and advances each second

#### Scenario: Paused timer
- **WHEN** a request is in `pendiente` with 45 minutes of accumulated work
- **THEN** the work timer shows 0:45:00, does not advance, and is labeled paused
