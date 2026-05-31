# IssueFlow – AI Prompts Log

**Model used:** Claude Sonnet 4.6 (via Claude Code in VS Code)

---

## Setup & Configuration
- Installed NestJS dependencies: typeorm, pg, jwt, passport, bcrypt, class-validator, config, schedule
- Updated `app.module.ts` to connect to PostgreSQL via TypeORM using ConfigModule for .env variables

## Users Module
**Prompt:**
"I'm building a NestJS + TypeORM + PostgreSQL backend. Create a Users module with these files: src/users/user.entity.ts, src/users/dto/create-user.dto.ts, src/users/dto/update-user.dto.ts, src/users/users.service.ts, src/users/users.controller.ts, src/users/users.module.ts.

User entity fields: id (auto-increment), username (unique), email (unique), fullName, role (enum: ADMIN, DEVELOPER), password (string).

Implement all CRUD endpoints: GET /users, GET /users/:userId, POST /users, POST /users/update/:userId, DELETE /users/:userId.

Use class-validator for input validation. Never return the password field in responses."

## Auth Module
**Prompt:**
"Add JWT authentication to the NestJS app. Create src/auth/ module with login, logout, and GET /auth/me endpoints. Login accepts username + password, validates against the users table (bcrypt compare), and returns a signed JWT. Logout should maintain a server-side token denylist in memory. All future endpoints should be protected by a JWT guard by default. Use the JWT_SECRET and JWT_EXPIRES_IN from .env."

## Make Registration Public
**Prompt:**
"Mark POST /users as @Public() so anyone can register. Keep the seed user. Leave GET / protected."

## Projects Module
**Prompt:**
"Build the Projects module: src/projects/ with entity, DTOs, service, controller, module. Fields: id, name, description, ownerId (references users.id), deletedAt (for soft delete). Endpoints: GET /projects, GET /projects/:projectId, POST /projects, PATCH /projects/:projectId, DELETE /projects/:projectId (soft delete only - set deletedAt, don't hard delete). Also add GET /projects/deleted (ADMIN only) and POST /projects/:projectId/restore (ADMIN only). Validate inputs with class-validator."

## Tickets Module
**Prompt:**
"Build the Tickets module: src/tickets/ with entity, DTOs, service, controller, module. Fields: id, title, description, status (enum: TODO, IN_PROGRESS, IN_REVIEW, DONE), priority (enum: LOW, MEDIUM, HIGH, CRITICAL), type (enum: BUG, FEATURE, TECHNICAL), projectId, assigneeId (optional), dueDate (optional), isOverdue (boolean, default false), deletedAt (soft delete). Endpoints per spec: GET /tickets?projectId=, GET /tickets/:ticketId, POST /tickets, PATCH /tickets/:ticketId, DELETE /tickets/:ticketId (soft delete), GET /tickets/deleted?projectId= (ADMIN only), POST /tickets/:ticketId/restore (ADMIN only). Business rules: status can only move forward (TODO→IN_PROGRESS→IN_REVIEW→DONE), a DONE ticket cannot be updated, optimistic locking to prevent simultaneous updates (add a version column)"

## Comments Module
**Prompt:**
"Build the Comments module: src/comments/ with entity, DTOs, service, controller, module. Fields: id, content, ticketId (references tickets.id), authorId (references users.id), createdAt, updatedAt. Endpoints: GET /tickets/:ticketId/comments, POST /tickets/:ticketId/comments (body: authorId, content), PATCH /tickets/:ticketId/comments/:commentId (body: content), DELETE /tickets/:ticketId/comments/:commentId. Add optimistic locking (version column) to prevent two users editing the same comment simultaneously. Parse @username mentions from content, validate they exist in the users table, and return mentionedUsers: [{id, username, fullName}] in every comment response. On comment update re-evaluate mentions."

## Audit Log Module
**Prompt:**
"Build the Audit Log module: src/audit-log/ with entity, service, module. Fields: id, action (string), entityType (string), entityId (number), performedBy (userId, nullable for SYSTEM actions), actor (enum: USER, SYSTEM), timestamp (auto). Expose GET /audit-logs endpoint with optional query filters: entityType, entityId, action, actor. Then inject AuditLogService into UsersService, ProjectsService, TicketsService, and CommentsService and log every state-changing action (CREATE, UPDATE, DELETE, RESTORE). SYSTEM actions like AUTO_ASSIGN should use actor=SYSTEM and performedBy=null."

