import type { IFileSystem } from "./filesystem";

export type Theme =
  | "dark"
  | "light"
  | "scifi"
  | "noire"
  | "fantasy"
  | "cyberpunk"
  | "romance"
  | "horror";

export interface AppSettings {
  theme: Theme;
  anthropicApiKey?: string;
  braveApiKey?: string;
}

const SETTINGS_FILE = "booksaga.json";
const DEFAULTS: AppSettings = { theme: "dark" };

const VALID_THEMES = new Set<string>([
  "dark",
  "light",
  "scifi",
  "noire",
  "fantasy",
  "cyberpunk",
  "romance",
  "horror",
]);

export async function loadSettings(fs: IFileSystem): Promise<AppSettings> {
  const raw = await fs.readFile(SETTINGS_FILE);
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw);
    return {
      theme: VALID_THEMES.has(parsed.theme) ? (parsed.theme as Theme) : "dark",
      anthropicApiKey:
        typeof parsed.anthropicApiKey === "string"
          ? parsed.anthropicApiKey
          : undefined,
      braveApiKey:
        typeof parsed.braveApiKey === "string" ? parsed.braveApiKey : undefined,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(
  fs: IFileSystem,
  settings: AppSettings,
): Promise<void> {
  await fs.writeFile([SETTINGS_FILE], JSON.stringify(settings, null, 2) + "\n");
}

export function applyTheme(theme: Theme): void {
  if (theme === "dark") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}
