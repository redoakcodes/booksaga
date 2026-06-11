import tseslint from "typescript-eslint";
import solid from "eslint-plugin-solid";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src-tauri/**"] },
  tseslint.configs.recommended,
  solid.configs["flat/typescript"],
  prettier,
  {
    rules: {
      // Allow _-prefixed vars as intentional no-ops (drain loops, etc.)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // SagaConsole renders markdown via MarkdownIt — innerHTML is intentional
    // and the source is controlled (never raw user input).
    files: ["src/components/SagaConsole.tsx"],
    rules: { "solid/no-innerhtml": "off" },
  },
);
