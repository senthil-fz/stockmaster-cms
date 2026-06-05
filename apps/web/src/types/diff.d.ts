// Minimal ambient types for `diff` (jsdiff v7 ships no .d.ts and the @types/diff stub is
// mismatched). We only use `diffWords`, so declare exactly that surface.
declare module 'diff' {
  export interface Change {
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  }
  export function diffWords(oldStr: string, newStr: string): Change[];
}
