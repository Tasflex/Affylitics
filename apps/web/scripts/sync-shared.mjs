// Copies the shared rail registry into the app so Next.js can import it at build time.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../../packages/shared/rails.json");
const dest = resolve(here, "../lib/generated/rails.json");
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
