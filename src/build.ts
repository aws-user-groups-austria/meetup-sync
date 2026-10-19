/**
 * Builds the event.json object (version 1, see SPEC.md) from a Meetup page.
 * Fields the page does not carry stay absent.
 */
import { hostsFromDescription, hostsFromTitle } from "./hosts.ts";
import { parseDescription, type AgendaLine, type ParsedDescription, type ParsedSponsor } from "./description.ts";
import { readPage, type PageData } from "./page.ts";
import { mainTitle, normalizeTitle, plain, slugify, stripEmoji } from "./text.ts";
import { minutesOf, zonedIso } from "./time.ts";

export const TIMEZONE = "Europe/Vienna";

/**
 * Short ids for groups we stream for, keyed by the Meetup urlname. The id is
 * ours (SPEC.md: "aws-ug-vienna"), not something the page says; any other
 * group uses its Meetup urlname as id.
 */
export const GROUP_IDS: Record<string, string> = {
  "amazon-web-services-aws-vienna": "aws-ug-vienna",
};

type Kind = "networking" | "welcome" | "sponsor" | "talk" | "break" | "closing";

type SponsorOut = { name: string; short?: string; logo?: string; url?: string };

export type BuiltSpeaker = {
  name: string;
  role?: string;
  company?: string;
  photo?: string;
  bio?: string;
  links?: { title: string; url: string }[];
};

/** A speaker's link from the description, named by where it points. */
export function linkOf(url: string): { title: string; url: string } {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const title = /(^|\.)linkedin\.com$/.test(host) ? "LinkedIn" : host === "github.com" ? "GitHub" : /(^|\.)(x|twitter)\.com$/.test(host) ? "X" : "Website";
  return { title, url };
}

export type BuiltEvent = {
  version: 1;
  id: string;
  source: { meetupUrl: string; fetchedAt: string };
  title: string;
  tagline?: string;
  image?: string;
  group: { id: string; name: string; url: string };
  timezone: typeof TIMEZONE;
  doorsOpen: string;
  end: string;
  venue: { name: string; address: string };
  sponsors: SponsorOut[];
  segments: {
    id: string;
    kind: Kind;
    start: string;
    end: string;
    title: string;
    talk?: { title: string; abstract?: string; speakers: BuiltSpeaker[] };
    sponsor?: { name: string; short?: string; logo?: string };
  }[];
  links: { meetup: string; feedback: string; codeOfConduct?: string; nextEvents?: string };
  notices: string[];
};

export class PageError extends Error {}

const LEGAL = /\s+(AG|GmbH|SE|Inc\.?|Ltd\.?|LLC|plc|S\.A\.|B\.V\.|KG|OG|e\.U\.)$/i;