## Memory Update / Remaining Modules (new chat session)
**Prompt:**
"I'm building IssueFlow NestJS backend. The following modules are already built and working: Users, Auth (JWT), Projects (with soft delete), Tickets (with soft delete, status transitions, optimistic locking), Comments (with @mentions). The Audit Log module was partially built but got stuck. Please read the current src/ folder, fix any compilation errors, then continue building: Audit Log (GET /audit-logs with filters, log all state changes in other services), Ticket Dependencies (POST /tickets/:ticketId/dependencies with body {blockedBy}, GET /tickets/:ticketId/dependencies, DELETE /tickets/:ticketId/dependencies/:blockerId — both tickets must be in same project, cycle detection, ticket cannot transition to DONE if unresolved blockers exist), Attachments (10MB limit, allowed types: png/jpeg/pdf/txt), CSV Export/Import, Auto-escalation scheduler, Auto-assignment, Workload endpoint, and Tests."

## Verification Check
**Prompt 1:**
"Check if GET /users/:userId/mentions endpoint exists in the codebase. Also check if the audit log is wired into users.service.ts, projects.service.ts, tickets.service.ts, and comments.service.ts. List what's missing."

**Prompt 2:**
"Yes, add GET /users/:userId/mentions. It should return all comments where that user was mentioned, newest first, with pagination (page, pageSize query params). Response format: { data: [{id, ticketId, authorId, content, mentionedUsers: [{id, username, fullName}]}], total, page }. Add it to users.controller.ts and users.service.ts."

**Prompt 3:**
"Run the full test suite with npm run test and also add a test for the new GET /users/:userId/mentions endpoint in users.service.spec.ts."

## Spec Verification & Fixes
After Claude Code built the extended features, I ran a verification check and it identified several mismatches between the implementation and the spec (wrong field names, missing validations, wrong endpoint paths). I then sent:

**Prompt:**
"Fix all of these to match the spec exactly."

**Result:** 41/41 tests passing after fixes.

## Fixing Bugs
During manual testing with Postman, I discovered several bugs and fixed them one by one:

**Prompt 1:**
"POST /projects is rejecting ownerId with 'property should not exist'. Fix the CreateProjectDto to accept ownerId as a required number field."

**Prompt 2:**
"The status transition validation is not working. A ticket with status TODO should not be able to jump directly to DONE. It must go TODO→IN_PROGRESS→IN_REVIEW→DONE. PATCH /tickets/4 with status DONE on a TODO ticket returned 200 instead of 422. Fix the status transition validation in tickets.service.ts."

**Prompt 3:**
"GET /tickets/:ticketId/dependencies returns the raw dependency entity instead of the blocker tickets. Fix it to return the actual blocker ticket objects: [{id, title, status}] as specified in the README."

**Prompt 4:**
"The update user endpoint (POST /users/update/:userId) should only allow updating fullName and role. Currently it also allows updating email and username. Fix the UpdateUserDto to only accept fullName and role fields, reject everything else."

**Prompt 5:**
"POST /projects with a non-existent ownerId returns 500 Internal Server Error. Fix projects.service.ts to validate that the ownerId exists before creating the project, and return a 404 with message 'User {id} not found' if it doesn't."

**Prompt 6:**
"Remove deletedAt from all standard API responses for tickets and projects. It's an internal field and should not be exposed in normal GET responses. Exception: GET /tickets/deleted and GET /projects/deleted (ADMIN only) should still show deletedAt so admins can see when it was deleted."

**Prompt 7:**
"The PATCH /tickets/:ticketId endpoint allows updating the type field, but the spec says only title, description, status, priority, and assigneeId can be updated. Fix UpdateTicketDto to only allow those fields plus optional version and dueDate."

**Prompt 8:**
"GET /tickets/deleted is not showing the deletedAt field. The @SerializeOptions({ groups: ['admin'] }) should expose it. Check why deletedAt is still hidden on the findDeleted endpoint and fix it."

**Prompt 9:**
"Mention matching should be case-insensitive per the spec. Currently @Alice fails with 422 even though user 'alice' exists. Fix the mention parsing to match usernames case-insensitively."

## Fixing Auto Assignment Bug
After testing auto-assignment, I noticed tickets were always created with assigneeId null despite DEVELOPER users existing. I debugged it step by step:

