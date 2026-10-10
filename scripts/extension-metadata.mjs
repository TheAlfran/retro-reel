import { mkdir, writeFile } from 'node:fs/promises';

// Recreate the CommonJS boundary when building from a fresh checkout.
const output = new URL('../extension-dist/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('package.json', output), '{\n  "type": "commonjs"\n}\n');
