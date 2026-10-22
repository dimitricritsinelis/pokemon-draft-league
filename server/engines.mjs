import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

let cache;
export function loadEngines() {
  if (cache) return cache;
  const window = { crypto: webcrypto };
  const context = vm.createContext({ window, console, Math, Date, Set, Map, Uint8Array, TextEncoder, TextDecoder });
  for (const file of ['assets/pokemon.js', 'ratings.js', 'simulation.js', 'auction.js']) {
    const path = fileURLToPath(new URL('../dist/' + file, import.meta.url));
    vm.runInContext(readFileSync(path, 'utf8'), context, { filename: file, timeout: 10000 });
  }
  cache = window;
  return cache;
}
