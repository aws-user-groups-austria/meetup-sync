import { describe, expect, it } from "vitest";
import { mainTitle, plain, slugify, stripEmoji } from "../src/text.ts";
import { zonedIso } from "../src/time.ts";

describe("stripEmoji", () => {
  it("removes emoji, their variation selectors and joiners, and keeps letters", () => {
    expect(stripEmoji("Autumn is arriving! \u{1F342}")).toBe("Autumn is arriving!");
    expect(stripEmoji("\u{1F5D3}\uFE0F **Agenda**")).toBe("**Agenda**");
    expect(stripEmoji("\u{1F469}\u200D\u{1F4BB} Darko Mesaroš — AWS")).toBe("Darko Mesaroš - AWS");
    expect(stripEmoji("Thanks \u{1F64C}\u{1F3FD} all")).toBe("Thanks all");
  });
});

describe("plain", () => {
  it("removes links, bold and italics", () => {
    expect(plain("**[Roman Jokel](https://x.example/),** Cloud Architect")).toBe("Roman Jokel, Cloud Architect");
    expect(plain("*About the talk:*")).toBe("About the talk:");
  });
});

describe("ids", () => {
  it("slugs the main title", () => {
    expect(mainTitle("AWS Meetup Vienna #53 - hosted by RBI")).toBe("AWS Meetup Vienna #53");
    expect(slugify("AWS Meetup Vienna #53")).toBe("aws-meetup-vienna-53");
    expect(slugify("Grüße aus München")).toBe("grusse-aus-munchen");
  });
});

describe("zonedIso", () => {
  it("uses the Vienna offset of the event date", () => {
    expect(zonedIso("2026-10-20", "18:10", "Europe/Vienna")).toBe("2026-10-20T18:10:00+02:00");
    expect(zonedIso("2026-11-17", "18:10", "Europe/Vienna")).toBe("2026-11-17T18:10:00+01:00");
    expect(zonedIso("2026-10-20", "0:30", "Europe/Vienna", 1)).toBe("2026-10-21T00:30:00+02:00");
  });
});

describe("mainTitle and hosted by", () => {
  it("drops a hosted-by part even without a space before the dash", async () => {
    const { mainTitle } = await import("../src/text.ts");
    expect(mainTitle(" AWS Meetup x Java User Group #47- hosted by TU Wien")).toBe("AWS Meetup x Java User Group #47");
    expect(mainTitle("AWS Meetup Vienna #53 - hosted by RBI")).toBe("AWS Meetup Vienna #53");
  });
});

