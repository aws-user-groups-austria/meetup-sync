# tests

vitest suites. No network: everything runs against the saved page in
`fixtures/`.

| File | What |
|---|---|
| `fixture.test.ts` | The whole event.json built from the saved AWS Meetup Vienna #53 page |
| `agenda.test.ts` | Agenda lines (times, hyphen and en dash, "Open End") and segment kinds |
| `speaker.test.ts` | Speaker lines in both forms (`Name, Role (Company)` and `Name Role@Company`) |
| `text.test.ts` | Emoji and markdown removal, ids and slugs, Vienna times with offsets |
| `merge.test.ts` | Override merging, and overrides applied to the saved page |
| `cli.test.ts` | The command line, run as a child process |

Run them from the meetup-sync folder:

```sh
npm test
```
