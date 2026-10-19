import { describe, expect, it } from "vitest";
import { parseSpeakerLine } from "../src/description.ts";

describe("parseSpeakerLine", () => {
  it("reads 'Name, Role (Company)' with a bold link", () => {
    expect(parseSpeakerLine("**[Roman Jokel](https://www.linkedin.com/in/roman-jokel/),** Cloud Architect (Raiffeisen Bank International)")).toEqual({
      name: "Roman Jokel",
      role: "Cloud Architect",
      company: "Raiffeisen Bank International",
      url: "https://www.linkedin.com/in/roman-jokel/",
    });
  });

  it("reads 'Name, Role@Company' with the comma after the bold link", () => {
    expect(parseSpeakerLine("**[Mladen Trampic](https://www.linkedin.com/in/trampic/)**, Senior Technical Account Manager@AWS")).toEqual({
      name: "Mladen Trampic",
      role: "Senior Technical Account Manager",
      company: "AWS",
      url: "https://www.linkedin.com/in/trampic/",
    });
  });

  it("reads 'Name Role@Company' without a comma, after an inline Speaker: label", () => {
    expect(parseSpeakerLine("*Speaker:* [Darko Mesaroš](https://www.linkedin.com/in/darko-mesaros/) Principal Technologist@AWS")).toEqual({
      name: "Darko Mesaroš",
      role: "Principal Technologist",
      company: "AWS",
      url: "https://www.linkedin.com/in/darko-mesaros/",
    });
  });

  it("reads both forms as plain text, without links", () => {
    expect(parseSpeakerLine("Roman Jokel, Cloud Architect (Raiffeisen Bank International)")).toEqual({
      name: "Roman Jokel",
      role: "Cloud Architect",
      company: "Raiffeisen Bank International",
    });
    expect(parseSpeakerLine("Mladen Trampic, Senior Technical Account Manager@AWS")).toEqual({
      name: "Mladen Trampic",
      role: "Senior Technical Account Manager",
      company: "AWS",
    });
    expect(parseSpeakerLine("Darko Mesaroš Principal Technologist@AWS")).toEqual({
      name: "Darko Mesaroš",
      role: "Principal Technologist",
      company: "AWS",
    });
  });

  it("reads 'Role at Company' and a bare name", () => {
    expect(parseSpeakerLine("Jane Doe - Solutions Architect at Example")).toEqual({ name: "Jane Doe", role: "Solutions Architect", company: "Example" });
    expect(parseSpeakerLine("[Jane Doe](https://example.com)")).toEqual({ name: "Jane Doe", url: "https://example.com" });
  });

  it("returns nothing for the bare label line", () => {
    expect(parseSpeakerLine("*Speakers:*")).toBeUndefined();
    expect(parseSpeakerLine("")).toBeUndefined();
  });
});

describe("speaker lines seen on older meetup pages", () => {
  it("reads a Speaker: label inside bold, with an em dash before the role", async () => {
    const { parseSpeakerLine } = await import("../src/description.ts");
    expect(parseSpeakerLine("**Speaker: Anton Babenko \u2014 AWS Community Hero** / Terraform influencer / compliance.tf")).toEqual({
      name: "Anton Babenko",
      role: "AWS Community Hero / Terraform influencer / compliance.tf",
    });
  });

  it("reads a list of names, linked or not", async () => {
    const { parseSpeakersLine } = await import("../src/description.ts");
    expect(parseSpeakersLine("Speakers: [Andreas Werschlan](https://x.example/a), [Michal Sedlak](https://x.example/m) and Orlin Filev")).toEqual([
      { name: "Andreas Werschlan", url: "https://x.example/a" },
      { name: "Michal Sedlak", url: "https://x.example/m" },
      { name: "Orlin Filev" },
    ]);
    // one speaker with a role stays one speaker
    expect(parseSpeakersLine("Speaker: Darko Mesaro\u0161, Principal Technologist at AWS")).toHaveLength(1);
  });

  it("drops Meetup's escapes", async () => {
    const { unescapeMarkdown } = await import("../src/description.ts");
    expect(unescapeMarkdown("Developer Advocate at Sinch \\| ex\\-AWS\\, Hero")).toBe("Developer Advocate at Sinch | ex-AWS, Hero");
  });
});

describe("hosts from the description", () => {
  it("finds the host in the forms the group writes", async () => {
    const { hostsFromDescription, hostsFromTitle } = await import("../src/archive.ts");
    expect(hostsFromDescription("This event is sponsored by SQUER")).toEqual(["SQUER"]);
    expect(hostsFromDescription("We're thrilled to be hosted and sponsored by **[Raiffeisen Informatik GmbH & Co KG](https://x.example/)**")).toEqual(["Raiffeisen Informatik"]);
    expect(hostsFromDescription("** Sponsored by:** ByteSource")).toEqual(["ByteSource"]);
    expect(hostsFromDescription("A huge thank you to **DoIT** for sponsoring and hosting this special event")).toEqual(["DoIT"]);
    expect(hostsFromDescription("thankfully to the sponsor **Bytesource**!")).toEqual(["Bytesource"]);
    // the user groups organising it are not the host
    expect(hostsFromDescription("a collaborative event hosted by the AWS User Group Vienna and the AWS User Group Bratislava")).toEqual([]);
    expect(hostsFromTitle("AWS Stammtisch - sponsored by Labyrinth Labs")).toEqual(["Labyrinth Labs"]);
    expect(hostsFromDescription("a special edition hosted by us at the real football **Generali Arena** stadion\nA huge thank you to **DoIT** for sponsoring and hosting")).toEqual(["DoIT"]);
    // a host of several words, without bold
    expect(hostsFromDescription("This meetup is hosted by Raiffeisen Bank International.")).toEqual(["Raiffeisen Bank International"]);
  });
});

