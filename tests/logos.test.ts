import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFromHtml } from "../src/build.ts";
import { applyLogos, findLogo, logoKey, type LogoEntry } from "../src/logos.ts";
import { syncHtml } from "../src/sync.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/aws-meetup-vienna-53.html", import.meta.url)), "utf8");
const LOGOS: LogoEntry[] = [
  { name: "Raiffeisen Bank International", aliases: ["RBI"], logo: "logos/rbi.svg" },
  { name: "ByteSource", aliases: ["bytesource.net"], logo: "logos/bytesource.svg" },
];

describe("shared logos", () => {
  it("matches names without legal forms, case or punctuation", () => {
    expect(logoKey("Raiffeisen Bank International AG")).toBe(logoKey("raiffeisen bank international"));
    expect(findLogo(LOGOS, "Bytesource")).toBe("logos/bytesource.svg");
    expect(findLogo(LOGOS, "Someone Else")).toBeUndefined();
  });

  it("gives the sponsor and the sponsor segment their logo", () => {
    const e = applyLogos(buildFromHtml(html, { fetchedAt: "2026-10-16T12:00:00.000Z" }), LOGOS);
    expect(e.sponsors[0]!.logo).toBe("logos/rbi.svg");
    expect(e.segments.find((s) => s.kind === "sponsor")!.sponsor!.logo).toBe("logos/rbi.svg");
  });

  it("lets an override still win", () => {
    const overrides = { sponsors: [{ name: "Raiffeisen Bank International AG", logo: "events/x/assets/own.svg" }] };
    const { event } = syncHtml({ html, fetchedAt: "2026-10-16T12:00:00.000Z" }, overrides, undefined, undefined, LOGOS);
    expect(event.sponsors[0]!.logo).toBe("events/x/assets/own.svg");
  });
});
