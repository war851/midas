// One-off generator: freezes the normalized+scrubbed golden from the vendored receiver.
// Run once in the container: `npx tsx tests/golden/_gen.ts > tests/golden/GOLDEN-EVENTS.json`.
// Not named *.test.ts so vitest ignores it.
import { deriveNormalizedRows } from "./derive.js";
console.log(JSON.stringify(deriveNormalizedRows(), null, 2));
