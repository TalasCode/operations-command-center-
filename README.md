# Operations Command Center

Internal operations dashboard implements a shared workflow engine, stream-specific adapters, persisted state with Prisma + SQLite, a review queue, audit trail, simulator, and the required test coverage.

## Stack

- Next.js App Router + TypeScript
- Prisma + SQLite
- Mock external services only
- Vitest for workflow tests

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Create the local environment file:

On macOS / Linux:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Initialize the SQLite database:

```bash
npm run db:push
```

`db:push` initializes the SQLite schema from the checked-in SQL at `prisma/init.sql`. Prisma Client remains the runtime data-access layer used by the app and tests.

4. Start the app:

```bash
npm run dev
```

5. Open `http://localhost:3000`

## Run Tests

```bash
npm test
```

The test command uses a separate SQLite file at `prisma/test.db` and runs the required workflow scenarios.

## App Structure

```text
app/
  page.tsx
  events/page.tsx
  events/[id]/page.tsx
  simulator/page.tsx
  review/page.tsx
  api/events/route.ts
  api/events/[id]/route.ts
  api/review/[id]/route.ts

workflow/
  workflowEngine.ts
  adapterRegistry.ts
  types.ts

adapters/
  financeAdapter.ts
  campaignAdapter.ts
  guestAdapter.ts

services/
  mockFinanceService.ts
  mockCampaignService.ts
  mockGuestService.ts

components/
  Navbar.tsx
  StatusBadge.tsx
  EventTable.tsx
  AuditTimeline.tsx
  ActionList.tsx
  JsonViewer.tsx

lib/
  prisma.ts
  auditLogger.ts
  sampleEvents.ts

prisma/
  schema.prisma

tests/
  workflowEngine.test.ts
```

## Architecture

```text
Event Simulator
      ↓
API Routes
      ↓
Workflow Engine
      ↓
Adapter Registry
      ↓
FinanceAdapter | CampaignAdapter | GuestAdapter
      ↓
Mock Services
      ↓
SQLite + Prisma
      ↓
Audit Logs + Review Queue
```

### Workflow engine

`workflow/workflowEngine.ts` is the orchestrator:

- Validates the common event envelope.
- Detects the stream from `source`.
- Enforces idempotency through unique `source_event_id`.
- Selects the correct adapter through `adapterRegistry`.
- Persists events, generated actions, review queue items, and audit logs.
- Executes mock external actions and records per-action success or failure.
- Routes invalid, ambiguous, unsupported, unknown, and failed events into the review queue.

### Adapters

Each adapter owns only stream-specific business logic:

- `financeAdapter` validates overdue invoice payloads and creates reminder/follow-up actions with priority rules.
- `campaignAdapter` validates client briefs and creates one task per channel.
- `guestAdapter` validates reservation change requests, creates the reservation action, and creates the guest-facing confirmation message.

This keeps the core engine reusable and makes a fourth stream straightforward to add.

### Persistence

SQLite persists the minimum required entities from the PDF:

- `events`
- `actions`
- `review_queue_items`
- `audit_logs`

All dashboard numbers, inbox rows, detail pages, and review queue items come from stored data. Refreshing the UI preserves state because the source of truth is the SQLite database.

### Review flow

Events enter review when:

- required fields are missing
- the source is unknown
- the event type is unsupported
- the payload is ambiguous
- a mock external service fails
- the system cannot safely automate the request

The review page lets an operator:

- inspect the original event
- correct the original payload JSON and safely reprocess the event
- inspect current generated actions
- edit action JSON before approval
- add resolution notes
- approve actions
- reject the event
- manually resolve the item

The Human Review Queue supports a human-in-the-loop correction flow: operators can fix missing or ambiguous payload fields, save the corrected payload, and re-run the shared workflow engine against the stored event. Reprocessing supersedes earlier actions, writes audit logs for each step, and either completes the event or keeps it in review with an updated reason.

## Supported Workflows

### FinanceOps

- Event type: `invoice.overdue`
- Generates:
  - `send_payment_reminder`
  - `create_follow_up_task`
- Priority is `high` when `days_overdue > 14`, otherwise `normal`

### CampaignOps

- Event type: `client_brief.received`
- Generates one `create_campaign_task` per channel
- Includes task title, channel, and deadline on each action

### GuestOps

- Event type: `reservation.change_requested`
- Requires `reservation_id`, `guest_name`, and `requested_check_in`
- Generates:
  - `request_reservation_change`
  - `generate_guest_message`

## Simulator

The simulator includes all key manual test cases from the PDF:

- valid FinanceOps event
- valid CampaignOps event
- valid GuestOps event
- ambiguous event
- missing required field event
- simulated failure event
- duplicate event

It also supports editing raw JSON and toggling `simulate_failure`.

## Required Tests Covered

The suite includes the six required tests from the exercise PDF:

- FinanceOps event succeeds
- CampaignOps event succeeds
- GuestOps event succeeds
- Duplicate event does not create duplicate actions
- Missing required field goes to review
- Simulated external failure is handled correctly

It also includes an additional unknown-source review test.

## Sample Payloads

Sample payloads are included in `lib/sampleEvents.ts` and exposed in the simulator UI through `/api/events?view=samples`.

## Assumptions

- Failed mock-service events are marked `failed` and also receive an open review item. This keeps failure visible in dashboard metrics while still routing the case to human review.
- Review approval retries the stored actions through the relevant adapter's mock service.
- Manual resolve marks the review item resolved and the event completed, representing operator intervention outside automation.
- Database setup uses checked-in SQL because `prisma db push` was not reliable during local verification in this Windows + OneDrive environment, while Prisma Client itself worked correctly.

## Tradeoffs And Next Steps

Intentional scope decisions for the one-day timebox:

- No authentication or role permissions.
- No pagination or optimistic updates.
- No background job runner; workflow execution happens inline when an event is submitted.
- Action editing uses JSON instead of a richer form builder to keep the review workflow flexible.

