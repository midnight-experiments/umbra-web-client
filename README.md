# umbra-web-client

The Web shell of the IPIR+SP client: the C-ABI WebAssembly built by
[`universal-gpu-reinspire-client`](https://github.com/midnight-experiments/universal-gpu-reinspire-client) (`dist/web/pss-ipir.wasm`), loaded with no
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

<!-- common: start (the same section in all four repositories) -->
## The four repositories

| Repository | What it holds |
|---|---|
| [universal-gpu-reinspire-client](https://github.com/midnight-experiments/universal-gpu-reinspire-client) | The Rust code: the shared client over upstream `ipir-sp`, the C-ABI wasm for the Web, the UniFFI crate for Swift and Kotlin, and the test server. It builds `dist/` for the three below. |
| [umbra-web-client](https://github.com/midnight-experiments/umbra-web-client) | Web: the wasm in the browser and in Node |
| [umbra-ios-client](https://github.com/midnight-experiments/umbra-ios-client) | iOS: Swift package over the XCFramework, XCTest on the simulator |
| [umbra-android-client](https://github.com/midnight-experiments/umbra-android-client) | Android: Gradle library over `libps_client.so`, instrumentation test on the emulator |

The platform repositories expect `universal-gpu-reinspire-client` to be cloned next to them (or at `RUST_CLIENT`).
Each one's `scripts/test.sh` builds what it needs there, starts the test server and runs the round trip.

## Results (2026-11-25)

Every platform ran the same round trip against the same native server. For each of three tables (2,048 × 2,048,
8,192 × 4,096, and 32,768 × 2,048, the row cap), the client loaded the masks and made 7 requests (5 for wasmtime). The
server answered each one, the client decoded it, and the decoded row equalled the table's row byte for byte on every
platform.

| Platform | Code | Round trip | Query build, ms (2048² / 8192×4096 / 32768×2048) | Decode, ms | Masks load, ms | Client binary | Memory |
|---|---|---|---|---|---|---|---|
| iOS simulator (iPhone 17, iOS 26.3) | UniFFI Swift | 3/3 match | 4.5 / 7.7 / 19.1 | 0.04–0.07 | 1.5 | 0.50 MB (arm64 dylib) | +5.7 to +11.7 MB footprint |
| Android emulator (API 35, arm64-v8a) | UniFFI Kotlin + JNA | 3/3 match | 6.2 / 9.3 / 26.1 | 0.76–1.35 | 2.9–21.0 ¹ | 0.57 MB (arm64 `.so`) | 7.0–8.4 MB native heap ² |
| Browser (Chromium) | C-ABI wasm | 3/3 match | 7.3 / 12.1 / 30.3 | ≤ 0.1 ³ | 2.5–7.1 | 157,625 B (wasm) | 2.2–3.5 MB wasm memory |
| Node 24.9 | C-ABI wasm | 3/3 match | 7.4 / 12.4 / 30.7 | 0.03–0.06 | 2.6–5.7 | same wasm | 2.2–3.5 MB wasm memory |
| macOS, native Rust (baseline) | Rust | 3/3 match | 5.7 / 7.5 / 18.9 | 0.02–0.04 | 1.4–2.0 | — | 2.6–10.1 MB peak RSS ² |
| wasmtime 36, Cranelift JIT (on macOS) | same wasm | 3/3 match | 10.0 / 17.3 / 43.4 | 0.02–0.04 | 2.6–3.2 | wasm + 7.5 MB runtime | 2.2–4.6 MB wasm memory |
| wasmtime 36, Pulley interpreter (on macOS; what iOS would need, no JIT) | same wasm | 3/3 match | 230 / 401 / 1,045 | 0.57–1.10 | 48–64 | wasm + 7.5 MB runtime | 2.2–4.6 MB wasm memory |

¹ The first load includes loading the library through JNA. ² The whole process. ³ The browser clamps
`performance.now()` to 0.1 ms.

The sizes on the wire are the same on every platform:

| Table | Masks (once per table) | Request (fresh key in each) | Answer | Decoded row |
|---|---|---|---|---|
| 2,048 × 2,048 | 14,884 B | 40,228 B | 5,700 B | 4,096 B |
| 8,192 × 4,096 | 29,732 B | 77,860 B | 11,332 B | 8,192 B |
| 32,768 × 2,048 | 14,884 B | 228,388 B | 5,700 B | 4,096 B |

How it was run:

- One Apple M4 Max (48 GB), shared with other work. Times are medians of the client's own work, without the
  network. The server answered each request in 1–3 ms.
- The iOS simulator and the Android emulator (an arm64 guest under the macOS hypervisor) run at close to the Mac's
  speed, not a phone's. No real device was measured.
- The wasm is bit-identical to the private shielded sync proof of concept's: sha256 `826610cd…49e6`.

**Conclusion.** UniFFI for iOS and Android and the C-ABI wasm for the Web, all over one Rust crate. Both bindings ran
at native speed from the same source as the wasm. Running the wasm in an embedded runtime on iOS would mean an
interpreter (no JIT is allowed there), 40–55× slower: a second per query at the row cap.

Every report, the timings of each run and the build steps are in
[`docs/platform-results-2026-11-25.md`](https://github.com/midnight-experiments/universal-gpu-reinspire-client/blob/main/docs/platform-results-2026-11-25.md).
<!-- common: end -->
