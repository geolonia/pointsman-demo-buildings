// The one Node.js function the smoke tests use (the repository has no @types/node).
declare module 'node:fs' {
  export function readFileSync(path: URL, encoding: 'utf8'): string;
}
