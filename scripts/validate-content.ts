/**
 * Validates every content file without touching the database.
 *
 *   pnpm content:validate
 *
 * Used in CI, where there is no local Supabase to write to. It applies the same
 * schema and the same cross-field checks as the importer, plus two it can only
 * make offline: that every referenced category is one the brief names, and that
 * every playbook referenced by the catalog either exists on disk or is at least
 * a well-formed slug.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { parse as parseYaml } from "yaml";

import {
  CATEGORY_SLUGS,
  catalogSchema,
  playbookSchema,
  type PlaybookFile,
} from "@/lib/content/schema";

const CONTENT_DIR = join(process.cwd(), "content");
const PLAYBOOKS_DIR = join(CONTENT_DIR, "playbooks");
const CATALOG_PATH = join(CONTENT_DIR, "use_cases_and_kits.yaml");

let failures = 0;

function report(file: string, problems: string[]) {
  failures += problems.length;
  process.stdout.write(`\n${file}\n`);
  for (const problem of problems) {
    process.stdout.write(`  - ${problem}\n`);
  }
}

function zodProblems(error: { issues: { path: (string | number | symbol)[]; message: string }[] }) {
  return error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${field}: ${issue.message}`;
  });
}

async function main() {
  const files = (await readdir(PLAYBOOKS_DIR)).filter((name) => /\.(ya?ml)$/.test(name)).sort();

  if (files.length === 0) {
    process.stdout.write("no playbook files found in content/playbooks\n");
    process.exit(1);
  }

  const playbooks: PlaybookFile[] = [];
  const declaredSlugs = new Set<string>();

  for (const name of files) {
    const file = `content/playbooks/${name}`;
    const parsed = parseYaml(await readFile(join(PLAYBOOKS_DIR, name), "utf8"));
    const result = playbookSchema.safeParse(parsed);

    if (!result.success) {
      report(file, zodProblems(result.error));
      continue;
    }

    const problems: string[] = [];
    const stem = basename(name).replace(/\.(ya?ml)$/, "");

    if (stem !== result.data.slug) {
      problems.push(`slug: "${result.data.slug}" does not match the filename "${stem}"`);
    }
    if (declaredSlugs.has(result.data.slug)) {
      problems.push(`slug: "${result.data.slug}" is declared by more than one file`);
    }

    declaredSlugs.add(result.data.slug);
    playbooks.push(result.data);

    if (problems.length > 0) {
      report(file, problems);
    }
  }

  const catalogResult = catalogSchema.safeParse(
    parseYaml(await readFile(CATALOG_PATH, "utf8")),
  );

  if (!catalogResult.success) {
    report("content/use_cases_and_kits.yaml", zodProblems(catalogResult.error));
  } else {
    const catalog = catalogResult.data;
    const referenced = new Set([
      ...catalog.use_cases.flatMap((useCase) => useCase.playbooks),
      ...catalog.starter_kits.flatMap((kit) => kit.playbooks),
    ]);

    for (const slug of referenced) {
      if (!declaredSlugs.has(slug)) {
        // A warning, not a failure: the brief says references to playbooks that
        // have not been written yet are skipped, so pages still render.
        process.stdout.write(
          `note: catalog references "${slug}", which has no file yet — it will be skipped\n`,
        );
      }
    }

    for (const entry of catalog.categories) {
      if (!(CATEGORY_SLUGS as readonly string[]).includes(entry.slug)) {
        report("content/use_cases_and_kits.yaml", [
          `categories: "${entry.slug}" is not one of the 8 categories in AGENTS.md`,
        ]);
      }
    }
  }

  if (failures > 0) {
    process.stdout.write(`\n${failures} problem(s) found.\n`);
    process.exit(1);
  }

  process.stdout.write(`\n${playbooks.length} playbook(s) and the catalog are valid.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`\nvalidation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});