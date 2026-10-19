/**
 * meetup-sync command line.
 *
 *   node src/cli.ts sync <meetup URL or HTML file> [--overrides source.json] [--sessionize <id|URL|file|none>] [--upcoming upcoming.json] [--logos logos.json] [--out event.json]
 *        [--meetup-out meetup.json]   also write the website record (SPEC.md, meetup.json)
 *   node src/cli.ts id <meetup URL or HTML file>
 *   node src/cli.ts archive <past-events URL or HTML file> --events-dir <dir> [--refresh] [--delay ms] [--logos logos.json]
 *        every past meetup: events/<id>/meetup.json, and event.json where the agenda parses
 *
 * Exit codes: 0 ok, 1 invalid event.json (zod issues printed), 2 usage or page error.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { eventIdFromHtml, PageError } from "./build.ts";
import { buildMeetupRecord, type MeetupFile } from "./archive.ts";
import { runArchive } from "./archive-run.ts";
import { loadPage, mediaOf, sync, ValidationError } from "./sync.ts";

const USAGE = `Usage:
  npm run sync -- <meetup URL or HTML file> [--overrides source.json] [--sessionize <id|URL|file|none>] [--upcoming upcoming.json] [--out event.json]
  npm run id -- <meetup URL or HTML file>
  npm run archive -- <past-events URL or HTML file> --events-dir <dir> [--refresh] [--delay ms]`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      overrides: { type: "string" },
      sessionize: { type: "string" },
      upcoming: { type: "string" },
      logos: { type: "string" },
      people: { type: "string" },
      community: { type: "string" },
      out: { type: "string" },
      "meetup-out": { type: "string" },
      "events-dir": { type: "string" },
      refresh: { type: "boolean" },
      delay: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const input = positionals[0];
  if (values.help || !input || !["sync", "id", "archive"].includes(command ?? "")) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }

  if (command === "id") {
    const page = await loadPage(input);
    console.log(eventIdFromHtml(page.html));
    return 0;
  }

  if (command === "archive") {
    if (!values["events-dir"]) {
      console.error(USAGE);
      return 2;
    }
    const delay = values.delay ? Number(values.delay) : 1500;
    const report = await runArchive(input, values["events-dir"], { refresh: Boolean(values.refresh), delayMs: delay, logos: values.logos, people: values.people, sessionize: values.sessionize, community: values.community });
    for (const line of report) console.error(line);
    return 0;
  }

  const { event, warnings, page } = await sync(input, values.overrides, values.sessionize, values.upcoming, values.logos, values.people, values.community);
  for (const w of warnings) console.error(`warning: ${w}`);
  const json = JSON.stringify(event, null, 2) + "\n";
  if (values.out) {
    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, json);
    console.error(`wrote ${values.out}: ${event.id}, ${event.segments.length} segments`);
  } else {
    process.stdout.write(json);
  }
  if (values["meetup-out"] && page) {
    const media = values.overrides ? ((await mediaOf(values.overrides)) as MeetupFile["media"]) : undefined;
    const record = buildMeetupRecord(page.html, { url: page.url, stream: true, media, event });
    await writeFile(values["meetup-out"], JSON.stringify(record, null, 2) + "\n");
    console.error(`wrote ${values["meetup-out"]}: the website record`);
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof ValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    console.error(err instanceof PageError ? `page error: ${err.message}` : err instanceof Error ? err.message : String(err));
    process.exit(2);
  },
);
