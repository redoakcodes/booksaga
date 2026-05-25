import { createMemo, createSignal, For, Show, type Component } from "solid-js";

interface Props {
  content: string;
  onChange: (value: string) => void;
  wikiTitles: string[];
}

// Characters that end a "word" for typeahead purposes
const WORD_BOUNDARY = /[\[(\{\n\t :|>]/;

function getCurrentWord(text: string, pos: number): { word: string; start: number } {
  let start = pos;
  while (start > 0 && !WORD_BOUNDARY.test(text[start - 1])) start--;
  return { word: text.slice(start, pos), start };
}

const DiagramSourceEditor: Component<Props> = (props) => {
  let textareaRef!: HTMLTextAreaElement;
  const [query, setQuery] = createSignal("");
  const [activeIdx, setActiveIdx] = createSignal(0);
  const [dropdownTop, setDropdownTop] = createSignal(0);

  const suggestions = createMemo(() => {
    const q = query().toLowerCase();
    if (q.length < 2) return [];
    return props.wikiTitles.filter((t) => t.toLowerCase().startsWith(q)).slice(0, 8);
  });

  function updateDropdownPosition(ta: HTMLTextAreaElement, cursorPos: number) {
    const cs = window.getComputedStyle(ta);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const linesBefore = ta.value.substring(0, cursorPos).split("\n").length - 1;
    setDropdownTop(paddingTop + (linesBefore + 1) * lineHeight);
  }

  function handleInput(e: Event) {
    const ta = e.currentTarget as HTMLTextAreaElement;
    props.onChange(ta.value);
    const pos = ta.selectionStart ?? 0;
    const { word } = getCurrentWord(ta.value, pos);
    setQuery(word);
    setActiveIdx(0);
    updateDropdownPosition(ta, pos);
  }

  function selectSuggestion(title: string) {
    const ta = textareaRef;
    const pos = ta.selectionStart ?? 0;
    const { start } = getCurrentWord(ta.value, pos);
    const newValue = ta.value.slice(0, start) + title + ta.value.slice(pos);
    props.onChange(newValue);
    setQuery("");
    const newPos = start + title.length;
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = newPos;
    }, 0);
  }

  function handleKeyDown(e: KeyboardEvent) {
    const sugs = suggestions();
    if (!sugs.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, sugs.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectSuggestion(sugs[activeIdx()]);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  function handleBlur() {
    // Delay so a mouse click on a suggestion fires before the dropdown closes
    setTimeout(() => setQuery(""), 150);
  }

  return (
    <div class="diagram-source-editor">
      <textarea
        ref={textareaRef}
        class="diagram-source"
        value={props.content}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        spellcheck={false}
      />
      <Show when={suggestions().length > 0}>
        <div class="diagram-typeahead" style={{ top: `${dropdownTop()}px` }}>
          <For each={suggestions()}>
            {(title, i) => (
              <div
                class={`diagram-typeahead-item${i() === activeIdx() ? " active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(title); }}
              >
                {title}
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default DiagramSourceEditor;
