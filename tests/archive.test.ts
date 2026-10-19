import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildMeetupRecord, hostsFromTitle, pastEventsFromHtml, summaryOf } from "../src/archive.ts";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("meetup.json, the website record", () => {
  const record = buildMeetupRecord(fixture("aws-meetup-vienna-53.html"), { stream: true });

  it("has the facts of the page", () => {
    expect(record).toMatchObject({
      version: 1,
      id: "2026-10-20-aws-meetup-vienna-53",
      title: "AWS Meetup Vienna #53 - hosted by RBI",
      number: 53,
      meetupUrl: "https://www.meetup.com/amazon-web-services-aws-vienna/events/316893745/",
      start: "2026-10-20T17:00:00+02:00",
      end: "2026-10-20T22:00:00+02:00",
      venue: { name: "Raiffeisen Bank International", address: "Mooslackengasse 12, 1190 Wien, Austria" },
      hosts: [{ name: "RBI" }],
      image: "https://secure.meetupstatic.com/photos/event/c/d/4/8/highres_536512552.jpeg",
      stream: true,
    });
    expect(record.group.id).toBe("aws-ug-vienna");
  });

  it("lists the talks with their speakers", () => {
    expect(record.talks.map((t) => [t.title, t.speakers.map((s) => s.name)])).toEqual([
      ["Teaching an AI to Debug Our Cloud: AWS DevOps Agent in Practice", ["Roman Jokel", "Mladen Trampic"]],
      ["I don't trust my agents!", ["Darko Mesaroš"]],
    ]);
  });

  it("has a plain summary for the meta description and the markdown description without emoji", () => {
    expect(record.summary.length).toBeGreaterThan(40);
    expect(record.summary.length).toBeLessThanOrEqual(303);
    expect(record.summary).not.toMatch(/[*_#[\]]/);
    expect(record.description).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(record.description).toContain("Teaching an AI to Debug Our Cloud");
  });
});

describe("hosts and summary", () => {
  it("reads hosts from the title", () => {
    expect(hostsFromTitle("AWS Meetup Vienna #52 - hosted by Enspired")).toEqual(["Enspired"]);
    expect(hostsFromTitle("AWS Meetup x Java User Group #47- hosted by TU Wien")).toEqual(["TU Wien"]);
    expect(hostsFromTitle("Meetup hosted by A & B")).toEqual(["A", "B"]);
    expect(hostsFromTitle("AWS User Group Vienna presents: Agentic Football Cup 2026")).toEqual([]);
  });

  it("cuts a long summary at a sentence or a word", () => {
    const long = `${"A sentence that is long enough to count. ".repeat(10)}`;
    const s = summaryOf(long, "x");
    expect(s.length).toBeLessThanOrEqual(300);
    expect(s.endsWith(".")).toBe(true);
    expect(summaryOf("", "Fallback title")).toBe("Fallback title");
  });
});

describe("past events page", () => {
  it("lists past events newest first, with a trailing slash, future ones dropped", () => {
    expect(pastEventsFromHtml(fixture("past-events.sample.html"))).toEqual([
      { url: "https://www.meetup.com/amazon-web-services-aws-vienna/events/316357405/", start: "2026-09-28T17:00:00+02:00", title: "AWS Meetup Vienna #52 - hosted by Enspired" },
      { url: "https://www.meetup.com/amazon-web-services-aws-vienna/events/307421627/", start: "2025-05-07T17:00:00+02:00", title: "AWS Meetup #46 & Workshop - hosted by ByteSource" },
    ]);
  });
});

describe("sponsors named by their web address", () => {
  it("take the host's name from the title", async () => {
    const { buildFromHtml } = await import("../src/build.ts");
    const page = fixture("aws-meetup-vienna-53.html").replace(
      "Raiffeisen Bank International AG](https://www.rbinternational.com/de/raiffeisen.html)",
      "https://www.rbinternational.com/de/raiffeisen.html](https://www.rbinternational.com/de/raiffeisen.html)",
    );
    const e = buildFromHtml(page, { fetchedAt: "2026-10-16T12:00:00.000Z" });
    expect(e.sponsors.map((s) => s.name)).not.toContain("https://www.rbinternational.com/de/raiffeisen.html");
  });
});
