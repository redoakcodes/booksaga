import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  loadSettings,
  saveSettings,
  loadCredentials,
  saveCredentials,
  resolveModel,
  type AppSettings,
  type Credentials,
} from "../lib/settings";

const mockInvoke = vi.mocked(invoke);

describe("resolveModel", () => {
  it("returns anthropic/sonnet for saga with no settings", () => {
    const m = resolveModel(undefined, "saga");
    expect(m.provider).toBe("anthropic");
    expect(m.model).toContain("sonnet");
  });

  it("returns anthropic/haiku for exercise with no settings", () => {
    const m = resolveModel(undefined, "exercise");
    expect(m.provider).toBe("anthropic");
    expect(m.model).toContain("haiku");
  });

  it("uses sagaModel override when set", () => {
    const llm = {
      sagaModel: { provider: "ollama" as const, model: "llama3.1" },
    };
    const m = resolveModel(llm, "saga");
    expect(m.provider).toBe("ollama");
    expect(m.model).toBe("llama3.1");
  });

  it("uses exerciseModel override when set", () => {
    const llm = {
      exerciseModel: { provider: "ollama" as const, model: "mistral" },
    };
    const m = resolveModel(llm, "exercise");
    expect(m.model).toBe("mistral");
  });

  it("falls back to base model when task override is absent", () => {
    const llm = { model: { provider: "ollama" as const, model: "qwen2.5" } };
    expect(resolveModel(llm, "saga").model).toBe("qwen2.5");
    expect(resolveModel(llm, "exercise").model).toBe("qwen2.5");
  });

  it("task override takes priority over base model", () => {
    const llm = {
      model: { provider: "anthropic" as const, model: "claude-sonnet-4-6" },
      sagaModel: { provider: "ollama" as const, model: "llama3.1" },
    };
    expect(resolveModel(llm, "saga").model).toBe("llama3.1");
    expect(resolveModel(llm, "exercise").model).toBe("claude-sonnet-4-6");
  });
});

describe("loadSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns defaults on invoke failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("not found"));
    const s = await loadSettings();
    expect(s.theme).toBe("dark");
    expect(s.llm).toEqual({});
  });

  it("parses valid settings JSON", async () => {
    const payload: AppSettings = {
      theme: "noire",
      llm: { model: { provider: "ollama", model: "llama3.1" } },
    };
    mockInvoke.mockResolvedValueOnce(JSON.stringify(payload));
    const s = await loadSettings();
    expect(s.theme).toBe("noire");
    expect(s.llm.model?.model).toBe("llama3.1");
  });

  it("falls back to dark theme for unknown theme value", async () => {
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify({ theme: "unknown", llm: {} }),
    );
    const s = await loadSettings();
    expect(s.theme).toBe("dark");
  });

  it("ignores model entries with empty model string", async () => {
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify({
        theme: "dark",
        llm: { model: { provider: "ollama", model: "" } },
      }),
    );
    const s = await loadSettings();
    expect(s.llm.model).toBeUndefined();
  });
});

describe("saveSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invokes save_app_settings with serialized JSON", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const s: AppSettings = { theme: "scifi", llm: {} };
    await saveSettings(s);
    expect(mockInvoke).toHaveBeenCalledWith(
      "save_app_settings",
      expect.objectContaining({ json: expect.stringContaining("scifi") }),
    );
  });
});

describe("loadCredentials", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns both keys when present", async () => {
    mockInvoke
      .mockResolvedValueOnce("sk-ant-key")
      .mockResolvedValueOnce("BSA-brave-key");
    const c = await loadCredentials();
    expect(c.anthropicApiKey).toBe("sk-ant-key");
    expect(c.braveApiKey).toBe("BSA-brave-key");
  });

  it("returns empty object on failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("keychain error"));
    const c = await loadCredentials();
    expect(c).toEqual({});
  });

  it("omits undefined fields when key is null", async () => {
    mockInvoke.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const c: Credentials = await loadCredentials();
    expect(c.anthropicApiKey).toBeUndefined();
    expect(c.braveApiKey).toBeUndefined();
  });
});

describe("saveCredentials", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls set_credential for both keys", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await saveCredentials({ anthropicApiKey: "sk-test", braveApiKey: "brave" });
    const calls = mockInvoke.mock.calls.map((c) => c[0]);
    expect(calls).toContain("set_credential");
    expect(mockInvoke.mock.calls).toHaveLength(2);
  });

  it("sends empty string for missing keys (triggers keychain delete)", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await saveCredentials({});
    const values = mockInvoke.mock.calls.map(
      (c) => (c[1] as Record<string, unknown>).value,
    );
    expect(values).toEqual(["", ""]);
  });
});
