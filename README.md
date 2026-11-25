# umbra-web-client

The Web shell of the IPIR+SP client: the C-ABI WebAssembly built by
[`universal-gpu-reinspire-client`](../universal-gpu-reinspire-client) (`dist/web/pss-ipir.wasm`), loaded with no
wasm-bindgen, and a round trip that runs unchanged in the browser and in Node.

| File | What |
|---|---|
| `ps-wasm.mjs` | `loadClientWasm(bytes)`: the wasm's C-ABI (alloc, `client_new`, `request_new`, `decode`, …) as a `Client` class; the one host import, `env.fill_random`, answered by `crypto.getRandomValues`. `runAll(base, wasm, platform)`: the round trip against the test server |
| `index.html` | runs `runAll` in the page; the title becomes `PASS`, `FAIL` or `ERROR` |
| `node-run.mjs` | the same in Node (`node node-run.mjs [server]`) |

## Build and test

Needs the Rust repository next to this one (or `RUST_CLIENT=<path>`), Node 20+ (24.9 used) and, for the browser
step, Google Chrome (or `BROWSER=<path to a Chromium-based browser>`; `BROWSER=none` skips it).

```sh
scripts/test.sh
```

It builds `pss-ipir.wasm` (and checks its digest against the reference) and the test server in the Rust repository,
copies the wasm here, starts `ps-server` on port 8787 (`PORT`) with this folder as its web root and three tables
(2,048 × 2,048, 8,192 × 4,096, 32,768 × 2,048), and runs the round trip in Node, then in headless Chrome. Each run
loads the masks, makes 7 requests per table, has the server answer them, decodes, and compares the decoded row with the
table's row byte for byte. Every report (timings, sizes, `match`) is in `results/reports.jsonl`.

To watch it in a browser, start the server as the script does and open `http://localhost:8787/`.

## Measured (Apple M4 Max, Chromium-based browser and Node 24.9)

Query build 7–31 ms, decode under 0.1 ms, masks load 2.5–7 ms. The wasm is 157,625 bytes, and its linear memory is
2.2–3.5 MB. A request is 40–228 KB, an answer 5.7–11 KB.
