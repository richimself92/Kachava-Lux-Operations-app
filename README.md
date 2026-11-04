# Kachava Lux Maintenance Command Center

A production-oriented, mobile-responsive web application for facility and maintenance operations across the **eight private luxury residences** of **Kachava Lux Private Residences & Spa**.

Designed under Google Material Design 3 and Google Workspace operational ergonomics, with full English and Spanish bilingual capability, multi-photo attachments, and role-based access control (ABAC).

---

## 1. Architectural Highlights

- **Framework**: React 19 + TypeScript (Vite bundler)
- **Styling**: Tailwind CSS v4, Google Material Design 3 tokens, Roboto typography
- **Color System**:
  - White background (`#FFFFFF`)
  - Soft gray surface (`#F3F3F1`)
  - Kachava signature brown (`#6D4627`)
  - Restrained olive accent (`#989166`)
  - High contrast charcoal typography (`#202124`)
- **Backend & Persistence**:
  - **Cloud Firestore**: Strict schema intermediate representation (`firebase-blueprint.json`)
  - **Firebase Authentication**: Individual email/password accounts; no public sign-up
  - **Firebase Cloud Storage**: Secure photo attachment storage with file type and 5 MB ceiling enforcement
  - **Firebase Hosting**: Production single-page application deployment
- **Google Antigravity Ready**: Architecture strictly isolates UI components from persistence layers through typed interfaces (`src/types/index.ts`) and modular services (`src/services/firebase.ts`).

---

## 2. Core Functional Modules

### A. Staff Request Form (Mobile-Optimized)
- Selection of residence from the **eight configured luxury villas** (Ceiba, Palma, Tortuga, Coral, Jaguar, Brisa, Colibrí, Maravilla).
- Automatically generated sequential request ID (e.g., `KLM-2026-0039`).
- Automatic user identity and server timestamp recording.
- Classification by nature/category (Plumbing, HVAC, Electrical, Pool/Spa, Carpentry, Appliances, Lighting, A/V Tech, Structural, Glass/Windows, Grounds).
- Priority tiering: Low, Normal, High, Urgent.
- Specific location within residence (e.g., *Master Bedroom Terrace*, *Plunge Pool Pump Room*).
- **Photo Attachments**:
  - Direct camera capture or photo gallery selection from mobile phones.
  - Previews before submission with individual removal/replace.
  - Maximum of 5 images per request, 5 MB limit per image, formats restricted to JPG, PNG, WebP.

### B. Maintenance Supervisor Workflow
- **Acknowledgment**:
  - Receipt acknowledgment with automatic server timestamp.
  - Immediate auto-assignment or manual reassignment.
  - Supervisor triage notes.
- **Completion Workflow**:
  - Record the technician or personnel who executed the repair.
  - Resolution notes documenting parts replaced and calibration checks.
  - Automatic calculation of total resolution time (hours).
  - **After-Repair Evidence Photos**: Supervisors can upload up to 5 completion photos verifying resolved work.
  - **Terminal State Locking**: Completed work orders are locked from further mutation, enforced by Firestore Security Rules.

### C. Dashboard & Analytics
- Key Performance Indicators: Total Work Orders, Pending Review, In Progress, Completed, Average Resolution Time (hours), and Urgent Work Order Alerts.
- Workload distribution visualizer across all eight villas.
- Maintenance category distribution charts.

### D. Advanced Multi-Parameter Filtering & UTF-8 CSV Export
- Time filtering: Daily (Today), Weekly, Monthly, Yearly, All Time.
- Filters by Residence (Villa 1 to 8), Workflow Status, Assigned Supervisor, Category, and Priority.
- Instant search by ticket ID, villa name, issue description, or staff member.
- **Export to CSV**: Generates UTF-8 encoded CSV with Byte Order Mark (`\uFEFF`) ensuring seamless character display (ñ, accents, special symbols) when opened in Microsoft Excel.

### E. Security & Role-Based Access Control (RBAC/ABAC)
- **Staff (Resort Host / Housekeeping)**:
  - Create work orders.
  - View own submitted work orders and track their resolution.
- **Maintenance Supervisor**:
  - View all property work orders.
  - Acknowledge receipts and update assigned status.
  - Mark completed, append resolution notes, and upload after-repair photos.
- **Master Administrator**:
  - Full oversight across all residences and staff.
  - Manage authorized personnel accounts and roles.
  - Configure residence metadata.

---

## 3. Security Rules & Deployment

### Firestore Security Rules (`firestore.rules`)
- Hardened in accordance with the Eight Pillars of Zero-Trust Firestore Security:
  1. Default deny catch-all `match /{document=**} { allow read, write: if false; }`.
  2. Standalone schema validation `isValidRequest()` checking allowed keys, types, and lengths.
  3. Strict server timestamp checks (`request.time`) for `createdAt`, `acknowledgedAt`, and `completedAt`.
  4. Terminal state locking preventing updates once status is `completed`.
  5. Bootstrapped admin verification and trusted role lookups.

### Storage Security Rules (`storage.rules`)
- Validates MIME type strictly (`image/jpeg`, `image/png`, `image/webp`).
- Enforces maximum file size limit of 5 MB (`request.resource.size < 5 * 1024 * 1024`).
- Path-based access bound to request IDs: `/requests/{requestId}/{photoType}/{photoId}`.

### Composite Indexes (`firestore.indexes.json`)
- Optimized for composite queries by status, villa number, supervisor, and date ordering.

---

## 4. Running Locally & Demo Mode

The application boots in **Demo Mode** by default when Firebase credentials are not yet connected:
- Uses local sample data representing realistic luxury villa maintenance tickets.
- Features a quick **Demo Role Switcher** in the top navigation bar to test the application from the perspective of:
  - **Elena Torres** — Staff (Senior Resort Host)
  - **Diego Sánchez** — Staff (Housekeeping Lead)
  - **Carlos Mendoza** — Maintenance Supervisor (Facilities Lead)
  - **Mateo Silva** — Maintenance Supervisor (MEP Systems)
  - **Juan Navarro** — Master Administrator (Estate Operations Director)

### Connecting to Live Firebase:
1. Provide Firebase configuration in `firebase-applet-config.json` or `.env` variables:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
2. Deploy Firestore Rules:
   ```bash
   firebase deploy --only firestore:rules
   ```
3. Deploy Storage Rules:
   ```bash
   firebase deploy --only storage
   ```
4. Deploy Firestore Indexes:
   ```bash
   firebase deploy --only firestore:indexes
   ```
5. Deploy to Firebase Hosting:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```
