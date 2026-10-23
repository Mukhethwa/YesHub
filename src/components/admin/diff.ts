/*
 * Turns two snapshots of a record into the values that changed, so the change log reads as "Evaluation ›
 * Checks › Delivers where the work is › Passed: Yes → No" instead of two blocks of JSON. Records are walked
 * field by field; lists of records are matched by their id, key or label, so a reordered list doesn't read
 * as a change. Something that exists on one side only (a check that was added, a cancellation that was set)
 * is one row, shown whole on the side it's on.
 */

export type DiffRow = {
  /** Readable path, e.g. ["Evaluation", "Checks", "Delivers where the work is", "Passed"]. */
  path: string[];
  /** The top-level field, for marking encrypted ones. */
  field: string;
  /** The last key, for formatting (timestamps end in "At"). */
  key: string;
  before: unknown;
  after: unknown;
};

/** Fields only staff need: ids that link records, and the service behind the automated review. */
const TECHNICAL_KEYS = new Set([
  "organizationId",
  "opportunityId",
  "applicationId",
  "smeId",
  "storageId",
  "workflowId",
  "runId",
  "generationId",
  "documentId",
  "model",
  "engine",
  "costUsd",
  "isDemo",
]);

/** Whether a key is shown to this reader. Ids inside list items name the item already, so they're dropped too. */
export function visibleKey(key: string, technical: boolean, inListItem = false) {
  if (technical) return true;
  return !TECHNICAL_KEYS.has(key) && !(inListItem && key === "id");
}

const WORDS: Record<string, string> = {
  bbbee: "B-BBEE",
  csd: "CSD",
  cipc: "CIPC",
  id: "ID",
  url: "URL",
  usd: "USD",
};

/** "statusChangedAt" → "Status changed at", "minBbbeeLevel" → "Min B-BBEE level". */
export function humanise(key: string) {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => WORDS[w] ?? w);
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isRecordList = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.length > 0 && v.every(isRecord);

/** What identifies an item in a list of records, and what to call it. */
function identity(item: Record<string, unknown>, index: number) {
  const pick = (...keys: string[]) => {
    for (const k of keys) if (typeof item[k] === "string" || typeof item[k] === "number") return String(item[k]);
    return undefined;
  };
  return {
    key: pick("id", "key", "criterion", "field", "label", "name", "storageId") ?? `#${index + 1}`,
    label: pick("label", "criterion", "name", "text", "field", "title", "id", "key") ?? `Item ${index + 1}`,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diffValue(
  a: unknown,
  b: unknown,
  path: string[],
  key: string,
  field: string,
  technical: boolean,
  inListItem: boolean,
  rows: DiffRow[],
) {
  if (same(a, b)) return;
  if (isRecord(a) && isRecord(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!visibleKey(k, technical, inListItem)) continue;
      diffValue(a[k], b[k], [...path, humanise(k)], k, field, technical, false, rows);
    }
    return;
  }
  const listA =
    isRecordList(a) || (a === undefined && isRecordList(b)) || (Array.isArray(a) && !a.length && isRecordList(b));
  const listB =
    isRecordList(b) || (b === undefined && isRecordList(a)) || (Array.isArray(b) && !b.length && isRecordList(a));
  if (listA && listB) {
    const items = (list: unknown) =>
      new Map(
        (Array.isArray(list) ? (list as Record<string, unknown>[]) : []).map((item, i) => {
          const id = identity(item, i);
          return [id.key, { item, label: id.label }] as const;
        }),
      );
    const before = items(a);
    const after = items(b);
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const x = before.get(id);
      const y = after.get(id);
      diffValue(x?.item, y?.item, [...path, (y ?? x)!.label], key, field, technical, true, rows);
    }
    return;
  }
  rows.push({ path, field, key, before: a, after: b });
}

/** The values that differ between two snapshots, in the order the record lists them. */
export function diffRecords(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fields: string[],
  technical: boolean,
): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const field of fields) {
    if (!visibleKey(field, technical)) continue;
    diffValue(before?.[field], after?.[field], [humanise(field)], field, field, technical, false, rows);
  }
  return rows;
}

/** Every field of a record that was created or deleted, one row each. */
export function listRecord(record: Record<string, unknown>, technical: boolean, deleted: boolean): DiffRow[] {
  return Object.keys(record)
    .sort()
    .filter((field) => visibleKey(field, technical))
    .map((field) => ({
      path: [humanise(field)],
      field,
      key: field,
      before: deleted ? record[field] : undefined,
      after: deleted ? undefined : record[field],
    }));
}
