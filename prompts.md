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
"I'm building IssueFlow NestJS backend. The following modules are already built and working: Users, Auth (JWT), Projects (with soft delete), Tickets (with soft delete, status transitions, optimistic locking), Comments (with @mentions). The Audit Log module was partially built but got stuck. Please read the current src/ folder, fix any compilation errors, then continue building: Audit Log (GET /audit-logs with filters, log all state changes in other services), Ticket Dependencies, Attachments, CSV Export/Import, Auto-escalation scheduler, Auto-assignment, Workload endpoint, and Tests."

## Verification Check
**Prompt 1:**
"Check if GET /users/:userId/mentions endpoint exists in the codebase. Also check if the audit log is wired into users.service.ts, projects.service.ts, tickets.service.ts, and comments.service.ts. List what's missing."

**Prompt 2:**
"Yes, add GET /users/:userId/mentions. It should return all comments where that user was mentioned, newest first, with pagination (page, pageSize query params). Response format: { data: [{id, ticketId, authorId, content, mentionedUsers: [{id, username, fullName}]}], total, page }. Add it to users.controller.ts and users.service.ts."

**Prompt 3:**
"Run the full test suite with npm run test and also add a test for the new GET /users/:userId/mentions endpoint in users.service.spec.ts."

**Prompt 4:**
"Fix all of these to match the spec exactly."

**Result:** 41/41 tests passing after fixes.

## Fixing Bugs
**Prompt 1:**
"POST /projects is rejecting ownerId with 'property should not exist'. Fix the CreateProjectDto to accept ownerId as a required number field."

**Prompt 2:**
"The status transition validation is not working. A ticket with status TODO should not be able to jump directly to DONE. It must go TODO→IN_PROGRESS→IN_REVIEW→DONE. PATCH /tickets/4 with status DONE on a TODO ticket returned 200 instead of 422. Fix the status transition validation in tickets.service.ts."

**Prompt 3:**
"GET /tickets/:ticketId/dependencies returns the raw dependency entity instead of the blocker tickets. Fix it to return the actual blocker ticket objects: [{id, title, status}] as specified in the README."

# DELETE BEFORE SENDING!!!!

## Extended Features Spec Prompt
**Prompt:**
Build the following modules exactly matching these specs:
1. Ticket Dependencies: POST /tickets/:ticketId/dependencies (body: {blockedBy: number}), GET /tickets/:ticketId/dependencies, DELETE /tickets/:ticketId/dependencies/:blockerId. Both tickets must exist and belong to the same project. A ticket cannot transition to DONE if it has unresolved blockers.
2. Attachments: POST /tickets/:ticketId/attachments (multipart file upload), DELETE /tickets/:ticketId/attachments/:attachmentId. Max 10MB, allowed types: image/png, image/jpeg, application/pdf, text/plain. Store files locally.
3. CSV Export: GET /tickets/export?projectId=:id returns CSV with fields: id, title, description, status, priority, type, assigneeId. CSV Import: POST /tickets/import accepts multipart CSV + projectId form field, creates tickets in bulk, returns {created, failed, errors[]}.
4. Auto-escalation: background cron job (runs every hour), for each overdue ticket (dueDate passed, status != DONE), promote priority one level: LOW→MEDIUM→HIGH→CRITICAL. Set isOverdue=true when CRITICAL. Idempotent.
5. Auto-assignment: when ticket is created without assigneeId, assign to DEVELOPER with least open tickets in that project. Ties broken by registration order. Log in audit log with actor=SYSTEM, action=AUTO_ASSIGN.
6. Workload: GET /projects/:projectId/workload returns [{userId, username, openTicketCount}] sorted ascending.
7. Mentions: GET /users/:userId/mentions returns all comments where user was mentioned, newest first, paginated.