import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test output. Gitignored, but ESLint walks the working tree
    // rather than the index, so a report left behind by a run is linted as
    // source: Playwright's HTML report bundles its own trace viewer, and
    // linting it reported 3054 problems in third-party code that is not ours
    // to fix. Same list as the "Testing" block in .gitignore.
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
