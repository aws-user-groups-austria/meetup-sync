/**
 * Deep merge for source.json overrides.
 *
 * - Objects merge key by key, recursively.
 * - Arrays of objects merge element by element, matched by `id`, else by
 *   `name` (segments by id, speakers and sponsors by name). An override
 *   element with no match is appended.
 * - Any other array (for example `notices`) replaces the base array.
 * - `null` removes the key.
 * - Anything else replaces the base value.
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function identity(v: unknown): { key: "id" | "name"; value: unknown } | undefined {
  if (!isPlainObject(v)) return undefined;
  if (typeof v.id === "string") return { key: "id", value: v.id };
  if (typeof v.name === "string") return { key: "name", value: v.name };
  return undefined;
}

const clone = <T>(v: T): T => structuredClone(v);

function mergeArrays(base: unknown[], over: unknown[]): unknown[] {
  if (!over.every((o) => identity(o))) return clone(over);
  const out = base.map(clone);
  for (const o of over) {
    const id = identity(o)!;
    const idx = out.findIndex((b) => isPlainObject(b) && b[id.key] === id.value);
    if (idx >= 0) out[idx] = deepMerge(out[idx], o);
    else out.push(stripNulls(o));
  }
  return out;
}

function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== null) out[k] = stripNulls(x);
    return out;
  }
  return v;
}

export function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) return clone(base);
  if (Array.isArray(override)) {
    return (Array.isArray(base) ? mergeArrays(base, override) : stripNulls(override)) as T;
  }
  if (isPlainObject(override)) {
    const out: Record<string, unknown> = isPlainObject(base) ? clone(base) : {};
    for (const [k, v] of Object.entries(override)) {
      if (v === null) delete out[k];
      else out[k] = deepMerge(out[k], v);
    }
    return out as T;
  }
  return override as T;
}

export type { Json };
