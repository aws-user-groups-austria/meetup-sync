/**
 * Parses the event description markdown: agenda lines, talks with speakers
 * and abstracts, sponsors, notices, the Location block and the Code of
 * Conduct link. Every value returned is text from the description, with
 * markdown and emoji removed; nothing is made up.
 */
import { LINK, isQuoted, normalizeTitle, plain, stripEmoji, stripMarkdown, unquote } from "./text.ts";

export type AgendaLine = {
  start: string; // HH:MM
  end: string | "open-end"; // HH:MM or "open-end"
  label: string; // markdown removed, quotes kept
  quoted: boolean; // the label is one quoted title: a talk
};

export type ParsedSpeaker = { name: string; role?: string; company?: string; url?: string };
export type ParsedTalk = { title: string; abstract?: string; speakers: ParsedSpeaker[] };
export type ParsedSponsor = { name: string; short?: string; url?: string };

export type ParsedDescription = {
  tagline?: string;
  location?: { name?: string; address?: string };
  agenda: AgendaLine[];
  talks: ParsedTalk[];
  sponsors: ParsedSponsor[];
  notices: string[];
  codeOfConduct?: string;
};

const TIME = String.raw`(\d{1,2}[:.]\d{2})`;
const DASH = String.raw`\s*(?:-|\u2013|\u2014|to|bis)\s*`;
const AGENDA = new RegExp(String.raw`^${TIME}(?:\s*(?:h|Uhr))?${DASH}(?:${TIME}(?:\s*(?:h|Uhr))?|(open\s*end))\s*:?\s*(.*)$`, "i");

/**
 * One agenda line, e.g. `* **18:10 - 18:50:** **"Title"**` or `20:00 - Open End: Networking`.
 * Returns undefined for lines that are not agenda items.
 */
export function parseAgendaLine(line: string): AgendaLine | undefined {
  const text = plain(line);
  const m = AGENDA.exec(text);
  if (!m) return undefined;
  const label = (m[4] ?? "").replace(/^[:\s\u2013\u2014-]+/, "").trim();
  if (!label) return undefined;
  const norm = (t: string) => t.replace(".", ":").padStart(5, "0");
  return {
    start: norm(m[1]!),
    end: m[2] ? norm(m[2]) : "open-end",
    label,
    quoted: isQuoted(label),
  };
}

/** Splits "Role (Company)", "Role@Company", "Role at Company" or "Role, Company". */
function roleAndCompany(rest: string): { role?: string; company?: string } {
  const r = rest.trim();
  if (!r) return {};
  const tries: RegExp[] = [/^(.*?)\s*\(([^()]+)\)\s*$/, /^(.*?)\s*@\s*(.+)$/, /^(.*?)\s+at\s+(.+)$/i, /^(.*?),\s*(.+)$/];
  for (const re of tries) {
    const m = re.exec(r);
    if (m) {
      const role = m[1]!.trim().replace(/[,\s]+$/, "");
      const company = m[2]!.trim();
      return { ...(role ? { role } : {}), ...(company ? { company } : {}) };
    }
  }
  return { role: r };
}

const SPEAKER_MARK = /^\s*\**\s*_?\s*speakers?\s*:?\s*_?\s*\**\s*:?\s*/i;

/**
 * One speaker line. Both forms on Meetup pages parse:
 * `**[Roman Jokel](url),** Cloud Architect (Raiffeisen Bank International)` and
 * `[Darko Mesaroš](url) Principal Technologist@AWS`, with or without the link,
 * and with or without a leading `*Speaker:*`.
 */
export function parseSpeakerLine(line: string): ParsedSpeaker | undefined {
  let raw = line.replace(/^\s*[*+-]\s+(?=\S)/, "").replace(/^\s*by\s+(?=\S)/i, "");
  const marker = /^\s*\*?_?(speakers?)\s*:?\s*_?\*?\s*:?\s*/i.exec(raw);
  if (marker && /speakers?/i.test(marker[1] ?? "")) raw = raw.slice(marker[0].length);
  if (!plain(raw)) return undefined;

  let name: string;
  let rest: string;
  const link = new RegExp(LINK.source).exec(raw);
  let url: string | undefined;
  if (link) {
    name = plain(link[1] ?? "");
    rest = plain(raw.slice(link.index + link[0].length));
    if (/^https?:\/\//.test(link[2] ?? "")) url = link[2];
  } else {
    const text = plain(raw).replace(/^(?:by|speakers?\s*:)\s*/i, "");
    const sep = /\s*(?:,|\s[-\u2013\u2014|]\s)\s*/.exec(text);
    if (sep) {
      name = text.slice(0, sep.index).trim();
      rest = text.slice(sep.index + sep[0].length);
    } else {
      const words = text.split(" ");
      name = words.slice(0, 2).join(" ");
      rest = words.slice(2).join(" ");
    }
  }
  rest = rest.replace(/^[\s,:;|\u2013\u2014-]+/, "").trim();
  if (!name) return undefined;
  return { name, ...roleAndCompany(rest), ...(url ? { url } : {}) };
}

const HR = /^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;

function heading(line: string): string {
  return plain(line).replace(/:$/, "").trim().toLowerCase();
}

/** Splits markdown into paragraphs (runs of non-blank lines). */
function paragraphs(lines: string[]): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (!l.trim() || HR.test(l)) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}

