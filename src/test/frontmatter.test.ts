import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "../lib/frontmatter";

describe("parseFrontmatter", () => {
  it("returns empty meta and full body when no frontmatter present", () => {
    const { meta, body } = parseFrontmatter("# Hello\n\nSome text.");
    expect(meta).toEqual({});
    expect(body).toBe("# Hello\n\nSome text.");
  });

  it("parses a simple frontmatter block", () => {
    const input = `---\ncitation: "Galbraith 1954"\n---\n# Body`;
    const { meta, body } = parseFrontmatter(input);
    expect(meta.citation).toBe("Galbraith 1954");
    expect(body).toBe("# Body");
  });

  it("strips double quotes from values", () => {
    const { meta } = parseFrontmatter(`---\ntitle: "My Title"\n---\n`);
    expect(meta.title).toBe("My Title");
  });

  it("strips single quotes from values", () => {
    const { meta } = parseFrontmatter(`---\ntitle: 'My Title'\n---\n`);
    expect(meta.title).toBe("My Title");
  });

  it("parses multiple keys", () => {
    const { meta } = parseFrontmatter(
      `---\ncitation: "Foo"\nauthor: "Bar"\n---\n`,
    );
    expect(meta.citation).toBe("Foo");
    expect(meta.author).toBe("Bar");
  });

  it("handles values with colons", () => {
    const { meta } = parseFrontmatter(`---\ncitation: "Foo: A History"\n---\n`);
    expect(meta.citation).toBe("Foo: A History");
  });

  it("returns body without the frontmatter block", () => {
    const input = `---\ncitation: "X"\n---\n# Heading\n\nParagraph.`;
    const { body } = parseFrontmatter(input);
    expect(body).toBe("# Heading\n\nParagraph.");
  });

  it("handles content with no trailing newline after fence", () => {
    const { meta, body } = parseFrontmatter(`---\nfoo: bar\n---`);
    expect(meta.foo).toBe("bar");
    expect(body).toBe("");
  });
});

describe("serializeFrontmatter", () => {
  it("returns body unchanged when meta is empty", () => {
    expect(serializeFrontmatter({}, "# Body")).toBe("# Body");
  });

  it("prepends frontmatter block", () => {
    const result = serializeFrontmatter({ citation: "Foo 2024" }, "# Body");
    expect(result).toMatch(/^---\n/);
    expect(result).toContain('"Foo 2024"');
    expect(result).toMatch(/---\n# Body$/);
  });

  it("round-trips through parse and serialize", () => {
    const original = `---\ncitation: "Galbraith 1954"\n---\n# Body\n`;
    const { meta, body } = parseFrontmatter(original);
    const result = serializeFrontmatter(meta, body);
    const { meta: meta2, body: body2 } = parseFrontmatter(result);
    expect(meta2.citation).toBe(meta.citation);
    expect(body2).toBe(body);
  });
});