**Prompt 1:**
"Auto-assignment is returning null. The spec doesn't have project membership — auto-assignment should find the DEVELOPER user with the fewest non-DONE tickets assigned to them in the given projectId. Fix the auto-assignment logic in tickets.service.ts to query all DEVELOPER users globally and count their non-DONE tickets in the specific project."

**Prompt 2:**
"Auto-assignment still returns assigneeId null. Please read the current auto-assignment code in tickets.service.ts and show me exactly what query it uses to find DEVELOPER users. The problem is likely it's querying for users linked to the project somehow, but there's no project membership in this system. It should simply find ALL users with role DEVELOPER, then count their non-DONE tickets where projectId matches, and assign to the one with the lowest count."

**Prompt 3:**
"Auto-assignment still returns null even with DEVELOPER users in the DB. Add a console.log in the auto-assignment code to debug: log the developers found, the counts, and the selected assignee. Then I'll create a ticket and check the server logs."

**Prompt 4:**
"Show me the current auto-assignment code in tickets.service.ts with the console.logs — paste the relevant function."

**Prompt 5:**
"Auto-assignment is implemented as a separate POST /tickets/:ticketId/auto-assign endpoint but the spec says it should happen automatically during ticket creation when assigneeId is not provided. Move the auto-assignment logic to run inside the create() function in tickets.service.ts when dto.assigneeId is absent. The separate auto-assign endpoint can stay but the automatic behavior on creation is what's required."

**Prompt 6:**
"Auto-assignment is working but it's not logging to the audit log with actor=SYSTEM, action=AUTO_ASSIGN. Add audit log entry in pickLeastLoadedDeveloper or in the create() function after auto-assignment, with action='AUTO_ASSIGN', entityType='Ticket', entityId=ticket.id, actor=SYSTEM, performedBy=null."

## Testing Auto-Scheduling Escalation
**Prompt:**
"Add a test endpoint POST /tickets/escalate-now that manually triggers the escalation job — only for testing purposes. It should run the same logic as the hourly cron."

## Adding more Tests
Tests were written alongside each module. After manual testing revealed additional edge cases, I added:

**Prompt:**
"Add more unit tests covering these edge cases: status transition validation (forward only), DONE ticket cannot be updated, dependency blocks DONE transition, mention case-insensitivity, auto-escalation idempotency (CRITICAL ticket not escalated further), auto-assignment with no developers available."

## run.md File Creation
**Prompt:**
"Write a run.md file in the project root with exact steps to: 1) install dependencies, 2) start the database with Docker, 3) set up the .env file, 4) run the application, 5) run the tests. Include the exact commands needed."

## Last README Check
**Prompt:**
"Go through every endpoint in README.md and verify it exists in the codebase with the correct HTTP method and path. Don't change anything yet.List any missing or mismatched endpoints."

## Last Tests Check
**Prompt:**
"Go through every endpoint in the codebase and tell me which ones have unit tests covering happy path and error cases, and which ones are missing tests. Give me a summary table."

## Add Tests
**Prompt 1:**
"Add unit tests for the following service methods that currently have no tests: AuthService (login happy path, wrong password, non-existent user), ProjectsService (create, findOne 404, update, softDelete, restore), TicketDependenciesService (addDependency, getDependencies, removeDependency, same-project validation, blocks DONE transition). Follow the same mock pattern used in the existing spec files."

**Prompt 2:**
"Add unit tests for UsersService: create (happy path + duplicate username 409), findOne (found + 404), update (happy path + 404), remove (happy path + 404)."

**Prompt 3:**
"Add unit tests for TicketsService.create() error cases: invalid projectId, assigneeId provided but invalid."

## Code Quality Review
**Prompt:**
"Do a code quality review of the entire src/ folder. Check for: 1) any console.log statements left in production code, 2) any TODO comments, 3) any duplicate code that should be extracted, 4) any inconsistent naming conventions, 5) any missing error handling. List everything you find."

## Code Quality Fixes
**Prompt:**
"Fix the following code quality issues: 1) Replace console.error in audit-log.service.ts with NestJS Logger. 2) Add null check after reload in comments.service.ts:165 — throw NotFoundException if comment can't be reloaded. 3) Add null guards in projects.service.ts restore() and tickets.service.ts restore() — throw NotFoundException if findOne returns null. 4) In attachments.service.ts remove(), wrap fs.unlinkSync() in try-catch so filesystem errors don't crash after the DB record is already deleted. 5) Extract the duplicate assertTicketExists() into a shared helper or keep it as is if it's simpler."