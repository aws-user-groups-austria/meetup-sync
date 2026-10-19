# src

The meetup-sync sources. Node 24 runs them directly (type stripping), so
there is no build step; `../README.md` has the commands.

| File | What |
|---|---|
| `cli.ts` | Command line: `sync` and `id`, exit codes |
| `sync.ts` | Load the page (URL or saved HTML), build, merge overrides, validate |
| `build.ts` | Page data to event.json: segment kinds, ids, times, venue, group |
| `description.ts` | Description markdown: agenda, talks, speakers, sponsors, notices |
| `page.ts` | JSON-LD `Event` and `__NEXT_DATA__` extraction |
| `merge.ts` | Deep merge for `source.json` overrides |
| `text.ts` | Emoji and markdown removal, slugs |
| `time.ts` | Europe/Vienna local times to ISO with offsets |
| `event.schema.ts` | The zod schema, an identical copy of `meetup-stream-templates/src/event.schema.ts` |
