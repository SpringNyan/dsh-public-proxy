import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import onlyWarn from "eslint-plugin-only-warn";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * @type {import("eslint").Linter.Config}
 * */
export default defineConfig([
  {
    ignores: ["lib/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      eslintConfigPrettier,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      onlyWarn,
    },
  },
]);
