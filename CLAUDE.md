# Madiro — working agreements

## Language

**Everything written into this repository is in English**: documentation,
commit messages, pull request titles and bodies, code comments, and the names
of things. That includes `docs/`, which used to be Ukrainian — new and edited
documents are English, and existing ones are translated as they are touched.

Two deliberate exceptions:

- **User-facing strings stay Ukrainian** (i18n dictionaries, API error messages
  the app shows a seller or an admin). The shop is in Lviv; its staff reads
  Ukrainian.
- **Test names stay Ukrainian** where they already are — they read as
  specifications of behaviour to the same audience.

Conversation with the maintainer is in Ukrainian; that is speech, not artefact.

## Environments

Three, and they are not interchangeable:

| Environment | Runs from                               | Database                  | What it is for                             |
| ----------- | --------------------------------------- | ------------------------- | ------------------------------------------ |
| local       | working tree                            | `docker compose` Postgres | development                                |
| DEMO        | `main`, auto-deployed                   | its own Railway Postgres  | every merge lands here; resettable at will |
| PROD        | `release`, deployed by a tagged release | its own Railway Postgres  | the shop's real books                      |

`NODE_ENV=production` in both DEMO and PROD — they are the same build.
`APP_ENV` (`development` | `demo` | `production`) is what tells them apart, and
it is what guards destructive or fake behaviour: `db:seed:demo` refuses to run
when `APP_ENV=production`, and `VISION_PROVIDER=mock` / `EXCHANGE_RATE_USD` are
refused there too.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Railway setup and
[docs/release-process.md](docs/release-process.md) for how a release is cut.

## Migrations

Releases roll forward; databases do not roll back. A rollback redeploys older
code against a database that has already been migrated, so **every migration
must leave the previous release working** (expand–contract): add columns
nullable or with defaults, and drop a column only in a release _after_ the one
that stopped reading it.
