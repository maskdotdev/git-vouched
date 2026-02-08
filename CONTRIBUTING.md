# Contributing

This project uses [Vouch](https://github.com/mitchellh/vouch) to manage trust for contributions.

## Pull Requests

PR authors must be vouched. If you are not vouched yet, your PR may be closed automatically.

Maintainers and collaborators with write access are always allowed.

## How to Get Vouched

1. Open an issue or discussion describing what you want to contribute.
2. Keep it concise and specific.
3. A maintainer can vouch for you via a comment command.
4. Once vouched, you can open PRs normally.

## Maintainer Commands

These commands are processed from issue or discussion comments by collaborators with write access:

- `vouch`
- `vouch @username`
- `vouch @username <reason>`
- `denounce`
- `denounce @username`
- `denounce @username <reason>`
- `unvouch`
- `unvouch @username`

The trust list is stored at `.github/VOUCHED.td`.

