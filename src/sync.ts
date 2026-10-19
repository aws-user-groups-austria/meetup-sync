/**
 * The sync pipeline: load the page (URL or saved HTML), build event.json,
 * fill its gaps from Sessionize when the event has an endpoint, deep-merge
 * the overrides last, validate against the shared zod schema.
 */
import { readFile, stat } from "node:fs/promises";
import type { ZodIssue } from "zod";
import { buildFromHtml, type BuiltEvent } from "./build.ts";
import { eventSchema, type EventFile } from "./event.schema.ts";
import { deepMerge, isPlainObject } from "./merge.ts";
import { applyLogos, loadLogos, type LogoEntry } from "./logos.ts";
import { applyPeople } from "./people.ts";
import { applySessionize, loadSessionize, type SessionizeAll } from "./sessionize.ts";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export const isUrl = (s: string) => /^https?:\/\//i.test(s);

export type LoadedPage = { html: string; fetchedAt: string; url?: string };

/** Fetches a URL with a browser User-Agent, or reads a saved HTML file (fetchedAt is then its modification time). */
export async function loadPage(input: string): Promise<LoadedPage> {
  if (isUrl(input)) {
    const res = await fetch(input, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
      redirect: "follow",
    }).catch((err: unknown) => {
      const why = err instanceof Error ? err.message : String(err);
      throw new Error(`Fetching ${input} failed (${why}). Without network, pass a saved copy of the page instead of the URL.`);
    });
    if (!res.ok) throw new Error(`Fetching ${input} failed: HTTP ${res.status} ${res.statusText}`);
    return { html: await res.text(), fetchedAt: new Date().toISOString(), url: input };
  }
  const [html, info] = await Promise.all([readFile(input, "utf8"), stat(input)]);
  return { html, fetchedAt: info.mtime.toISOString() };
}

/**
 * Reads overrides from a file. A source.json ({ meetupUrl, overrides }) gives
 * its `overrides`; any other JSON object is taken as the overrides itself.
 */
export async function loadOverrides(path: string): Promise<Record<string, unknown>> {
  const data: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isPlainObject(data)) throw new Error(`${path}: expected a JSON object`);
  if ("overrides" in data || "meetupUrl" in data) {
    const o = data.overrides ?? {};
    if (!isPlainObject(o)) throw new Error(`${path}: "overrides" must be an object`);
    return o;
  }
  return data;
}

/** Sponsor logos set in overrides also reach the sponsor segment for the same sponsor. */
function propagateSponsorLogos(e: BuiltEvent): BuiltEvent {
  for (const seg of e.segments ?? []) {
    if (!seg.sponsor || seg.sponsor.logo) continue;
    const s = (e.sponsors ?? []).find((x) => x.name === seg.sponsor!.name);
    if (s?.logo) seg.sponsor.logo = s.logo;
  }
  return e;
}

/** Paths present in `input` that the schema dropped (unknown keys, usually a typo in overrides). */
export function droppedKeys(input: unknown, output: unknown, path = ""): string[] {
  if (Array.isArray(input) && Array.isArray(output)) return input.flatMap((v, i) => droppedKeys(v, output[i], `${path}[${i}]`));
  if (isPlainObject(input) && isPlainObject(output)) {
    return Object.keys(input).flatMap((k) =>
      k in output ? droppedKeys(input[k], output[k], path ? `${path}.${k}` : k) : [path ? `${path}.${k}` : k],
    );
  }
  return [];
}

export class ValidationError extends Error {
  issues: ZodIssue[];
  constructor(issues: ZodIssue[]) {
    super(
      "event.json does not match event.schema.ts:\n" +
        issues.map((i) => `  - ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`).join("\n"),
    );
    this.issues = issues;
  }
}

export type SyncResult = { event: EventFile; warnings: string[]; page?: LoadedPage };

export type UpcomingEntry = { date: string; [k: string]: unknown };

/**
 * The community days to announce at a meetup: those starting after the
 * meetup's day, soonest first, at most three. `list` is upcoming.json.
 */
export function upcomingAfter(list: UpcomingEntry[], doorsOpen: string, max = 3): UpcomingEntry[] {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date(doorsOpen));
  return list
    .filter((u) => typeof u.date === "string" && u.date > day)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, max);
}

export async function loadUpcoming(path: string): Promise<UpcomingEntry[]> {
  const data: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(data)) throw new Error(`${path}: expected a JSON array of community days`);
  return data as UpcomingEntry[];
}

/** Builds, merges and validates. Throws ValidationError with the zod issues when the result is invalid. */
export function syncHtml(
  page: LoadedPage,
  overrides: Record<string, unknown> = {},
  sessionize?: SessionizeAll,
  upcoming?: UpcomingEntry[],
  logos?: LogoEntry[],
  peopleDir?: string,
  community?: Record<string, unknown>,
): SyncResult {
  const built = buildFromHtml(page.html, { fetchedAt: page.fetchedAt, url: page.url });
  if (peopleDir) applyPeople(built, peopleDir);
  const fromSessionize = sessionize ? applySessionize(built, sessionize).warnings : [];
  const next = upcoming ? upcomingAfter(upcoming, built.doorsOpen) : [];
  if (next.length) (built as BuiltEvent & { upcoming?: UpcomingEntry[] }).upcoming = structuredClone(next);
  if (community) (built as BuiltEvent & { community?: unknown }).community = structuredClone(community);
  // Shared logos last: they fill only what the page and the overrides left without a logo.
  const merged = propagateSponsorLogos(deepMerge(built, overrides));
  if (logos) applyLogos(merged as BuiltEvent, logos);
  const parsed = eventSchema.safeParse(merged);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const warnings = [...fromSessionize, ...droppedKeys(merged, parsed.data).map((p) => `ignored unknown key: ${p}`)];
  return { event: parsed.data, warnings };
}

/** The `sessionize` entry of a source.json (endpoint id, URL or saved file), if any. */
export async function sessionizeOf(sourcePath: string): Promise<string | undefined> {
  const data: unknown = JSON.parse(await readFile(sourcePath, "utf8"));
  const v = isPlainObject(data) ? data.sessionize : undefined;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * `sessionizeSrc`: an endpoint id, URL or saved JSON file; "none" skips
 * Sessionize; undefined takes the `sessionize` entry of the source.json.
 */
export async function sync(
  input: string,
  overridesPath?: string,
  sessionizeSrc?: string,
  upcomingPath?: string,
  logosPath?: string,
  peopleDir?: string,
  communityPath?: string,
): Promise<SyncResult> {
  const page = await loadPage(input);
  const overrides = overridesPath ? await loadOverrides(overridesPath) : {};
  const src = sessionizeSrc ?? (overridesPath ? await sessionizeOf(overridesPath) : undefined);
  const sessionize = src && src !== "none" ? await loadSessionize(src) : undefined;
  const upcoming = upcomingPath ? await loadUpcoming(upcomingPath) : undefined;
  const logos = logosPath ? await loadLogos(logosPath) : undefined;
  const community = communityPath ? (JSON.parse(await readFile(communityPath, "utf8")) as Record<string, unknown>) : undefined;
  return { ...syncHtml(page, overrides, sessionize, upcoming, logos, peopleDir, community), page };
}

/** The `media` entry of a source.json (photos, slides, recordings for the website), if any. */
export async function mediaOf(sourcePath: string): Promise<Record<string, unknown> | undefined> {
  const data: unknown = JSON.parse(await readFile(sourcePath, "utf8"));
  const m = isPlainObject(data) ? data.media : undefined;
  return isPlainObject(m) ? m : undefined;
}
