/**
 * Sessionize as a second source: speaker photos, taglines and talk abstracts
 * from the event's Sessionize API endpoint, https://sessionize.com/api/v2/<endpoint id>/view/...
 * Both endpoint formats work: JSON ("All Data", view/All) and the embed
 * (the script for a web page, whose content is HTML at view/Speakers?under=True:
 * names, taglines, bios, photos and talk titles, no abstracts or links).
 *
 * The Meetup page stays the source of the agenda. Sessionize only fills what
 * the page left empty, matched by talk title and speaker name (accents and
 * case ignored): a speaker's photo, a role when the page gave none, a bio and
 * profile links (JSON only) when the speaker has none, a talk's
 * abstract, and the speakers of a talk the page listed without any.
 * source.json overrides are merged after this, so they still win.
 */
import { readFile } from "node:fs/promises";
import type { BuiltEvent } from "./build.ts";
import { normalizeTitle, plain } from "./text.ts";

export type SessionizeSpeaker = {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  tagLine?: string | null;
  bio?: string | null;
  profilePicture?: string | null;
  links?: { title?: string; url?: string; linkType?: string }[];
  sessions?: (string | number)[];
};

export type SessionizeSession = {
  id: string | number;
  title?: string;
  description?: string | null;
  speakers?: (string | { id: string })[];
};

export type SessionizeAll = { sessions?: SessionizeSession[]; speakers?: SessionizeSpeaker[] };

const isUrl = (s: string) => /^https?:\/\//i.test(s);
const isEndpointId = (s: string) => /^[a-z0-9]{6,}$/i.test(s);

/** The view/All URL for a Sessionize API endpoint id. */
export const sessionizeAllUrl = (id: string) => `https://sessionize.com/api/v2/${encodeURIComponent(id)}/view/All`;

async function get(url: string): Promise<{ text: string; type: string }> {
  const res = await fetch(url, { headers: { Accept: "application/json, text/html" } }).catch((err: unknown) => {
    throw new Error(`Fetching Sessionize failed (${err instanceof Error ? err.message : String(err)}).`);
  });
  if (!res.ok) throw new Error(`Fetching Sessionize failed: HTTP ${res.status} ${res.statusText}`);
  return { text: await res.text(), type: res.headers.get("content-type") ?? "" };
}

/** The HTML an embed endpoint renders: the script fetches it from `?under=True`. */
export const embedHtmlUrl = (url: string) => {
  const u = new URL(url);
  u.searchParams.set("under", "True");
  return u.href;
};

/**
 * Loads Sessionize data from an endpoint id (view/Speakers), a URL, or a saved
 * file (JSON, or the embed's HTML).
 */
export async function loadSessionize(src: string): Promise<SessionizeAll> {
  let text: string;
  if (isUrl(src) || isEndpointId(src)) {
    const url = isUrl(src) ? src : `https://sessionize.com/api/v2/${encodeURIComponent(src)}/view/Speakers`;
    const first = await get(url);
    text = /javascript/i.test(first.type) || first.text.trimStart().startsWith("document.write")
      ? (await get(embedHtmlUrl(url))).text
      : first.text;
  } else {
    text = await readFile(src, "utf8");
  }
  if (text.trimStart().startsWith("<")) return parseEmbedHtml(text);
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data) || !("sessions" in data || "speakers" in data)) {
    throw new Error(`${src}: not Sessionize data (expected the view/All JSON or the embed HTML)`);
  }
  return data as SessionizeAll;
}

const decode = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Like decode, but keeps paragraphs: <br><br> becomes a blank line. */
const decodeText = (s: string) =>
  s
    .split(/(?:<br\s*\/?>\s*){2,}/i)
    .map(decode)
    .filter(Boolean)
    .join("\n\n");

