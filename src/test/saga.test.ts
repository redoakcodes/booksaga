import { describe, it, expect } from "vitest";
import { SAGA_GREETING } from "../lib/saga";

describe("saga", () => {
  it("exports a greeting string", () => {
    expect(typeof SAGA_GREETING).toBe("string");
    expect(SAGA_GREETING.length).toBeGreaterThan(0);
  });
});
