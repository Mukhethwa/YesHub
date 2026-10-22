import type {
  DocumentByName,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  PaginationResult,
  TableNamesInDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";

import type { DataModel } from "../_generated/dataModel";

/*
 * Field-level encryption at rest: AES-256-GCM, with a random 96-bit IV per value and the table and field
 * name as associated data (so a ciphertext can't be moved to another field). Ciphertexts are stored as
 * "enc:v1:<base64 iv + ciphertext + tag>".
 *
 * It's transparent to the app: functions in convex/functions.ts wrap ctx.db so writes encrypt the fields
 * below and reads decrypt them. Anything stored before encryption was switched on is still plaintext and
 * reads as-is until encryptExisting (convex/encryption.ts) rewrites it.
 *
 * The key is DATA_ENCRYPTION_KEY on the Convex deployment: 32 random bytes, base64. Losing it loses the
 * data, and changing it makes existing values unreadable.
 *
 * Not covered: indexed and searchable fields (encrypting them would break lookups), uploaded files (Convex
 * storage, which Convex encrypts at rest), and the Better Auth tables in the betterAuth component.
 */

type Table = TableNamesInDataModel<DataModel>;

/** Personal and identifying details: contact people, registration numbers, and what SMEs wrote or sent. */
export const ENCRYPTED_FIELDS: Partial<Record<Table, readonly string[]>> = {
  smes: ["registrationNumber", "csdNumber", "address", "contactName", "contactRole", "email", "phone"],
  applications: ["proposal"],
  documentExtractions: ["excerpt"],
};

const PREFIX = "enc:v1:";
const IV_BYTES = 12;

export const isEncrypted = (value: unknown): value is string => typeof value === "string" && value.startsWith(PREFIX);

let cachedKey: Promise<CryptoKey> | null = null;

function encryptionKey() {
  if (!cachedKey) {
    const raw = process.env.DATA_ENCRYPTION_KEY;
    if (!raw) throw new Error("DATA_ENCRYPTION_KEY isn’t set on this Convex deployment.");
    const bytes = fromBase64(raw);
    if (bytes.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes (AES-256), base64-encoded.");
    cachedKey = crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  return cachedKey;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string) {
  const binary = atob(text.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const additionalData = (table: string, field: string) => new TextEncoder().encode(`${table}.${field}`);

export async function encryptValue(table: string, field: string, plaintext: string) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: additionalData(table, field) },
      await encryptionKey(),
      new TextEncoder().encode(plaintext),
    ),
  );
  const out = new Uint8Array(IV_BYTES + sealed.length);
  out.set(iv);
  out.set(sealed, IV_BYTES);
  return PREFIX + toBase64(out);
}

export async function decryptValue(table: string, field: string, value: string) {
  const bytes = fromBase64(value.slice(PREFIX.length));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, IV_BYTES), additionalData: additionalData(table, field) },
    await encryptionKey(),
    bytes.slice(IV_BYTES),
  );
  return new TextDecoder().decode(plain);
}

/** A document (or a change-log snapshot) with its encrypted fields decrypted. */
export async function decryptFields<T extends Record<string, unknown>>(table: string, doc: T): Promise<T> {
  const fields = ENCRYPTED_FIELDS[table as Table];
  if (!fields) return doc;
  const out: Record<string, unknown> = { ...doc };
  for (const field of fields) {
    const value = out[field];
    if (isEncrypted(value)) out[field] = await decryptValue(table, field, value);
  }
  return out as T;
}

/**
 * Encrypts a write's sensitive fields. A value that's unchanged keeps its existing ciphertext, so the change
 * log doesn't show every replace as a change to every encrypted field.
 */
