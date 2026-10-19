/**
 * meetup.json (SPEC.md, "meetup.json (version 1)"): the record behind the
 * website's page for one meetup. It needs no parsable agenda, so every past
 * meetup gets one; `stream` says whether an event.json exists to present.
 *
 * Also lists a group's past events from its "past events" page.
 */
import { addressOf, eventIdFromHtml, groupOf, localDate, PageError } from "./build.ts";
import { parseDescription } from "./description.ts";
import { readPage } from "./page.ts";
import { cleanHost, hostsFromDescription, hostsFromTitle } from "./hosts.ts";
import { plain, stripEmoji } from "./text.ts";

export { cleanHost, hostsFromDescription, hostsFromTitle };

export type MeetupFile = {
  version: 1;
  id: string;
  title: string;
  number?: number;
  meetupUrl: string;
  start: string;
  end?: string;
  group: { id: string; name: string; url: string };
  venue?: { name: string; address?: string };
  hosts: { name: string }[];
  image?: string;
  summary: string;
  description: string;
  talks: { title: string; speakers: { name: string; role?: string; company?: string }[] }[];
  stream: boolean;
  media?: {
    photos?: { src: string; alt?: string }[];
    slides?: { title: string; url: string; speaker?: string }[];
    recordings?: { title: string; url: string }[];
  };
};

/** The first real paragraph of the description, plain text, at most ~300 characters. */
export function summaryOf(markdown: string, fallback: string): string {
  const para = markdown
    .split(/\n\s*\n/)
    .map((p) => plain(p).trim())
    .find((p) => p.length > 40 && !/^\d{1,2}[:.]\d{2}/.test(p));
  const text = para ?? fallback;
  if (text.length <= 300) return text;
  const cut = text.slice(0, 300);
  const sentence = cut.lastIndexOf(". ");
  return sentence > 120 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}...`;
}

type EventTalks = { segments: { kind: string; talk?: { title: string; speakers: { name: string; role?: string; company?: string }[] } }[] };

export function buildMeetupRecord(
  html: string,
  opts: { url?: string; stream?: boolean; media?: MeetupFile["media"]; event?: EventTalks },
): MeetupFile {
  const page = readPage(html);
  const ld = page.jsonLd;
  const title = stripEmoji(ld?.name ?? page.next?.title ?? "").trim();
  const start = ld?.startDate ?? page.next?.dateTime;
  const meetupUrl = ld?.url ?? page.next?.eventUrl ?? opts.url;
  if (!title || !start || !meetupUrl) throw new PageError("The page has no event name, start date or URL");
  localDate(start);
  const end = ld?.endDate ?? page.next?.endTime;
  const markdown = stripEmoji(page.next?.description ?? ld?.description ?? "").trim();
  const d = parseDescription(markdown);
  const venueName = d.location?.name ?? ld?.location?.name ?? page.next?.venue?.name;
  const address = d.location?.address ?? addressOf(page);
  const number = /#\s?(\d+)/.exec(title)?.[1];
  const fromTitle = hostsFromTitle(title);
  const fromText = fromTitle.length ? [] : hostsFromDescription(markdown);
  const hostNames = fromTitle.length ? fromTitle : fromText.length ? fromText : d.sponsors.map((s) => cleanHost(s.name));
  const hosts = hostNames.map((name) => ({ name }));
  // Talks: from the description; when it has none in the known form, the agenda's talks (event.json).
  const talks = d.talks.length
    ? d.talks.map((t) => ({ title: t.title, speakers: t.speakers.map(({ name, role, company }) => ({ name, ...(role ? { role } : {}), ...(company ? { company } : {}) })) }))
    : (opts.event?.segments ?? [])
        .filter((s) => s.kind === "talk" && s.talk)
        .map((s) => ({ title: s.talk!.title, speakers: s.talk!.speakers.map(({ name, role, company }) => ({ name, ...(role ? { role } : {}), ...(company ? { company } : {}) })) }));
  const image = page.next?.image;

  const record: MeetupFile = {
    version: 1,
    id: eventIdFromHtml(html),
    title,
    ...(number ? { number: Number(number) } : {}),
    meetupUrl,
    start,
    ...(end ? { end } : {}),
    group: groupOf(page),
    ...(venueName ? { venue: { name: plain(venueName), ...(address ? { address: plain(address) } : {}) } } : {}),
    hosts,
    ...(image?.startsWith("https://") ? { image } : {}),
    summary: summaryOf(markdown, d.tagline ?? title),
    description: markdown,
    talks,
    stream: opts.stream ?? false,
    ...(opts.media ? { media: opts.media } : {}),
  };
  return record;
}

/** Past event links and start times from a group's "past events" page (newest first). */
export function pastEventsFromHtml(html: string): { url: string; start: string; title: string }[] {
  const m = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) throw new PageError("The page has no __NEXT_DATA__ (is it a Meetup past-events page?)");
  const data = JSON.parse(m[1]!) as { props?: { pageProps?: { __APOLLO_STATE__?: Record<string, Record<string, unknown>> } } };
  const apollo = data.props?.pageProps?.__APOLLO_STATE__ ?? {};
  const out: { url: string; start: string; title: string }[] = [];
  for (const [key, v] of Object.entries(apollo)) {
    if (!key.startsWith("Event:")) continue;
    const url = typeof v.eventUrl === "string" ? v.eventUrl : undefined;
    const start = typeof v.dateTime === "string" ? v.dateTime : undefined;
    if (!url || !start) continue;
    out.push({ url: url.endsWith("/") ? url : `${url}/`, start, title: typeof v.title === "string" ? v.title.trim() : "" });
  }
  const now = Date.now();
  return out.filter((e) => Date.parse(e.start) < now).sort((a, b) => b.start.localeCompare(a.start));
}
