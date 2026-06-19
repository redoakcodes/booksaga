import {
  createEffect,
  createSignal,
  onMount,
  Show,
  type Component,
} from "solid-js";
import {
  findAllMatchPositions,
  scrollAndHighlight,
  replaceMatch,
  replaceAllMatches,
} from "../lib/editorCommands";

interface Props {
  fileKey: string;
  onClose: () => void;
}

const FindBar: Component<Props> = (props) => {
  const [query, setQuery] = createSignal("");
  const [replaceText, setReplaceText] = createSignal("");
  const [matches, setMatches] = createSignal<{ from: number; to: number }[]>(
    [],
  );
  const [idx, setIdx] = createSignal(0);
  let findRef!: HTMLInputElement;

  onMount(() => findRef?.focus());

  createEffect(() => {
    props.fileKey;
    setQuery("");
    setReplaceText("");
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
  });

  function navigate(dir: 1 | -1) {
    const m = matches();
    if (!m.length) return;
    const next = (idx() + dir + m.length) % m.length;
    setIdx(next);
    scrollAndHighlight(m[next].from, m[next].to);
  }

  function replace() {
    const m = matches();
    if (!m.length) return;
    replaceMatch(m[idx()].from, m[idx()].to, replaceText());
    // Re-find after the document changed
    const q = query();
    const next = q ? findAllMatchPositions(q) : [];
    setMatches(next);
    const newIdx = Math.min(idx(), Math.max(0, next.length - 1));
    setIdx(newIdx);
    if (next.length > 0) scrollAndHighlight(next[newIdx].from, next[newIdx].to);
  }

  function replaceAll() {
    const m = matches();
    if (!m.length) return;
    replaceAllMatches(m, replaceText());
    setMatches([]);
    setIdx(0);
  }

  function handleFindKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { props.onClose(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      navigate(e.shiftKey ? -1 : 1);
    }
  }

  function handleReplaceKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { props.onClose(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      replace();
    }
  }

  return (
    <div class="find-bar">
      <div class="find-bar-row">
        <input
          ref={findRef}
          class="find-bar-input"
          type="text"
          placeholder="Find…"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={handleFindKeyDown}
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
      <div class="find-bar-row">
        <input
          class="find-bar-input"
          type="text"
          placeholder="Replace…"
          value={replaceText()}
          onInput={(e) => setReplaceText(e.currentTarget.value)}
          onKeyDown={handleReplaceKeyDown}
        />
        <button
          class="find-bar-btn find-bar-replace-btn"
          onClick={replace}
          disabled={matches().length === 0}
        >
          Replace
        </button>
        <button
          class="find-bar-btn find-bar-replace-btn"
          onClick={replaceAll}
          disabled={matches().length === 0}
        >
          All
        </button>
      </div>
    </div>
  );
};

export default FindBar;
