import { createSignal, type Component } from "solid-js";
import type { Theme } from "../lib/settings";

interface Props {
  currentTheme: Theme;
  onSave: (theme: Theme) => void;
  onClose: () => void;
}

const SettingsModal: Component<Props> = (props) => {
  const [theme, setTheme] = createSignal<Theme>(props.currentTheme);

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
          </select>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" onClick={props.onClose}>Close</button>
          <button class="btn-primary" onClick={() => props.onSave(theme())}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
