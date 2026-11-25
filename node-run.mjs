// node web/node-run.mjs [http://127.0.0.1:8787] — the same round trip as index.html, in Node.
import { readFile } from "node:fs/promises";
import { runAll } from "./ps-wasm.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
const bytes = await readFile(new URL("./pss-ipir.wasm", import.meta.url));
const reports = await runAll(base, bytes, `node-${process.version}`, 7, () => ({ peakRssBytes: process.resourceUsage().maxRSS * 1024 }));
for (const r of reports) console.log(JSON.stringify(r));
process.exit(reports.every((r) => r.match) ? 0 : 1);
