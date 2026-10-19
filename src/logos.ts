/**
 * Shared host and sponsor logos (meetup-event-vienna/logos.json): a company's
 * name and its other spellings mapped to a file in logos/. Applied to every
 * sponsor, and the sponsor segment, that has no logo yet; source.json
 * overrides are merged afterwards and still win.
 */
import { readFile } from "node:fs/promises";
import type { BuiltEvent } from "./build.ts";
import { cleanHost } from "./hosts.ts";

export type LogoEntry = { name: string; aliases?: string[]; logo: string };

export async function loadLogos(path: string): Promise<LogoEntry[]> {
  const data: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(data)) throw new Error(`${path}: expected a JSON array of { name, aliases, logo }`);
  return data as LogoEntry[];
}

/** Name for matching: no legal form, no punctuation, lower case. */
export const logoKey = (s: string) => cleanHost(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

export function findLogo(list: LogoEntry[], ...names: (string | undefined)[]): string | undefined {
  const keys = names.filter((n): n is string => Boolean(n)).map(logoKey);
  return list.find((e) => [e.name, ...(e.aliases ?? [])].some((n) => keys.includes(logoKey(n))))?.logo;
}

export function applyLogos(event: BuiltEvent, list: LogoEntry[]): BuiltEvent {
  for (const s of event.sponsors) {
    if (!s.logo) {
      const logo = findLogo(list, s.name, s.short);
      if (logo) s.logo = logo;
    }
  }
  for (const seg of event.segments) {
    if (seg.sponsor && !seg.sponsor.logo) {
      const logo = findLogo(list, seg.sponsor.name, seg.sponsor.short);
      if (logo) seg.sponsor.logo = logo;
    }
  }
  return event;
}
