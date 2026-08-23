import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([".next/**", "node_modules/**", "uploads/**", "dogfood-output/**", "coverage/**", "playwright-report/**", "test-results/**", "data/**", "next-env.d.ts"]),
  {
    rules: {
      "@next/next/no-img-element": "off"
    }
  }
]);
