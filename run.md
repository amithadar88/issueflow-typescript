# Running IssueFlow

## 1. Install dependencies

```bash
npm install
```

## 2. Start the database

The project uses Docker Compose to run PostgreSQL on port **5433** (not the default 5432, to avoid conflicts).

```bash
docker compose up -d
```

This starts a PostgreSQL container with:
- User: `issueflow`
- Password: `issueflow`
- Database: `issueflow`
- Host port: `5433`

## 3. Set up the .env file

Create a `.env` file in the project root with the following contents:

```env
DB_HOST=localhost
DB_PORT=5433
DB_USER=issueflow
DB_PASSWORD=issueflow
DB_NAME=issueflow
JWT_SECRET=supersecretkey123
JWT_EXPIRES_IN=3600
```

> The database schema is created automatically on first startup (`synchronize: true`). No migration step is required.

## 4. Run the application

**Development mode** (with hot reload):
```bash
npm run start:dev
```

**Standard mode:**
```bash
npm run start
```

The API will be available at `http://localhost:3000`.

## 5. Run the tests

**Run all unit tests:**
```bash
npm test
```

**Run tests in watch mode:**
```bash
npm run test:watch
```

**Run tests with coverage:**
```bash
npm run test:cov
```

> Unit tests use in-memory mocks and do not require the database or Docker to be running.
