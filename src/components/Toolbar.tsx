import { createEffect, createSignal, onCleanup, Show, type Component } from "solid-js";
import {
  applyMark,
  applyHeading,
  applyBulletList,
  applyOrderedList,
  applyBlockquote,
  applyInlineCode,
} from "../lib/editorCommands";
import { modKeyLabel } from "../lib/platform";
import { store } from "../store";

interface Props {
  onSave: () => void;
  viewMarkdown: boolean;
  onToggleView: () => void;
  onNewWiki?: () => void;
  onSettings?: () => void;
}

type OpenMenu = "menu" | "format" | null;

const Toolbar: Component<Props> = (props) => {
  const [openMenu, setOpenMenu] = createSignal<OpenMenu>(null);
  let menuRef!: HTMLDivElement;
  let formatRef!: HTMLDivElement;

  createEffect(() => {
    const which = openMenu();
    if (!which) return;
    const ref = which === "menu" ? menuRef : formatRef;
    const handler = (e: MouseEvent) => {
      if (!ref.contains(e.target as Node)) setOpenMenu(null);
    };
    const id = setTimeout(() => document.addEventListener("click", handler), 0);
    onCleanup(() => {
      clearTimeout(id);
      document.removeEventListener("click", handler);
    });
  });

  function toggle(menu: OpenMenu) {
    setOpenMenu((cur) => (cur === menu ? null : menu));
  }

  function run(fn: () => void) {
    setOpenMenu(null);
    fn();
  }

  return (
    <div class="toolbar">
      <div class="toolbar-left">

        {/* ── Menu ── */}
        <div class="toolbar-menu" ref={menuRef}>
          <button
            class="toolbar-menu-btn"
            classList={{ active: openMenu() === "menu" }}
            onClick={() => toggle("menu")}
          >
            Menu
          </button>
          <Show when={openMenu() === "menu"}>
            <div class="toolbar-dropdown">
              <Show when={store.activeSection() === "wiki"}>
                <button class="toolbar-menu-item" onClick={() => run(() => props.onNewWiki?.())}>
                  <span class="toolbar-item-label">New</span>
                </button>
                <div class="toolbar-divider" />
              </Show>
              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(props.onSave)}>
                <span class="toolbar-item-label">Save</span>
                <span class="toolbar-item-hint">{modKeyLabel}S</span>
              </button>
              <div class="toolbar-divider" />
              <button class="toolbar-menu-item" onClick={() => run(props.onToggleView)}>
                <span class="toolbar-item-label">
                  {props.viewMarkdown ? "View Formatted" : "View Markdown"}
                </span>
              </button>
              <div class="toolbar-divider" />
              <button class="toolbar-menu-item" onClick={() => run(() => props.onSettings?.())}>
                <span class="toolbar-item-label">Settings</span>
              </button>
            </div>
          </Show>
        </div>

        {/* ── Format ── */}
        <div class="toolbar-menu" ref={formatRef}>
          <button
            class="toolbar-menu-btn"
            classList={{ active: openMenu() === "format" }}
            onClick={() => toggle("format")}
          >
            Format
          </button>
          <Show when={openMenu() === "format"}>
            <div class="toolbar-dropdown">

              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(() => applyMark("strong"))}>
                <span class="toolbar-item-label fmt-bold">Bold</span>
                <span class="toolbar-item-hint">**text**</span>
              </button>
              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(() => applyMark("em"))}>
                <span class="toolbar-item-label fmt-italic">Italic</span>
                <span class="toolbar-item-hint">*text*</span>
              </button>
              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(() => applyMark("strikethrough"))}>
                <span class="toolbar-item-label fmt-strike">Strikethrough</span>
                <span class="toolbar-item-hint">~~text~~</span>
              </button>

              <div class="toolbar-divider" />

              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(() => applyHeading(1))}>
                <span class="toolbar-item-label">Heading 1</span>
                <span class="toolbar-item-hint">#</span>
              </button>
              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(() => applyHeading(2))}>
                <span class="toolbar-item-label">Heading 2</span>
                <span class="toolbar-item-hint">##</span>
              </button>
              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(() => applyHeading(3))}>
                <span class="toolbar-item-label">Heading 3</span>
                <span class="toolbar-item-hint">###</span>
              </button>

              <div class="toolbar-divider" />

              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(applyBulletList)}>
                <span class="toolbar-item-label">Bullets</span>
                <span class="toolbar-item-hint">-</span>
              </button>
              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(applyOrderedList)}>
                <span class="toolbar-item-label">List</span>
                <span class="toolbar-item-hint">1.</span>
              </button>

              <div class="toolbar-divider" />

              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(applyBlockquote)}>
                <span class="toolbar-item-label">Quote</span>
                <span class="toolbar-item-hint">&gt;</span>
              </button>
              <button class="toolbar-menu-item toolbar-fmt-item" onClick={() => run(applyInlineCode)}>
                <span class="toolbar-item-label">Code</span>
                <span class="toolbar-item-hint">`</span>
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
