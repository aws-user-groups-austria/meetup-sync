/**
 * `archive`: every past meetup of a group into events/<id>/.
 *
 * For each event on the group's past-events page: the event page is fetched
 * once and saved as events/<id>/page.html (gitignored; `--refresh` fetches it
 * again), source.json is created when missing, event.json is written when
 * the agenda parses into a valid event (present mode then works for it), and
 * meetup.json, the website's record, is always written. Existing source.json
 * overrides are applied; nothing is deleted.
 */
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildMeetupRecord, pastEventsFromHtml, type MeetupFile } from "./archive.ts";
import { eventIdFromHtml } from "./build.ts";
import { loadLogos } from "./logos.ts";
import { loadSessionize } from "./sessionize.ts";
import { loadOverrides, loadPage, mediaOf, syncHtml, ValidationError } from "./sync.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runArchive(
  pastPage: string,
  eventsDir: string,
  opts: { refresh?: boolean; delayMs?: number; logos?: string; people?: string; sessionize?: string; community?: string } = {},
): Promise<string[]> {
  const report: string[] = [];
  const logos = opts.logos ? await loadLogos(opts.logos) : undefined;
  // One Sessionize fetch for the whole run: past speakers' photos.
  const community = opts.community ? (JSON.parse(await readFile(opts.community, "utf8")) as Record<string, unknown>) : undefined;
  const sessionize = opts.sessionize && opts.sessionize !== "none" ? await loadSessionize(opts.sessionize) : undefined;
  const list = pastEventsFromHtml((await loadPage(pastPage)).html);
  report.push(`${list.length} past events on ${pastPage}`);
  let fetched = 0;
  for (const item of list) {
    // A saved page for this link? Find it by the folder whose source.json has the link.
    let html: string | undefined;
    let id: string | undefined;
    for (const dir of existsSync(eventsDir) ? readdirSync(eventsDir) : []) {
      const src = join(eventsDir, dir, "source.json");
      const saved = join(eventsDir, dir, "page.html");
      if (!existsSync(src)) continue;
      const url = (JSON.parse(await readFile(src, "utf8")) as { meetupUrl?: string }).meetupUrl ?? "";
      if (url.replace(/\/?$/, "/") === item.url) {
        id = dir;
        if (existsSync(saved) && !opts.refresh) html = await readFile(saved, "utf8");
        break;
      }
    }
    if (!html) {
      if (fetched++ > 0) await sleep(opts.delayMs ?? 1500);
      html = (await loadPage(item.url)).html;
    }
    id ??= eventIdFromHtml(html);
    const dir = join(eventsDir, id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "page.html"), html);
    const sourcePath = join(dir, "source.json");
    if (!existsSync(sourcePath)) {
      await writeFile(sourcePath, JSON.stringify({ meetupUrl: item.url, overrides: {} }, null, 2) + "\n");
    }
    const readme = join(dir, "README.md");
    if (!existsSync(readme)) {
      await writeFile(
        readme,
        `# ${id}\n\nOne past meetup, from its Meetup page by \`make archive\`: \`source.json\` holds the\n` +
          `link and overrides (edit it), \`meetup.json\` is the website's record and \`event.json\`\n` +
          `(when the agenda parses) the stream's; both are generated, do not edit. \`page.html\` is\n` +
          `the saved page (gitignored). See \`../../README.md\`.\n`,
      );
    }
    const overrides = await loadOverrides(sourcePath);
    let stream = false;
    let event: Parameters<typeof buildMeetupRecord>[1]["event"];
    let note = "page only (no agenda that parses)";
    try {
      const { event: built } = syncHtml({ html, fetchedAt: new Date().toISOString(), url: item.url }, overrides, sessionize, undefined, logos, opts.people, community);
      await writeFile(join(dir, "event.json"), JSON.stringify(built, null, 2) + "\n");
      event = built;
      stream = true;
      note = `event.json, ${built.segments.length} segments`;
    } catch (err) {
      if (!(err instanceof ValidationError) && !(err instanceof Error)) throw err;
      note = `page only (${err instanceof ValidationError ? "agenda does not validate" : err.message})`;
    }
    const media = (await mediaOf(sourcePath)) as MeetupFile["media"];
    const record = buildMeetupRecord(html, { url: item.url, stream, media, event });
    await writeFile(join(dir, "meetup.json"), JSON.stringify(record, null, 2) + "\n");
    report.push(`  ${id}: ${note}`);
  }
  return report;
}
