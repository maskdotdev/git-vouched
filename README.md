# Git Vouched

Read-only discovery UI for Vouch trust files (`VOUCHED.td`).

This MVP lets you:

- index public GitHub repos that contain `VOUCHED.td` or `.github/VOUCHED.td`
- automatically reindex tracked repositories in the background (hourly batch)
- search handles and see where they are vouched/denounced
- inspect repository trust lists and user-level trust history

Repository files remain the source of truth.

## Contribution Policy

This repository uses [Vouch](https://github.com/mitchellh/vouch) for contribution trust management.
See `CONTRIBUTING.md` for details.

## Stack

- Next.js (App Router)
- Convex (database + indexing logic)
- Tailwind + shadcn UI primitives

## Setup

1. Install dependencies:

```bash
bun install
```

2. Configure environment:

```bash
cp .env.local.example .env.local
```

Fill:

- `NEXT_PUBLIC_CONVEX_URL`: client-facing Convex deployment URL
- `CONVEX_HTTP_URL` (recommended): server-side Convex URL used by the Next.js index route
- `INDEXER_SECRET` (required): shared secret used between Next.js and Convex for indexing requests (must match in both environments)
- `GITHUB_TOKEN` (optional but recommended): used for scheduled background reindexing to improve GitHub API limits
- `PUBLIC_INDEXING_ENABLED` (optional): set to `true` to allow public manual indexing in production
- `PUBLIC_INDEXING_ALLOWED_OWNERS` (optional): comma-separated GitHub owners that can be indexed when public indexing is enabled
- `CONVEX_ALLOWED_HOSTS` (optional): comma-separated extra allowed hosts for `CONVEX_HTTP_URL` if you use a custom Convex domain
- `INDEXER_UPSTREAM_TIMEOUT_MS` (optional): timeout in milliseconds for Next.js -> Convex indexing requests (default `15000`)
- `GITHUB_FETCH_TIMEOUT_MS` (optional): timeout in milliseconds for Convex -> GitHub API requests (default `15000`)

By default, public manual indexing is disabled in production unless `PUBLIC_INDEXING_ENABLED=true`.

3. Configure Convex deployment (interactive):

```bash
bun run convex:dev
```

4. Run Next.js:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Convex Data Model

- `repositories`: tracked repos and index status
- `snapshots`: latest indexed `VOUCHED.td` file snapshot per repo
- `entries`: normalized trust entries (`vouch`/`denounce`)

## Current Limitations

- GitHub-only indexing
- Single-file snapshot per repo (latest replaces prior entries)
- No auth/admin panel yet (intentionally read-only UX)
- Private repositories are intentionally rejected to prevent accidental ingestion of non-public data
