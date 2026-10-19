import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eventSchema } from "../src/event.schema.ts";
import { syncHtml, upcomingAfter } from "../src/sync.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/aws-meetup-vienna-53.html", import.meta.url)), "utf8");
const LIST = [
  { name: "Switzerland", date: "2026-10-29", location: "Zurich", url: "https://example.org/ch" },
  { name: "Malta", date: "2026-10-15", endDate: "2026-10-16", location: "Malta", url: "https://example.org/mt" },
  { name: "Adria", date: "2026-10-22", location: "Ljubljana", url: "https://example.org/si", speakers: [{ name: "Linda Mohamed", photo: "people/linda-mohamed.png" }] },
  { name: "Same day", date: "2026-10-20", location: "Vienna", url: "https://example.org/at" },
];

describe("upcoming community days", () => {
  it("keeps those after the meetup's day, soonest first", () => {
    expect(upcomingAfter(LIST, "2026-10-20T17:00:00+02:00").map((u) => u.name)).toEqual(["Adria", "Switzerland"]);
  });

  it("uses the Vienna date, not UTC", () => {
    // 00:30 in Vienna on the 22nd is still the 21st in UTC
    expect(upcomingAfter(LIST, "2026-10-22T00:30:00+02:00").map((u) => u.name)).toEqual(["Switzerland"]);
  });

  it("caps at three", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ name: `d${i}`, date: `2026-11-0${i + 1}`, location: "x", url: "https://example.org" }));
    expect(upcomingAfter(many, "2026-10-20T17:00:00+02:00")).toHaveLength(3);
  });

  it("lands in event.json and validates", () => {
    const { event } = syncHtml({ html, fetchedAt: "2026-10-16T12:00:00.000Z" }, {}, undefined, LIST);
    expect(eventSchema.safeParse(event).success).toBe(true);
    expect(event.upcoming?.map((u) => u.name)).toEqual(["Adria", "Switzerland"]);
    expect(event.upcoming?.[0]?.speakers?.[0]?.photo).toBe("people/linda-mohamed.png");
  });

  it("leaves upcoming out when nothing is coming", () => {
    const { event } = syncHtml({ html, fetchedAt: "2026-10-16T12:00:00.000Z" }, {}, undefined, []);
    expect(event.upcoming).toBeUndefined();
  });
});
