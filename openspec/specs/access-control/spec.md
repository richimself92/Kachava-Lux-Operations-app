# access-control Specification

## Purpose
Ensures that only approved Kachava Lux employees, signed in with their company Microsoft account, can use the maintenance app. Each person gets exactly the permissions of their assigned role, and the server enforces them.

## Requirements

### Requirement: Microsoft company sign-in
The system SHALL authenticate users only through Microsoft sign-in restricted to the Kachava Lux Microsoft 365 tenant (`kachavalux.com`). No other sign-in method (email/password, other identity providers, demo user selection) SHALL be available.

#### Scenario: Employee signs in with company account
- **WHEN** an employee chooses "Sign in with Microsoft" and authenticates with a `@kachavalux.com` work account
- **THEN** the system establishes an authenticated session for that employee

#### Scenario: Personal or external Microsoft account rejected
- **WHEN** a person attempts to sign in with a Microsoft account outside the Kachava Lux tenant
- **THEN** sign-in is refused and no maintenance data is accessible

#### Scenario: No demo or password login
- **WHEN** the production login screen is displayed
- **THEN** it offers only "Sign in with Microsoft" and no user switcher or password fields

### Requirement: Approved users allowlist
After successful Microsoft sign-in, the system SHALL grant access only if the user's email (case-insensitive) exists in the approved users list and is marked active. Users SHALL NOT be able to register or add themselves.

#### Scenario: Approved active user
- **WHEN** a signed-in user's email matches an active entry in the approved users list
- **THEN** the app loads with the role assigned in that entry

#### Scenario: Valid Microsoft account not on the list
- **WHEN** a user from the Kachava Lux tenant signs in but their email is not in the approved users list
- **THEN** the app shows a "not authorized, contact an administrator" screen with a sign-out option
- **AND** every attempt to read or write maintenance data or photos is denied by the server

#### Scenario: Deactivated user
- **WHEN** an administrator marks a user inactive
- **THEN** that user's subsequent data reads and writes are denied, even with a still-valid session

### Requirement: Server-enforced permissions
All access decisions SHALL be enforced by the backend security rules, independent of what the user interface shows. Removing or altering UI elements on the client MUST NOT grant additional access.

#### Scenario: Staff calls the backend directly
- **WHEN** a staff user crafts a direct request to change a maintenance request's status
- **THEN** the backend rejects the write

#### Scenario: No hardcoded privileged identities
- **WHEN** the security rules and application code are inspected
- **THEN** no email address or account is granted privileges outside the approved users list

### Requirement: Role permissions
The system SHALL support exactly three roles:
- **Staff**: create requests; view only their own requests.
- **Supervisor**: everything Staff can do; view all requests; change status; assign; add notes and after-repair photos.
- **Admin**: everything a Supervisor can do; manage approved users and roles; permanently delete requests.

#### Scenario: Staff visibility
- **WHEN** a staff user opens the work orders list
- **THEN** only requests they submitted are shown and retrievable

#### Scenario: Supervisor visibility
- **WHEN** a supervisor opens the work orders list
- **THEN** all maintenance requests are shown

#### Scenario: Only admins delete requests
- **WHEN** a staff user, the submitter, or a supervisor attempts to delete a request
- **THEN** the backend rejects the delete, and only an admin's delete succeeds

#### Scenario: Staff cannot manage users
- **WHEN** a staff or supervisor user attempts to create, edit, or deactivate an approved user
- **THEN** the backend rejects the write

### Requirement: Admin user management
Admins SHALL be able to add an approved user (email, display name, role, title), change a user's role, and activate or deactivate a user. These changes SHALL persist and take effect on that user's next data access without redeploying the app.

#### Scenario: Admin adds a new employee
- **WHEN** an admin adds `dina@kachavalux.com` with role Staff
- **THEN** Dina can sign in with Microsoft and submit requests

#### Scenario: Admin promotes a user
- **WHEN** an admin changes a user's role from Staff to Supervisor
- **THEN** that user can view all requests and change their status

### Requirement: Identity cannot be impersonated
Actions recorded on behalf of a user (submitter, status changes, notes, photo uploads, audit entries) SHALL be attributed to the authenticated identity. A user MUST NOT be able to record an action as another employee.

#### Scenario: Forged submitter
- **WHEN** a user creates a request whose submitter identity differs from their own authenticated identity
- **THEN** the backend rejects the write
