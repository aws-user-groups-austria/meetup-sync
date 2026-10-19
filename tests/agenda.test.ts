import { describe, expect, it } from "vitest";
import { classify } from "../src/build.ts";
import { parseAgendaLine } from "../src/description.ts";

describe("parseAgendaLine", () => {
  it("reads a bold markdown line with a hyphen", () => {
    expect(parseAgendaLine("* **17:00 - 18:00:** Entry & Networking")).toEqual({
      start: "17:00",
      end: "18:00",
      label: "Entry & Networking",
      quoted: false,
    });
  });

  it("reads an en dash and Open End", () => {
    expect(parseAgendaLine("* **20:00 – Open End:** Networking")).toEqual({
      start: "20:00",
      end: "open-end",
      label: "Networking",
      quoted: false,
    });
    expect(parseAgendaLine("20:00 – Open End: Networking")).toMatchObject({ end: "open-end", label: "Networking" });
  });

  it("reads an en dash between two times", () => {
    expect(parseAgendaLine("18:50 – 19:20: Networking break")).toMatchObject({ start: "18:50", end: "19:20" });
  });

  it("marks a quoted title as a talk and keeps the quotes in the label", () => {
    expect(parseAgendaLine('* **19:20 - 20:00:** **"I don\'t trust my agents!"**')).toEqual({
      start: "19:20",
      end: "20:00",
      label: '"I don\'t trust my agents!"',
      quoted: true,
    });
    expect(parseAgendaLine("18:10 - 18:50: “A curly quoted talk”")).toMatchObject({ quoted: true });
  });

  it("removes markdown inside the label", () => {
    expect(parseAgendaLine("* **18:05 - 18:10:** Welcome and Introduction to the sponsors (**Raiffeisen Bank International**)")?.label).toBe(
      "Welcome and Introduction to the sponsors (Raiffeisen Bank International)",
    );
  });

  it("pads single-digit hours and accepts a dot", () => {
    expect(parseAgendaLine("9.30 - 10:00: Coffee")).toMatchObject({ start: "09:30", end: "10:00" });
  });

  it("ignores lines that are not agenda items", () => {
    expect(parseAgendaLine("Doors open at 17:00 for networking, food & drinks.")).toBeUndefined();
    expect(parseAgendaLine("Talks start at 18:00.")).toBeUndefined();
    expect(parseAgendaLine("**October 20nd 2026**")).toBeUndefined();
  });
});

describe("classify", () => {
  const line = (label: string, end = "18:00", quoted = false) => ({ start: "17:00", end, label, quoted });
  it("follows the SPEC rules", () => {
    expect(
      classify(
        [
          line("Entry & Networking"),
          line("Welcome and Introduction AWS Community Vienna"),
          line("Welcome and Introduction to the sponsors (Raiffeisen Bank International)"),
          line('"Talk one"', "18:50", true),
          line("Networking break"),
          line('"Talk two"', "20:00", true),
          line("Networking", "open-end"),
        ],
        [{ name: "Raiffeisen Bank International AG", short: "RBI" }],
      ),
    ).toEqual(["networking", "welcome", "sponsor", "talk", "break", "talk", "closing"]);
  });

  it("treats a label naming a sponsor as the sponsor slot", () => {
    expect(classify([line("A word from RBI"), line('"T"', "19:00", true)], [{ name: "Raiffeisen Bank International AG", short: "RBI" }])).toEqual([
      "sponsor",
      "talk",
    ]);
  });

  it("treats items after the last talk as closing", () => {
    expect(classify([line('"T"', "19:00", true), line("Wrap-up"), line("Drinks", "open-end")], [])).toEqual(["talk", "closing", "closing"]);
  });
});

describe("agenda items on one line", () => {
  it("puts each item on its own line", async () => {
    const { splitRunOnAgenda, parseDescription } = await import("../src/description.ts");
    const run = '18:00 \u2013 18:05: Welcome 18:05 \u2013 18:10: Sponsors (enspired) 18:10 \u2013 18:50: "Talk" 20:00 \u2013 Open End: Networking';
    expect(splitRunOnAgenda(run).split("\n")).toHaveLength(4);
    expect(parseDescription(`Agenda\n${run}`).agenda.map((a) => a.start)).toEqual(["18:00", "18:05", "18:10", "20:00"]);
    // a list item keeps its bullet
    expect(splitRunOnAgenda("* **18:10 - 18:50:** Talk")).toBe("* **18:10 - 18:50:** Talk");
    // a single time in prose is left alone
    expect(splitRunOnAgenda("Doors open at 17:00 for networking")).toBe("Doors open at 17:00 for networking");
  });
});


describe("agendas without quoted talk titles (older meetups)", () => {
  it("finds the talks after the welcome and the closing at the end", async () => {
    const { classify } = await import("../src/build.ts");
    const { parseAgendaLine } = await import("../src/description.ts");
    const lines = [
      "**17:00 - 18:00:** Entry & Networking",
      "**18:00 - 18:05:** Welcome and Introduction AWS Community Vienna",
      "**18:05 - 18:10:** Welcome and Introduction to the sponsors",
      "**18:10 - 18:50:** Managing AWS Sandboxes in your organisation with a breeze",
      "**18:50 - 19:10:** Networking Break",
      "**19:10 - 19:50:** Zero-Downtime Kubernetes Deployments on AWS with EKS",
      "**19:50 - 20:00:** Thank you & Closing",
      "**20:00 - Open End:** Networking",
    ].map((l) => parseAgendaLine(l)!);
    expect(classify(lines, [])).toEqual(["networking", "welcome", "sponsor", "talk", "break", "talk", "closing", "closing"]);
  });
});
