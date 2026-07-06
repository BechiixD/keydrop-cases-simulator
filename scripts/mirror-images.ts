#!/usr/bin/env node

import { runMirror } from "../lib/mirror";

async function main() {
  console.log("Mirroring images from data/cases-cache.json → public/img/ ...\n");
  const result = await runMirror();
  console.log(`\nDone.`);
  console.log(`  total assets checked: ${result.total}`);
  console.log(`  skipped (already local): ${result.skipped}`);
  console.log(`  downloaded: ${result.downloaded}`);
  console.log(`  failed: ${result.failed}`);
  if (result.failedUrls.length > 0) {
    console.log("  failed URLs:");
    for (const u of result.failedUrls) console.log(`    ${u}`);
  }
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
