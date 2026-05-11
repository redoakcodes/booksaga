export interface PromptEntry {
  name: string;
  prompt: string;
}

/**
 * Stream a generated writing exercise for the given prompt.
 * TODO: replace stub with real Anthropic API call (claude-sonnet-4-6 or later).
 */
export async function* streamExercise(prompt: string): AsyncGenerator<string> {
  void prompt; // will be forwarded to the API

  const stub =
    "Write a scene in which your protagonist must make a small, seemingly trivial decision — " +
    "choosing a seat on a bus, picking up or leaving behind an object someone dropped, " +
    "answering or ignoring a phone — and let that choice reveal something about who they " +
    "are that has not yet appeared on the page. Set the scene in a public place where they " +
    "are surrounded by strangers. Write entirely in close third person, staying inside your " +
    "protagonist's head. Pay attention to what they notice, what they avoid noticing, and the " +
    "exact texture of the moment the decision is made. Aim for 400–600 words.";

  for (let i = 0; i < stub.length; i += 4) {
    await new Promise<void>((r) => setTimeout(r, 18));
    yield stub.slice(i, Math.min(i + 4, stub.length));
  }
}