function parseSponsorItem(line: string): ParsedSponsor | undefined {
  const raw = line.replace(/^\s*[*+-]\s+/, "");
  const parts = raw.split(/\s+[-\u2013\u2014|]\s+/);
  let name: string | undefined;
  let url: string | undefined;
  const others: string[] = [];
  for (const part of parts) {
    const link = new RegExp(LINK.source).exec(part);
    if (link && !name) {
      name = plain(link[1] ?? "");
      url = link[2];
    } else others.push(plain(part));
  }
  if (!name) {
    name = others.pop();
  }
  if (!name) return undefined;
  const short = others.find((o) => o && o !== name && o.length < name.length);
  return { name, ...(short ? { short } : {}), ...(url && /^https?:\/\//.test(url) ? { url } : {}) };
}

function mergeSponsor(list: ParsedSponsor[], s: ParsedSponsor) {
  const key = (x: string) => x.toLowerCase();
  const hit = list.find((x) => key(x.name) === key(s.name) || (x.short && key(x.short) === key(s.name)) || (s.short && key(s.short) === key(x.name)));
  if (!hit) {
    list.push(s);
    return;
  }
  if (!hit.short && s.short) hit.short = s.short;
  if (!hit.url && s.url) hit.url = s.url;
}

/** Meetup's editor escapes punctuation (`\,` `\|` `\-`); the text means the plain character. */
export function unescapeMarkdown(text: string): string {
  return text.replace(/\\([,|\-.!()#+=~>&])/g, "$1");
}

/**
 * Several speakers on one line: `Speakers: [A](url), [B](url) and [C](url)`.
 * Returns one speaker per link when the line is only links and separators;
 * otherwise the one speaker parseSpeakerLine finds.
 */
export function parseSpeakersLine(line: string): ParsedSpeaker[] {
  const raw = line.replace(/^\s*[*+-]\s+(?=\S)/, "").replace(/^\s*\*?_?speakers?\s*:?\s*_?\*?\s*:?\s*/i, "");
  const names = plain(raw.replace(new RegExp(LINK.source, "g"), (_m, text: string) => text))
    .split(/\s*,\s*|\s+(?:and|und|&)\s+/i)
    .map((n) => n.trim())
    .filter(Boolean);
  const looksLikeName = (n: string) => /^\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+){1,3}$/u.test(n);
  if (names.length >= 2 && names.every(looksLikeName)) {
    const urls = new Map([...raw.matchAll(new RegExp(LINK.source, "g"))].map((m) => [plain(m[1] ?? ""), m[2] ?? ""]));
    return names.map((name) => {
      const url = urls.get(name);
      return { name, ...(url && /^https?:\/\//.test(url) ? { url } : {}) };
    });
  }
  const one = parseSpeakerLine(line);
  return one ? [one] : [];
}

/**
 * Agenda items written on one line ("18:00 - 18:05: Welcome 18:05 - 18:10: Sponsors ...",
 * as on the #52 page) are put on lines of their own, so each one parses.
 */
export function splitRunOnAgenda(text: string): string {
  return text.replace(
    /([^\s*+\u2022-])[ \t]+(?=\*{0,2}\d{1,2}[:.]\d{2}\s*(?:-|\u2013|\u2014|to|bis)\s*(?:\d{1,2}[:.]\d{2}|open\s*end)\b)/gi,
    "$1\n",
  );
}

export function parseDescription(markdown: string): ParsedDescription {
  const lines = splitRunOnAgenda(unescapeMarkdown(markdown.replace(/\r\n?/g, "\n"))).split("\n");
  const result: ParsedDescription = { agenda: [], talks: [], sponsors: [], notices: [] };
  const paras = paragraphs(lines);

  // Tagline: the first paragraph.
  const first = paras[0];
  if (first) {
    const t = plain(first.join(" "));
    if (t) result.tagline = t;
  }

  // Location block: a "Location" heading line, then name and address lines.
  const locIdx = lines.findIndex((l) => heading(l) === "location");
  if (locIdx >= 0) {
    const block: string[] = [];
    for (let i = locIdx + 1; i < lines.length; i++) {
      const l = lines[i]!;
      if (!l.trim() || HR.test(l)) break;
      block.push(plain(l));
    }
    const filled = block.filter(Boolean);
    if (filled.length >= 2) result.location = { name: filled[0]!, address: filled.slice(1).join(", ") };
    else if (filled.length === 1) result.location = /\d/.test(filled[0]!) ? { address: filled[0]! } : { name: filled[0]! };
  }

  // Agenda: lines inside the "Agenda" section, or any agenda-shaped line when there is no such heading.
  const agIdx = lines.findIndex((l) => heading(l) === "agenda");
  const agendaLines: string[] = [];
  if (agIdx >= 0) {
    let seen = false;
    for (let i = agIdx + 1; i < lines.length; i++) {
      const l = lines[i]!;
      if (HR.test(l)) break;
      const item = parseAgendaLine(l);
      if (item) {
        agendaLines.push(l);
        seen = true;
      } else if (seen && l.trim()) break;
    }
  } else {
    for (const l of lines) if (parseAgendaLine(l)) agendaLines.push(l);
  }
  result.agenda = agendaLines.map((l) => parseAgendaLine(l)!);

  // Talks: a line that is only a quoted title (outside the agenda), then Speaker(s): and About the talk:.
  const agendaSet = new Set(agendaLines);
  const talkStarts: number[] = [];
  lines.forEach((l, i) => {
    if (!agendaSet.has(l) && isQuoted(plain(l)) && !parseAgendaLine(l)) talkStarts.push(i);
  });
  talkStarts.forEach((startIdx, n) => {
    const stop = talkStarts[n + 1] ?? lines.length;
    const body: string[] = [];
    for (let i = startIdx + 1; i < stop; i++) {
      if (HR.test(lines[i]!)) break;
      body.push(lines[i]!);
    }
    const talk: ParsedTalk = { title: unquote(plain(lines[startIdx]!)), speakers: [] };
    let mode: "none" | "speakers" | "about" = "none";
    const about: string[] = [];
    const loose: string[] = [];
    for (const l of body) {
      const p = plain(l);
      if (SPEAKER_MARK.test(l) && /^speakers?\s*:?/i.test(p)) {
        mode = "speakers";
        talk.speakers.push(...parseSpeakersLine(l));
        continue;
      }
      if (mode === "none" && talk.speakers.length === 0 && /^by\s+\S/i.test(p)) {
        talk.speakers.push(...parseSpeakersLine(l));
        continue;
      }
      if (/^(about( the)? talk|abstract|description)\s*:?$/i.test(p)) {
        mode = "about";
        continue;
      }
      if (mode === "speakers") {
        if (!p) {
          mode = "none";
          continue;
        }
        talk.speakers.push(...parseSpeakersLine(l));
      } else if (mode === "about") about.push(l);
      else loose.push(l);
    }
    const abstractSrc = about.length ? about : loose;
    const abstract = paragraphs(abstractSrc)
      .map((p) => plain(p.join(" ")))
      .filter(Boolean)
      .join("\n\n");
    if (abstract) talk.abstract = abstract;
    result.talks.push(talk);
  });

  // Sponsors: the "Sponsors:" block, and "thank you to X for supporting" lines.
  const spIdx = lines.findIndex((l) => /^sponsors?( and partners)?$/.test(heading(l)));
  if (spIdx >= 0) {
    let seen = false;
    for (let i = spIdx + 1; i < lines.length; i++) {
      const l = lines[i]!;
      if (HR.test(l)) break;
      if (!l.trim()) {
        if (seen) break;
        continue;
      }
      const s = parseSponsorItem(l);
      if (s) {
        mergeSponsor(result.sponsors, s);
        seen = true;
      }
    }
  }
  const THANKS = /thank(?:s| you)\s+to\s+(.+?)\s+for\s+(?:supporting|sponsoring|hosting)/gi;
  for (const para of paras) {
    const text = para.join(" ");
    for (let m = THANKS.exec(text); m; m = THANKS.exec(text)) {
      const who = m[1]!;
      const link = new RegExp(LINK.source).exec(who);
      const name = link ? plain(link[1] ?? "") : plain(who);
      if (name) mergeSponsor(result.sponsors, { name, ...(link?.[2] && /^https?:\/\//.test(link[2]) ? { url: link[2] } : {}) });
    }
  }

  // Notices: the photo and video line, verbatim (one line: on Meetup it shares a
  // paragraph with the Code of Conduct sentence, which is a link, not a notice).
  for (const l of lines) {
    const t = plain(l);
    if (/photo/i.test(t) && /(video|record|film)/i.test(t)) result.notices.push(t);
  }

  // Code of Conduct link.
  for (const m of markdown.matchAll(LINK)) {
    if (/code of conduct/i.test(m[1] ?? "") && /^https?:\/\//.test(m[2] ?? "")) {
      result.codeOfConduct = m[2];
      break;
    }
  }

  return result;
}

export { normalizeTitle, stripEmoji, stripMarkdown };