function sponsorMentioned(label: string, s: ParsedSponsor): boolean {
  const l = label.toLowerCase();
  const names = [s.name, s.name.replace(LEGAL, ""), s.short].filter((x): x is string => !!x && x.length >= 2);
  return names.some((n) => new RegExp(`(^|[^a-z0-9])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(l));
}

/** Kind of each agenda item, by the rules in SPEC.md. */
const NETWORKING_LABEL = /networking|entry|arrival|doors|registration|food|drinks|team form|get.?together/i;
const CLOSING_LABEL = /\bclos(e|ing)\b|thank you|ceremony|winners|wrap.?up|farewell|abschluss/i;

/**
 * Pages that do not quote their talk titles (older meetups): after the welcome
 * and the sponsor, every item that is not a break, networking or the closing
 * is a talk; "Thank you & Closing", a ceremony or the last networking slot is
 * the closing.
 */
function classifyUnquoted(agenda: AgendaLine[], sponsors: ParsedSponsor[]): Kind[] {
  const intro = (label: string) =>
    /\bwelcome\b|\bintroduction\b|\bopening\b|kick.?off|begr\u00FC\u00DFung/i.test(label) ||
    /sponsor/i.test(label) ||
    sponsors.some((s) => sponsorMentioned(label, s));
  const lastIntro = agenda.reduce((acc, a, i) => (intro(a.label) ? i : acc), -1);
  return agenda.map((a, i): Kind => {
    const label = a.label;
    if (/\bbreak\b|\bpause\b/i.test(label)) return "break";
    if (i <= lastIntro || lastIntro < 0) {
      if (/sponsor/i.test(label) || sponsors.some((s) => sponsorMentioned(label, s))) return "sponsor";
      if (intro(label)) return "welcome";
      if (lastIntro < 0 && i > 0 && !NETWORKING_LABEL.test(label) && a.end !== "open-end") return "talk";
      return a.end === "open-end" || (i === agenda.length - 1 && i > 0) ? "closing" : "networking";
    }
    if (CLOSING_LABEL.test(label) || a.end === "open-end") return "closing";
    if (NETWORKING_LABEL.test(label)) return i === agenda.length - 1 ? "closing" : "break";
    return "talk";
  });
}

export function classify(agenda: AgendaLine[], sponsors: ParsedSponsor[]): Kind[] {
  if (agenda.length > 0 && !agenda.some((a) => a.quoted)) return classifyUnquoted(agenda, sponsors);
  const talkIdx = agenda.map((a, i) => (a.quoted ? i : -1)).filter((i) => i >= 0);
  const firstTalk = talkIdx[0] ?? Infinity;
  const lastTalk = talkIdx[talkIdx.length - 1] ?? -Infinity;
  return agenda.map((a, i): Kind => {
    const label = a.label;
    if (a.quoted) return "talk";
    if (/\bbreak\b|\bpause\b/i.test(label)) return "break";
    const welcome = /\bwelcome\b|\bintroduction\b|\bopening\b|begr\u00FC\u00DFung/i.test(label) && i < firstTalk;
    if (/sponsor/i.test(label)) return "sponsor";
    if (welcome && /community|user group|meetup/i.test(label)) return "welcome";
    if (sponsors.some((s) => sponsorMentioned(label, s))) return "sponsor";
    if (welcome) return "welcome";
    if (a.end === "open-end" || i > lastTalk) return i < firstTalk && a.end !== "open-end" ? "networking" : "closing";
    if (i < firstTalk) return "networking";
    return "break";
  });
}

function segmentIds(kinds: Kind[]): string[] {
  const counts: Record<string, number> = {};
  const used = new Set<string>();
  return kinds.map((k) => {
    counts[k] = (counts[k] ?? 0) + 1;
    let id: string;
    if (k === "talk" || k === "break") id = `${k}-${counts[k]}`;
    else if (k === "networking") id = counts[k] === 1 ? "doors" : `networking-${counts[k]}`;
    else id = counts[k] === 1 ? k : `${k}-${counts[k]}`;
    while (used.has(id)) id = `${id}-x`;
    used.add(id);
    return id;
  });
}

export function localDate(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T/.exec(iso);
  if (!m) throw new PageError(`Cannot read the event date from "${iso}"`);
  return m[1]!;
}

export function addressOf(page: PageData): string | undefined {
  const fromNext = page.next?.venue?.address;
  if (fromNext) return fromNext;
  const a = page.jsonLd?.location?.address;
  if (typeof a === "string") return a;
  const street = a?.streetAddress;
  if (!street) return undefined;
  const loc = a?.addressLocality;
  return loc && street.endsWith(`, ${loc}`) && street.slice(0, -loc.length - 2).includes(loc)
    ? street.slice(0, -loc.length - 2)
    : street;
}

export function groupOf(page: PageData): BuiltEvent["group"] {
  const name = page.jsonLd?.organizer?.name ?? page.next?.group?.name;
  let url = page.jsonLd?.organizer?.url ?? page.next?.group?.link;
  if (!name || !url) throw new PageError("The page has no organizer (group name and URL)");
  if (!url.endsWith("/")) url += "/";
  const urlname = page.next?.group?.urlname ?? /meetup\.com\/([^/]+)/.exec(url)?.[1] ?? slugify(name);
  return { id: GROUP_IDS[urlname] ?? urlname, name: stripEmoji(name), url };
}

export type BuildOptions = {
  /** When the page was fetched or saved, ISO. */
  fetchedAt: string;
  /** The URL the page came from, used when the page does not name its own. */
  url?: string;
};

export function buildFromPage(page: PageData, opts: BuildOptions): BuiltEvent {
  const ld = page.jsonLd;
  const title = stripEmoji(ld?.name ?? page.next?.title ?? "");
  if (!title) throw new PageError("The page has no event name (JSON-LD Event.name)");
  const doorsOpen = ld?.startDate ?? page.next?.dateTime;
  const end = ld?.endDate ?? page.next?.endTime;
  if (!doorsOpen || !end) throw new PageError("The page has no start or end date (JSON-LD Event.startDate, endDate)");
  const meetupUrl = ld?.url ?? page.next?.eventUrl ?? opts.url;
  if (!meetupUrl) throw new PageError("The page has no event URL");

  const description = page.next?.description ?? ld?.description ?? "";
  const d: ParsedDescription = parseDescription(description);
  const date = localDate(doorsOpen);

  // A sponsor named by its web address ("eversports.at", "https://bytesource.net/de/") gets the
  // host's name from the title; a page with no sponsors block gets its hosts as sponsors.
  const hostNames = hostsFromTitle(title).length ? hostsFromTitle(title) : hostsFromDescription(stripEmoji(description));
  const urlName = (n: string) => /^(https?:\/\/|www\.)|^[a-z0-9-]+(\.[a-z0-9-]+)+\/?$/i.test(n.trim());
  const named: ParsedSponsor[] = d.sponsors.map((s) => {
    if (!urlName(s.name)) return { ...s };
    const url = s.url ?? (/^https?:/i.test(s.name) ? s.name : `https://${s.name.replace(/\/$/, "")}/`);
    const label = s.name.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[./]/)[0] ?? s.name;
    return { ...s, name: hostNames[0] ?? label.charAt(0).toUpperCase() + label.slice(1), url };
  });
  const parsedSponsors: ParsedSponsor[] = named.length ? named : hostNames.map((name) => ({ name }));
  const sponsors: SponsorOut[] = parsedSponsors.map((s) => ({ ...s }));

  const kinds = classify(d.agenda, d.sponsors);
  const ids = segmentIds(kinds);
  let dayShift = 0;
  let prevStart = -1;
  const segments: BuiltEvent["segments"] = d.agenda.map((a, i) => {
    const startMin = minutesOf(a.start);
    if (prevStart >= 0 && startMin < prevStart) dayShift += 1;
    prevStart = startMin;
    const start = zonedIso(date, a.start, TIMEZONE, dayShift);
    let segEnd: string;
    if (a.end === "open-end") segEnd = end;
    else segEnd = zonedIso(date, a.end, TIMEZONE, dayShift + (minutesOf(a.end) <= startMin ? 1 : 0));
    const label = a.quoted ? a.label.slice(1, -1).trim() : a.label;
    const seg: BuiltEvent["segments"][number] = { id: ids[i]!, kind: kinds[i]!, start, end: segEnd, title: label };
    if (seg.kind === "talk") {
      const details = d.talks.find((t) => normalizeTitle(t.title) === normalizeTitle(label));
      seg.talk = {
        title: details?.title ?? label,
        ...(details?.abstract ? { abstract: details.abstract } : {}),
        speakers: (details?.speakers ?? []).map(({ url, ...s }) => ({ ...s, ...(url ? { links: [linkOf(url)] } : {}) })),
      };
    }
    if (seg.kind === "sponsor") {
      const hit = parsedSponsors.find((s) => sponsorMentioned(label, s)) ?? (parsedSponsors.length === 1 ? parsedSponsors[0] : undefined);
      if (hit) seg.sponsor = { name: hit.name, ...(hit.short ? { short: hit.short } : {}) };
    }
    return seg;
  });

  const venueName = d.location?.name ?? ld?.location?.name ?? page.next?.venue?.name;
  const address = d.location?.address ?? addressOf(page);
  if (!venueName || !address) throw new PageError("The page has no venue name or address");

  const event: BuiltEvent = {
    version: 1,
    id: `${date}-${slugify(mainTitle(title))}`,
    source: { meetupUrl, fetchedAt: opts.fetchedAt },
    title,
    ...(d.tagline ? { tagline: d.tagline } : {}),
    ...(page.next?.image?.startsWith("https://") ? { image: page.next.image } : {}),
    group: groupOf(page),
    timezone: TIMEZONE,
    doorsOpen,
    end,
    venue: { name: plain(venueName), address: plain(address) },
    sponsors,
    segments,
    links: {
      meetup: meetupUrl,
      feedback: meetupUrl,
      ...(d.codeOfConduct ? { codeOfConduct: d.codeOfConduct } : {}),
    },
    notices: d.notices,
  };
  return event;
}

export function buildFromHtml(html: string, opts: BuildOptions): BuiltEvent {
  return buildFromPage(readPage(html), opts);
}

/** The event id a page would get: date of doors open plus a slug of the main title. */
export function eventIdFromHtml(html: string): string {
  const page = readPage(html);
  const title = stripEmoji(page.jsonLd?.name ?? page.next?.title ?? "");
  const start = page.jsonLd?.startDate ?? page.next?.dateTime;
  if (!title || !start) throw new PageError("The page has no event name or start date");
  return `${localDate(start)}-${slugify(mainTitle(title))}`;
}
