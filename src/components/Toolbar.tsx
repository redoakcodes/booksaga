import { createEffect, createSignal, onCleanup, Show, type Component } from "solid-js";

interface Props {
  onSave: () => void;
}

const Toolbar: Component<Props> = (props) => {
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menuRef!: HTMLDivElement;

  createEffect(() => {
    if (!menuOpen()) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.contains(e.target as Node)) setMenuOpen(false);
    };
    const id = setTimeout(() => document.addEventListener("click", handler), 0);
    onCleanup(() => {
      clearTimeout(id);
      document.removeEventListener("click", handler);
    });
  });

  function handleSave() {
    setMenuOpen(false);
    props.onSave();
  }

  return (
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="toolbar-menu" ref={menuRef}>
          <button
            class="toolbar-menu-btn"
            classList={{ active: menuOpen() }}
            onClick={() => setMenuOpen((o) => !o)}
          >
            Menu
          </button>
          <Show when={menuOpen()}>
            <div class="toolbar-dropdown">
              <button class="toolbar-menu-item" onClick={handleSave}>
                <span class="toolbar-item-label">Save</span>
                <span class="toolbar-item-hint">Ctrl+S</span>
              </button>
            </div>
          </Show>
        </div>
      </div>

      <div class="toolbar-right">
        <button class="toolbar-icon-btn" title="Help">?</button>
      </div>
    </div>
  );
};

export default Toolbar;
