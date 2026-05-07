import { type Component } from "solid-js";

interface Props {
  label: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

const CreatePrompt: Component<Props> = (props) => (
  <div class="create-prompt">
    <div class="create-prompt-card">
      <p class="create-prompt-text">
        Create <strong>"{props.label}"</strong> as a document?
      </p>
      <div class="create-prompt-actions">
        <button class="btn-primary" onClick={props.onConfirm}>
          Create
        </button>
        <button class="btn-secondary" onClick={props.onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  </div>
);

export default CreatePrompt;
