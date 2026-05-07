import { describe, it, expect } from "vitest";
import { parseConfig, CONFIG_DEFAULTS } from "../lib/config";

describe("parseConfig", () => {
  it("returns defaults when text is null", () => {
    expect(parseConfig(null)).toEqual(CONFIG_DEFAULTS);
  });

  it("returns defaults when text is empty string", () => {
    expect(parseConfig("")).toEqual(CONFIG_DEFAULTS);
  });

  it("returns defaults when JSON is invalid", () => {
    expect(parseConfig("{ not valid json")).toEqual(CONFIG_DEFAULTS);
  });

  it("parses a complete config", () => {
    const raw = JSON.stringify({
      project: { title: "My Novel", author: "Jane" },
      llm: { model: "claude-opus-4-7", apiKey: "sk-test" },
    });
    const config = parseConfig(raw);
    expect(config.project.title).toBe("My Novel");
    expect(config.project.author).toBe("Jane");
    expect(config.llm.model).toBe("claude-opus-4-7");
    expect(config.llm.apiKey).toBe("sk-test");
  });

  it("fills in missing fields with defaults", () => {
    const raw = JSON.stringify({ project: { title: "Partial" } });
    const config = parseConfig(raw);
    expect(config.project.title).toBe("Partial");
    expect(config.project.author).toBe(CONFIG_DEFAULTS.project.author);
    expect(config.llm.model).toBe(CONFIG_DEFAULTS.llm.model);
    expect(config.llm.apiKey).toBe("");
  });

  it("defaults apiKey to empty string when absent", () => {
    const raw = JSON.stringify({ llm: { model: "claude-haiku-4-5-20251001" } });
    expect(parseConfig(raw).llm.apiKey).toBe("");
  });

  it("returns independent copies (no shared state)", () => {
    const a = parseConfig(null);
    const b = parseConfig(null);
    a.project.title = "mutated";
    expect(b.project.title).toBe(CONFIG_DEFAULTS.project.title);
  });
});