/** The embed's speaker list (`li.sz-speaker`) as Sessionize data. */
export function parseEmbedHtml(html: string): SessionizeAll {
  const speakers: SessionizeSpeaker[] = [];
  const sessions = new Map<string, SessionizeSession>();
  const blocks = html.split(/<li\b[^>]*\bdata-speakerid="/).slice(1);
  for (const block of blocks) {
    const id = block.slice(0, block.indexOf('"'));
    const name = /class="sz-speaker__name"[^>]*>([\s\S]*?)<\/h3>/.exec(block)?.[1];
    if (!id || !name) continue;
    const tagLine = /class="sz-speaker__tagline"[^>]*>([\s\S]*?)<\/h4>/.exec(block)?.[1];
    const bio = /class="sz-speaker__bio"[^>]*>([\s\S]*?)<\/p>/.exec(block)?.[1];
    const photo = /class="sz-speaker__photo"[\s\S]*?<img[^>]*\bsrc="([^"]+)"/.exec(block)?.[1];
    const own: string[] = [];
    for (const m of block.matchAll(/<li\b[^>]*\bdata-sessionid="([^"]+)"[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
      const sid = m[1]!;
      own.push(sid);
      const s = sessions.get(sid) ?? { id: sid, title: decode(m[2]!), speakers: [] };
      s.speakers!.push(id);
      sessions.set(sid, s);
    }
    speakers.push({
      id,
      fullName: decode(name),
      ...(tagLine ? { tagLine: decode(tagLine) } : {}),
      ...(bio && decodeText(bio) ? { bio: decodeText(bio) } : {}),
      ...(photo ? { profilePicture: decode(photo) } : {}),
      sessions: own,
    });
  }
  return { sessions: [...sessions.values()], speakers };
}

/** Name for matching: no accents, lower case, single spaces. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const fullName = (s: SessionizeSpeaker) => s.fullName ?? [s.firstName, s.lastName].filter(Boolean).join(" ");
const speakerIds = (s: SessionizeSession) => (s.speakers ?? []).map((x) => (typeof x === "string" ? x : x.id));
const httpsOnly = (u: string | null | undefined) => (u && /^https:\/\//i.test(u) ? u : undefined);

type Profiled = { bio?: string; links?: { title: string; url: string }[] };

/** A speaker's bio and links from Sessionize, where the speaker has none. */
function fillProfile(sp: Profiled, hit: SessionizeSpeaker) {
  if (!sp.bio && hit.bio?.trim()) sp.bio = hit.bio.trim();
  const links = (hit.links ?? [])
    .filter((l) => httpsOnly(l.url))
    .map((l) => ({ title: (l.title || l.linkType || "Website").trim(), url: l.url! }));
  for (const l of links) {
    if (!(sp.links ?? []).some((x) => x.url.replace(/\/$/, "") === l.url.replace(/\/$/, ""))) (sp.links ??= []).push(l);
  }
}

/** Fills the gaps of a built event from Sessionize. Returns the event (changed in place) and warnings. */
export function applySessionize(event: BuiltEvent, data: SessionizeAll): { event: BuiltEvent; warnings: string[] } {
  const warnings: string[] = [];
  const sessions = data.sessions ?? [];
  const speakers = data.speakers ?? [];
  const byId = new Map(speakers.map((s) => [s.id, s]));

  for (const seg of event.segments) {
    if (seg.kind !== "talk" || !seg.talk) continue;
    const session = sessions.find((s) => s.title && normalizeTitle(s.title) === normalizeTitle(seg.talk!.title));
    if (!session) {
      // The talk is not on Sessionize: its speakers may still be, from another talk.
      let found = 0;
      for (const sp of seg.talk.speakers) {
        const hit = speakers.find((s) => normalizeName(fullName(s)) === normalizeName(sp.name));
        const photo = httpsOnly(hit?.profilePicture);
        if (hit && !sp.photo && photo) sp.photo = photo;
        if (hit) {
          fillProfile(sp, hit);
          found++;
        }
      }
      if (!found) warnings.push(`Sessionize has no session titled "${seg.talk.title}"`);
      continue;
    }
    if (!seg.talk.abstract && session.description) seg.talk.abstract = plain(session.description);
    const own = speakerIds(session)
      .map((id) => byId.get(id))
      .filter((s): s is SessionizeSpeaker => Boolean(s));

    if (seg.talk.speakers.length === 0) {
      seg.talk.speakers = own.map((s) => ({
        name: fullName(s),
        ...(s.tagLine ? { role: plain(s.tagLine) } : {}),
        ...(httpsOnly(s.profilePicture) ? { photo: httpsOnly(s.profilePicture) } : {}),
        ...(s.bio?.trim() ? { bio: s.bio.trim() } : {}),
      }));
      continue;
    }
    for (const sp of seg.talk.speakers) {
      const hit =
        own.find((s) => normalizeName(fullName(s)) === normalizeName(sp.name)) ??
        speakers.find((s) => normalizeName(fullName(s)) === normalizeName(sp.name));
      if (!hit) {
        warnings.push(`Sessionize has no speaker "${sp.name}"`);
        continue;
      }
      const photo = httpsOnly(hit.profilePicture);
      if (!sp.photo && photo) sp.photo = photo;
      if (!sp.role && !sp.company && hit.tagLine) sp.role = plain(hit.tagLine);
      fillProfile(sp, hit);
    }
  }
  return { event, warnings };
}
