# meetup-sync

Turns a Meetup event page into `event.json` (version 1), the file the meetup
meetup evening runs on. The contract is `../SPEC.md`; the schema is
`src/event.schema.ts`, an identical copy of
`meetup-stream-templates/src/event.schema.ts` (change both together).

## Part of the meetup tools

One of the repositories behind the AWS User Groups Austria meetup evenings, in
[aws-user-groups-austria](https://github.com/aws-user-groups-austria). Start with
[`meetup-workspace`](https://github.com/aws-user-groups-austria/meetup-workspace): it clones all of them (`make
clone`), installs them and runs the whole evening (`make start`); the contract
between them is its `SPEC.md`.

| Repository | What |
|---|---|
| [`meetup-workspace`](https://github.com/aws-user-groups-austria/meetup-workspace) | The Makefile, the spec and the guide |
| **[`meetup-sync`](https://github.com/aws-user-groups-austria/meetup-sync)** | A Meetup page to `event.json` |
| [`meetup-event-vienna`](https://github.com/aws-user-groups-austria/meetup-event-vienna) | One folder per meetup, shared photos and logos |
| [`meetup-stream-templates`](https://github.com/aws-user-groups-austria/meetup-stream-templates) | The room screen: Remotion scenes and the web player |
| [`meetup-deck`](https://github.com/aws-user-groups-austria/meetup-deck) | The slide deck, filled in |
| [`aws-community-austria-website`](https://github.com/aws-user-groups-austria/aws-community-austria-website) | awscommunity.at |


Node 24 runs the TypeScript sources directly (type stripping), so there is no
build step.

## What it reads

From the page, and nothing else:

- The JSON-LD `Event`: name, startDate (doors open), endDate (how long we can
  stay), location, organizer, url.
- The description markdown inside `__NEXT_DATA__`:
  - the first paragraph as tagline,
  - the `Location` block (first line is the venue name, the rest the address),
  - the agenda lines, like `* **18:10 - 18:50:** **"Title"**` or
    `20:00 - Open End: Networking`, as local Europe/Vienna times on the event date,
  - each talk: a quoted title, then `Speakers:` or `Speaker:` lines, then
    `About the talk:` up to the next talk or `***`,
  - the `Sponsors:` block and any "thank you to X for supporting" line,
  - the photo and video notice, verbatim,
  - the Code of Conduct link.

Emoji and markdown are removed. A field the page does not have stays absent.
`links.feedback` defaults to the Meetup event page. The group id comes from a
small table in `src/build.ts` (`amazon-web-services-aws-vienna` is
`aws-ug-vienna`); other groups use their Meetup urlname. The event id is the
doors-open date plus a slug of the title before its first spaced dash
(`AWS Meetup Vienna #53 - hosted by RBI` gives `2026-10-20-aws-meetup-vienna-53`).

For a URL, the page is fetched with Node's `fetch` and a browser User-Agent,
and `source.fetchedAt` is the time of the fetch. For a saved HTML file,
`source.fetchedAt` is the file's modification time.

## Sessionize

When `source.json` has `"sessionize": "<endpoint id>"`, or the command gets
`--sessionize <id, URL or saved file>`, Sessionize fills what the Meetup page
left empty: speaker photos (https only), a role for a speaker the page gave
none, a talk's abstract, and the speakers of a talk the page listed without
any. Talks are matched by title, speakers by name, ignoring accents and case;
each one it cannot find is a warning. Both endpoint formats work: JSON
(`view/All`) and the embed, whose HTML comes from `view/Speakers?under=True`.
`--sessionize none` skips it. Overrides are merged after it, so they win. Code:
`src/sessionize.ts`.

## Overrides

`--overrides` takes a `source.json` (`{ "meetupUrl": ..., "overrides": {...} }`,
its `overrides` are used) or a plain JSON object. They are deep-merged last:

- objects merge key by key,
- arrays of objects merge by `id` (segments), else by `name` (speakers,
  sponsors); an unmatched element is appended,
- other arrays (such as `notices`) are replaced,
- `null` removes a key.

A sponsor logo set on `sponsors` also reaches the sponsor segment. Example:

```json
{
  "venue": { "name": "RBI Campus" },
  "links": { "feedback": "https://example.com/form", "nextEvents": "https://awscommunity.at/" },
  "sponsors": [{ "name": "Raiffeisen Bank International AG", "logo": "events/2026-10-20-aws-meetup-vienna-53/assets/rbi.svg" }],
  "segments": [{ "id": "talk-2", "talk": { "speakers": [{ "name": "Darko Mesaroš", "photo": "events/2026-10-20-aws-meetup-vienna-53/assets/darko.jpg" }] } }]
}
```

Image paths (speaker `photo`, sponsor `logo`) are either full `https://` URLs
or paths relative to the web player's folder. The image files live in
`meetup-event-vienna/events/<id>/assets/`; `make player-event` (in
meetup-stream-templates) and the website's `npm run present:sync` copy that
folder to `events/<id>/assets/` next to the player, so a photo saved as
`events/<id>/assets/darko.jpg` in meetup-event-vienna is written as
`"events/<id>/assets/darko.jpg"` here. meetup-sync writes the path as given
and does not check that the file exists.

The result is validated with the zod schema before anything is written. If it
is invalid, the command prints the issues and exits 1. Unknown keys are
reported as warnings and not written.

## Run

```sh
npm ci
```

From a live Meetup link:

```sh
npm run sync -- "https://www.meetup.com/amazon-web-services-aws-vienna/events/316893745/" --out event.json
```

(This makes one request to the Meetup page.)

From a saved page, with the overrides of the real event, to stdout:

```sh
npm run sync -- tests/fixtures/aws-meetup-vienna-53.html --overrides ../meetup-event-vienna/events/2026-10-20-aws-meetup-vienna-53/source.json
```

Without `--out` the JSON goes to stdout. An `event.json` written into this
folder is ignored by git (`.gitignore`); the event files belong in
`../meetup-event-vienna`, where `make sync` writes them. Print only the event
id:

```sh
npm run id -- tests/fixtures/aws-meetup-vienna-53.html
```

Exit codes: 0 written, 1 invalid against the schema, 2 usage error or a page
that is not a Meetup event.

## Test

No network: everything runs against the saved page
`tests/fixtures/aws-meetup-vienna-53.html` (AWS Meetup Vienna #53, saved
16 Oct 2026).

```sh
npm test
```

```sh
npm run typecheck
```

```sh
npm audit
```

## Layout

| Path | What |
|---|---|
| `src/cli.ts` | Command line: `sync` and `id` |
| `src/sync.ts` | Load the page, build, merge overrides, validate |
| `src/build.ts` | Page data to event.json: segment kinds, ids, times, venue, group |
| `src/description.ts` | Description markdown: agenda, talks, speakers, sponsors, notices |
| `src/page.ts` | JSON-LD Event and `__NEXT_DATA__` extraction |
| `src/merge.ts` | Deep merge for overrides |
| `src/text.ts`, `src/time.ts` | Emoji and markdown removal, slugs, Vienna times with offsets |
| `src/event.schema.ts` | The shared schema, copied verbatim |
| `tests/` | vitest suites (see `tests/README.md`) |
| `tests/fixtures/` | The saved Meetup page, scrubbed of tokens and account ids (see `tests/fixtures/README.md`) |
