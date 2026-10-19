/**
 * Reads the two machine-readable parts of a Meetup event page: the JSON-LD
 * `Event` and the Next.js `__NEXT_DATA__` payload (which carries the event
 * description as markdown, and the venue and group records).
 */

export type JsonLdEvent = {
  name?: string;
  url?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: {
    name?: string;
    address?: { streetAddress?: string; addressLocality?: string; addressCountry?: string } | string;
  };
  organizer?: { name?: string; url?: string };
};

export type NextEvent = {
  title?: string;
  description?: string;
  eventUrl?: string;
  dateTime?: string;
  endTime?: string;
  /** The featured event photo, full size: the header image the organizers uploaded. */
  image?: string;
  venue?: { name?: string; address?: string; city?: string };
  group?: { name?: string; urlname?: string; link?: string; timezone?: string };
};

export type PageData = { jsonLd: JsonLdEvent | undefined; next: NextEvent | undefined };

function scripts(html: string, match: RegExp): string[] {
  const out: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (match.test(m[1] ?? "")) out.push(m[2] ?? "");
  }
  return out;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
}

function isType(node: unknown, type: string): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const t = (node as Record<string, unknown>)["@type"];
  return asArray(t).includes(type);
}

/** The first JSON-LD node of type Event (also inside arrays and @graph). */
export function extractJsonLdEvent(html: string): JsonLdEvent | undefined {
  for (const body of scripts(html, /type=["']application\/ld\+json["']/i)) {
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      continue;
    }
    const nodes = asArray(data).flatMap((n) => [n, ...asArray((n as Record<string, unknown> | null)?.["@graph"])]);
    const ev = nodes.find((n) => isType(n, "Event"));
    if (ev) return ev as JsonLdEvent;
  }
  return undefined;
}

type Apollo = Record<string, Record<string, unknown>>;

function deref(apollo: Apollo, v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const ref = (v as { __ref?: unknown }).__ref;
  if (typeof ref === "string") return apollo[ref];
  return v as Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** The event record from __NEXT_DATA__ (pageProps.event, with venue and group resolved from the Apollo cache). */
export function extractNextEvent(html: string): NextEvent | undefined {
  const [body] = scripts(html, /id=["']__NEXT_DATA__["']/i);
  if (!body) return undefined;
  let data: { props?: { pageProps?: { event?: Record<string, unknown>; __APOLLO_STATE__?: Apollo } } };
  try {
    data = JSON.parse(body);
  } catch {
    return undefined;
  }
  const pageProps = data.props?.pageProps ?? {};
  const apollo: Apollo = pageProps.__APOLLO_STATE__ ?? {};
  let ev: Record<string, unknown> | undefined = pageProps.event;
  if (!ev) ev = Object.entries(apollo).find(([k]) => k.startsWith("Event:"))?.[1];
  if (!ev) return undefined;
  const venue = deref(apollo, ev.venue);
  const group = deref(apollo, ev.group);
  const photo = deref(apollo, ev.featuredEventPhoto);
  return {
    title: str(ev.title),
    description: str(ev.description),
    eventUrl: str(ev.eventUrl),
    dateTime: str(ev.dateTime),
    endTime: str(ev.endTime),
    image: str(photo?.source),
    venue: venue ? { name: str(venue.name), address: str(venue.address), city: str(venue.city) } : undefined,
    group: group
      ? { name: str(group.name), urlname: str(group.urlname), link: str(group.link), timezone: str(group.timezone) }
      : undefined,
  };
}

export function readPage(html: string): PageData {
  return { jsonLd: extractJsonLdEvent(html), next: extractNextEvent(html) };
}
