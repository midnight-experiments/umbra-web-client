// The C-ABI WebAssembly client (wasm/src/lib.rs, the proof of concept's pss-ipir.wasm) and the platform round trip.
// No Node or browser import: used by index.html and node-run.mjs alike.

export async function loadClientWasm(bytes) {
  let memory;
  const t0 = performance.now();
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      // The one host import: the platform's cryptographic source (at most 65,536 bytes per getRandomValues call).
      fill_random(ptr, len) {
        for (let off = 0; off < len; off += 65536) {
          crypto.getRandomValues(new Uint8Array(memory.buffer, ptr + off, Math.min(65536, len - off)));
        }
      },
    },
  });
  const instantiateMs = performance.now() - t0;
  const x = instance.exports;
  memory = x.memory;
  const view = () => new Uint8Array(memory.buffer);
  const put = (bytes) => {
    const p = x.alloc(bytes.length);
    view().set(bytes, p);
    return p;
  };
  const error = () => new TextDecoder().decode(view().slice(x.error_ptr(), x.error_ptr() + x.error_len()));

  class Client {
    constructor(rows, cols, seed, snapshot, masks) {
      const [s, n, m] = [put(seed), put(snapshot), put(masks)];
      this.rows = rows;
      this.cols = cols;
      this.handle = x.client_new(rows, cols, s, n, m, masks.length);
      x.dealloc(s, 32), x.dealloc(n, 32), x.dealloc(m, masks.length);
      if (!this.handle) throw new Error(error());
    }
    request(row) {
      const len = x.request_bytes(this.rows);
      const out = x.alloc(len);
      const state = x.request_new(this.handle, row, out, len);
      const bytes = view().slice(out, out + len);
      x.dealloc(out, len);
      if (!state) throw new Error(error());
      return { state, bytes };
    }
    decode(request, answer) {
      const a = put(answer);
      const len = 2 * this.cols;
      const out = x.alloc(len);
      const status = x.decode(this.handle, request.state, a, answer.length, out, len);
      const row = view().slice(out, out + len);
      x.dealloc(a, answer.length), x.dealloc(out, len), x.request_free(request.state);
      if (status !== 0) throw new Error(error());
      return row;
    }
    free() {
      x.client_free(this.handle);
    }
  }
  return { Client, instantiateMs, memoryBytes: () => memory.buffer.byteLength };
}

const unhex = (s) => Uint8Array.from(s.match(/../g), (h) => parseInt(h, 16));
const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Runs `n` round trips on every table of the server at `base`, posts one report per table, and returns them.
export async function runAll(base, wasmBytes, platform, n = 7, extra = () => ({})) {
  const get = async (path) => new Uint8Array(await (await fetch(base + path)).arrayBuffer());
  const wasm = await loadClientWasm(wasmBytes);
  const tables = await (await fetch(base + "/tables")).json();
  const reports = [];
  for (const t of tables) {
    const masks = await get(`/t/${t.name}/masks`);
    let t0 = performance.now();
    const client = new wasm.Client(t.rows, t.cols, unhex(t.seed), unhex(t.snapshot), masks);
    const loadMs = performance.now() - t0;
    const q = [], d = [];
    let ok = true, requestBytes = 0, answerBytes = 0;
    for (let i = 0; i < n; i++) {
      const row = (i * 7919 + 5) % t.rows;
      t0 = performance.now();
      const request = client.request(row);
      q.push(performance.now() - t0);
      const answer = new Uint8Array(await (await fetch(`${base}/t/${t.name}/answer`, { method: "POST", body: request.bytes })).arrayBuffer());
      t0 = performance.now();
      const decoded = client.decode(request, answer);
      d.push(performance.now() - t0);
      ok &&= equal(decoded, await get(`/t/${t.name}/row/${row}`));
      requestBytes = request.bytes.length, answerBytes = answer.length;
    }
    client.free();
    const report = {
      platform, table: t.name, match: ok, requests: n,
      instantiateMs: +wasm.instantiateMs.toFixed(2), loadMs: +loadMs.toFixed(2),
      queryMsMedian: +median(q).toFixed(2), decodeMsMedian: +median(d).toFixed(2),
      masksBytes: masks.length, requestBytes, answerBytes,
      wasmBytes: wasmBytes.byteLength, wasmMemoryBytes: wasm.memoryBytes(), ...extra(),
    };
    reports.push(report);
    await fetch(base + "/report", { method: "POST", body: JSON.stringify(report) });
  }
  return reports;
}
