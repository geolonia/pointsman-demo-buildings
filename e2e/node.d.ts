// The one Node.js function the smoke tests use (the repository has no @types/node):
// as text, or as bytes (for files the tests serve, such as MapLibre).
declare module 'node:fs' {
  export function readFileSync(path: URL, encoding: 'utf8'): string;
  export function readFileSync(path: URL): Uint8Array;
}
