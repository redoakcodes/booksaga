import type { IFileSystem } from "./filesystem";

export type Theme = "light" | "dark";

export interface AppSettings {
  theme: Theme;
}

const SETTINGS_FILE = "booksaga.json";
const DEFAULTS: AppSettings = { theme: "dark" };

export async function loadSettings(fs: IFileSystem): Promise<AppSettings> {
  const raw = await fs.readFile(SETTINGS_FILE);
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw);
    return { theme: parsed.theme === "light" ? "light" : "dark" };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(fs: IFileSystem, settings: AppSettings): Promise<void> {
  await fs.writeFile([SETTINGS_FILE], JSON.stringify(settings, null, 2) + "\n");
}

export function applyTheme(theme: Theme): void {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}
