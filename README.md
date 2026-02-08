# Git Vouched

Read-only discovery UI for Vouch trust files (`VOUCHED.td`).

This MVP lets you:

- index public GitHub repos that contain `VOUCHED.td` or `.github/VOUCHED.td`
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

- `NEXT_PUBLIC_CONVEX_URL`: your Convex deployment URL
- `GITHUB_TOKEN` (optional but recommended): raises GitHub API rate limits

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