async function encryptFields(table: string, value: Record<string, unknown>, existing?: Record<string, unknown> | null) {
  const fields = ENCRYPTED_FIELDS[table as Table];
  if (!fields) return value;
  const out: Record<string, unknown> = { ...value };
  for (const field of fields) {
    const plain = out[field];
    // Empty strings stay empty: they carry no information, and code checks them for truthiness
    if (typeof plain !== "string" || plain === "" || isEncrypted(plain)) continue;
    const previous = existing?.[field];
    if (isEncrypted(previous) && (await decryptValue(table, field, previous)) === plain) {
      out[field] = previous;
    } else {
      out[field] = await encryptValue(table, field, plain);
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------------ */
/* Wrapping ctx.db                                                                                        */
/* ------------------------------------------------------------------------------------------------------ */

type AnyDoc = Record<string, unknown>;
const ENCRYPTED_TABLES = Object.keys(ENCRYPTED_FIELDS) as Table[];

/** Which encrypted table an id belongs to, for the one-argument forms of get, patch, replace and delete. */
function tableOf(db: GenericDatabaseReader<DataModel>, id: string) {
  return ENCRYPTED_TABLES.find((table) => db.normalizeId(table, id) !== null);
}

const decryptDoc = (table: string, doc: AnyDoc | null) => (doc ? decryptFields(table, doc) : doc);

/** Decrypts whatever a query chain returns: documents, arrays of them, pages, or async iteration. */
function wrapQuery<Q extends object>(query: Q, table: string): Q {
  return new Proxy(query, {
    get(target, prop, receiver) {
      if (prop === Symbol.asyncIterator) {
        return async function* () {
          for await (const doc of target as AsyncIterable<AnyDoc>) yield await decryptFields(table, doc);
        };
      }
      const member = Reflect.get(target, prop, receiver);
      if (typeof member !== "function") return member;
      return (...args: unknown[]) => {
        const result = (member as (...a: unknown[]) => unknown).apply(target, args);
        switch (prop) {
          case "collect":
          case "take":
            return (result as Promise<AnyDoc[]>).then((docs) => Promise.all(docs.map((d) => decryptFields(table, d))));
          case "first":
          case "unique":
            return (result as Promise<AnyDoc | null>).then((doc) => decryptDoc(table, doc));
          case "paginate":
            return (result as Promise<PaginationResult<AnyDoc>>).then(async (page) => ({
              ...page,
              page: await Promise.all(page.page.map((d) => decryptFields(table, d))),
            }));
          default:
            // withIndex, order, filter, … return the next link in the chain
            return result && typeof result === "object" ? wrapQuery(result as object, table) : result;
        }
      };
    },
  });
}

/** A reader that decrypts. For queries. */
export function decryptingReader(db: GenericDatabaseReader<DataModel>): GenericDatabaseReader<DataModel> {
  // get(table, id) or get(id)
  const get = async (...args: [string, string] | [string]) => {
    const table = args.length === 2 ? args[0] : tableOf(db, args[0]);
    const doc = await (db.get as (...a: unknown[]) => Promise<AnyDoc | null>)(...args);
    return table && ENCRYPTED_FIELDS[table as Table] ? decryptDoc(table, doc) : doc;
  };
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "get") return get;
      if (prop === "query") {
        return (table: Table) => {
          const query = target.query(table);
          return ENCRYPTED_FIELDS[table] ? wrapQuery(query, table) : query;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** A writer that encrypts on the way in and decrypts on the way out. For mutations. */
export function encryptingWriter(db: GenericDatabaseWriter<DataModel>): GenericDatabaseWriter<DataModel> {
  const reader = decryptingReader(db);
  const write =
    (method: "patch" | "replace") =>
    async (...args: unknown[]) => {
      // patch(table, id, value) or patch(id, value)
      const [table, id, value] =
        args.length === 3
          ? (args as [string, string, AnyDoc])
          : [tableOf(db, args[0] as string), args[0] as string, args[1] as AnyDoc];
      const call = db[method] as (...a: unknown[]) => Promise<void>;
      if (!table || !ENCRYPTED_FIELDS[table as Table]) return call(...args);
      const existing = await (db.get as unknown as (t: string, i: string) => Promise<AnyDoc | null>)(table, id);
      const encrypted = await encryptFields(table, value, existing);
      return args.length === 3 ? call(table, id, encrypted) : call(id, encrypted);
    };

  return new Proxy(db, {
    get(target, prop, receiver) {
      switch (prop) {
        case "get":
        case "query":
          return Reflect.get(reader, prop);
        case "insert":
          return async (table: Table, value: AnyDoc) =>
            target.insert(
              table,
              (await encryptFields(table, value)) as never as DocumentByName<DataModel, typeof table>,
            ) as Promise<GenericId<typeof table>>;
        case "patch":
          return write("patch");
        case "replace":
          return write("replace");
        default:
          return Reflect.get(target, prop, receiver);
      }
    },
  });
}
