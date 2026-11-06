# operational-kpis Specification

## Purpose
Measures how long operational and maintenance tasks take to be fully addressed. Supervisors and admins can see response performance against priority targets, actual work effort, and end-to-end completion time across locations, categories, and people.

## Requirements

### Requirement: KPI definitions
For each request the system SHALL compute these metrics from trusted server timestamps:

| Metric | Definition |
|--------|------------|
| **Response time** | Submission until first transition out of `sin_revisar` |
| **Response SLA met** | Response time ≤ priority target (Urgent 15min, High 2h, Normal 4h, Low 24h) |
| **Work time** | Total time spent in `reconocida` |
| **Time to fully addressed** | Submission until `completada` |
| **Blocked time** | Total time spent in `pendiente` |

#### Scenario: Metrics after completion
- **WHEN** a Normal request is submitted at 09:00, moved to `reconocida` at 10:00, to `pendiente` at 11:00, to `reconocida` at 13:00, and completed at 13:30
- **THEN** response time is 1h (SLA met), work time 1h 30min, blocked time 2h, and time to fully addressed 4h 30min

### Requirement: Durations computed only by the backend
KPI durations SHALL be calculated by trusted backend logic from server timestamps. Clients SHALL NOT be able to write or alter KPI values. A recalculation of the same state change SHALL NOT double-count time.

#### Scenario: Client writes a KPI field
- **WHEN** any client, including an admin, attempts to set a request's work time or response time directly
- **THEN** the backend rejects the write

#### Scenario: Duplicate processing
- **WHEN** the backend processes the same state change event twice
- **THEN** the stored work and blocked times are unchanged by the second processing

### Requirement: Open-request SLA status
For requests still in `sin_revisar`, the system SHALL report whether the response target has already been exceeded at the current time. This SHALL be counted as "overdue unreviewed".

#### Scenario: Overdue count on dashboard
- **WHEN** two Urgent requests have been `sin_revisar` for 20 minutes
- **THEN** the dashboard's overdue-unreviewed count includes both

### Requirement: KPI dashboard
The dashboard SHALL show, from persisted data:
- counts per state (`sin_revisar`, `pendiente`, `reconocida`, `completada`)
- urgent open requests
- overdue-unreviewed count
- average and median response time
- response SLA compliance %
- average work time
- average time to fully addressed

Supervisors and admins see all requests; staff see figures only for their own requests.

#### Scenario: Dashboard reflects saved records
- **WHEN** a supervisor completes a request
- **THEN** the dashboard counts and averages update to include it without a page reload

#### Scenario: No data in period
- **WHEN** the selected period has no completed requests
- **THEN** averages show "—" rather than 0

### Requirement: KPI breakdowns
The KPI figures SHALL be viewable broken down by priority, category, location, and assigned supervisor. "Responsible employee" figures SHALL use the user who completed the request.

#### Scenario: Breakdown by category
- **WHEN** a supervisor views KPIs by category
- **THEN** each category with requests in the period shows its count, response SLA compliance, average work time, and average time to fully addressed

### Requirement: Period filters
The dashboard and work order list SHALL support these periods:
- all time
- daily (today)
- weekly (last 7 days)
- monthly (current calendar month)
- yearly (current calendar year)

Day, month, and year boundaries SHALL be computed in America/Cancun. Requests SHALL be assigned to a period by submission time.

#### Scenario: Day boundary in Cancun time
- **WHEN** a request was submitted at 23:30 America/Cancun yesterday and a viewer's device is set to UTC
- **THEN** the daily filter does not include that request

### Requirement: Work orders by location
The dashboard SHALL show one card per villa and facility with that location's all-time count of requests in each state: reconocida, completada, pendiente and sin revisar. Selecting a card SHALL open the work orders list filtered to that location.

#### Scenario: Counts per state
- **WHEN** Villa 102 has two unreviewed requests and one completed request
- **THEN** its card shows Sin revisar 2, Completada 1, Reconocida 0 and Pendiente 0
