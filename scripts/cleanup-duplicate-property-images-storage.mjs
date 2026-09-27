// Removes specific orphaned files from the "property-images" Storage
// bucket, by exact path — used ONLY after migration_v51 has deleted the
// corresponding duplicate `property_images` rows and that deletion has
// been verified. See DUPLICATE_PHOTOS_CLEANUP.md for the full procedure.
//
// Safety: defaults to a DRY RUN that only lists what would be removed.
// Nothing is deleted from Storage unless you pass --confirm explicitly.
//
// Usage:
//   node --env-file=.env.local scripts/cleanup-duplicate-property-images-storage.mjs <paths-file> [--confirm]
//
// <paths-file>: a plain text file with one Storage path per line (the
// `storage_path` column copied from migration_v51's Part 1 SELECT
// output), e.g.:
//   properties/1a2b3c4d/1700000000000-ab12cd.jpg
//   properties/5e6f7g8h/1700000005000-ef34gh.png
//
// Example:
//   node --env-file=.env.local scripts/cleanup-duplicate-property-images-storage.mjs dup-paths.txt
//   node --env-file=.env.local scripts/cleanup-duplicate-property-images-storage.mjs dup-paths.txt --confirm

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BUCKET = "property-images";

const [, , pathsFile, flag] = process.argv;
const confirmed = flag === "--confirm";

if (!pathsFile) {
  console.error(
    "Usage: node --env-file=.env.local scripts/cleanup-duplicate-property-images-storage.mjs <paths-file> [--confirm]",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const paths = readFileSync(pathsFile, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

if (paths.length === 0) {
  console.error(`No paths found in ${pathsFile}.`);
  process.exit(1);
}

console.log(`Bucket: ${BUCKET}`);
console.log(`Paths read from ${pathsFile}: ${paths.length}`);
paths.forEach((p) => console.log(`  - ${p}`));

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (!confirmed) {
  console.log("");
  console.log("DRY RUN — nothing was deleted. Re-run with --confirm to actually remove these files.");
  process.exit(0);
}

console.log("");
console.log("--confirm passed. Deleting the files listed above from Storage...");

const { data, error } = await admin.storage.from(BUCKET).remove(paths);

if (error) {
  console.error("Storage removal failed:", error.message);
  process.exit(1);
}

console.log(`Removed ${data?.length ?? 0} file(s):`);
(data ?? []).forEach((f) => console.log(`  - ${f.name}`));

const removedNames = new Set((data ?? []).map((f) => f.name));
const missing = paths.filter((p) => !removedNames.has(p));
if (missing.length > 0) {
  console.log("");
  console.log("Not confirmed removed (already gone, or path mismatch) — verify manually:");
  missing.forEach((p) => console.log(`  - ${p}`));
}
