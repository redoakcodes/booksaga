import {
  createEffect,
  createSignal,
  onMount,
  Show,
  type Component,
} from "solid-js";
import { findAllMatchPositions, selectMatch } from "../lib/editorCommands";

interface Props {
  fileKey: string;
  onClose: () => void;
}

const FindBar: Component<Props> = (props) => {
  const [query, setQuery] = createSignal("");
  const [matches, setMatches] = createSignal<{ from: number; to: number }[]>(
    [],
  );
  const [idx, setIdx] = createSignal(0);
  let inputRef!: HTMLInputElement;

  onMount(() => inputRef?.focus());

  createEffect(() => {
    props.fileKey;
    setQuery("");
    setMatches([]);
    setIdx(0);
  });

  createEffect(() => {
    const q = query();
    if (!q) {
      setMatches([]);
      setIdx(0);
      return;
    }
    const m = findAllMatchPositions(q);
    setMatches(m);
    setIdx(0);
    if (m.length > 0) selectMatch(m[0].from, m[0].to);
  });

  function navigate(dir: 1 | -1) {
    const m = matches();
    if (!m.length) return;
    const next = (idx() + dir + m.length) % m.length;
    setIdx(next);
    selectMatch(m[next].from, m[next].to);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      props.onClose();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      navigate(e.shiftKey ? -1 : 1);
    }
  }

  return (
    <div class="find-bar">
      <input
        ref={inputRef}
        class="find-bar-input"
        type="text"
        placeholder="Find…"
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <span class="find-bar-count">
        <Show when={query()}>
          {matches().length > 0
            ? `${idx() + 1} / ${matches().length}`
            : "No results"}
        </Show>
      </span>
      <button
        class="find-bar-btn"
        title="Previous (Shift+Enter)"
        onClick={() => navigate(-1)}
        disabled={matches().length === 0}
      >
        ▲
      </button>
      <button
        class="find-bar-btn"
        title="Next (Enter)"
        onClick={() => navigate(1)}
        disabled={matches().length === 0}
      >
        ▼
      </button>
      <button class="find-bar-close" title="Close (Escape)" onClick={props.onClose}>
        ×
      </button>
    </div>
  );
};

export default FindBar;
