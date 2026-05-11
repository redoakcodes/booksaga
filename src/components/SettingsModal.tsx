import { createSignal, type Component } from "solid-js";
import type { AppSettings, Theme } from "../lib/settings";

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

const SettingsModal: Component<Props> = (props) => {
  const [theme, setTheme] = createSignal<Theme>(props.settings.theme);
  const [apiKey, setApiKey] = createSignal(props.settings.anthropicApiKey ?? "");

  function save() {
    props.onSave({
      theme: theme(),
      anthropicApiKey: apiKey().trim() || undefined,
    });
  }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2 class="modal-title">Booksaga Settings</h2>

        <div class="new-modal-field">
          <label class="new-modal-label" for="settings-theme">Theme</label>
          <select
            id="settings-theme"
            class="new-modal-input"
            value={theme()}
            onChange={(e) => setTheme(e.currentTarget.value as Theme)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="scifi">Sci-Fi</option>
            <option value="noire">Noire</option>
            <option value="fantasy">Fantasy</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="romance">Romance</option>
            <option value="horror">Horror</option>
          </select>
        </div>

        <div class="new-modal-field">
          <label class="new-modal-label" for="settings-api-key">
            Anthropic API Key
          </label>
          <input
            id="settings-api-key"
            type="password"
            class="new-modal-input"
            placeholder="sk-ant-…"
            value={apiKey()}
            onInput={(e) => setApiKey(e.currentTarget.value)}
            autocomplete="off"
          />
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" onClick={props.onClose}>Close</button>
          <button class="btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
