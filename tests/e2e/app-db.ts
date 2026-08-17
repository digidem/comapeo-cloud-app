import { type Page, expect } from '@playwright/test';

const DB_NAME = 'comapeo-cloud-app';
const READY_TIMEOUT_MS = 10_000;

export const APP_DB_TABLES = [
  'projects',
  'observations',
  'alerts',
  'attachments',
  'tracks',
  'fields',
  'remoteServers',
  'syncMetadata',
  'presets',
  'iconCache',
  'maps',
] as const;

export type AppDbTableName = (typeof APP_DB_TABLES)[number];

export interface E2eBlobSeed {
  readonly __e2eBlob: {
    readonly bytes: readonly number[];
    readonly type: string;
  };
}

export type AppDbSeed = Partial<
  Record<AppDbTableName, readonly Record<string, unknown>[]>
>;

type DbOperation =
  | { kind: 'seed'; seed: AppDbSeed }
  | { kind: 'count'; table: AppDbTableName }
  | { kind: 'get'; table: AppDbTableName; key: IDBValidKey }
  | {
      kind: 'getAllByIndex';
      table: AppDbTableName;
      index: string;
      value: IDBValidKey;
    }
  | {
      kind: 'update';
      table: AppDbTableName;
      key: IDBValidKey;
      changes: Record<string, unknown>;
    };

type DbOperationResult =
  | { ok: true; value?: unknown }
  | { ok: false; retryable: boolean; message: string };

export function e2eBlob(bytes: Uint8Array, type: string): E2eBlobSeed {
  return {
    __e2eBlob: {
      bytes: Array.from(bytes),
      type,
    },
  };
}

async function executeDbOperation(
  page: Page,
  operation: DbOperation,
): Promise<unknown> {
  let result: DbOperationResult | undefined;

  await expect(async () => {
    result = await page.evaluate<
      DbOperationResult,
      { dbName: string; operation: unknown }
    >(
      async ({ dbName, operation: serializedOperation }) => {
        const operation = serializedOperation as DbOperation;
        const requiredStores =
          operation.kind === 'seed'
            ? Object.keys(operation.seed)
            : [operation.table];

        const databaseList = await indexedDB.databases();
        const existing = databaseList.find(
          (database) => database.name === dbName && (database.version ?? 0) > 0,
        );
        if (!existing) {
          return {
            ok: false,
            retryable: true,
            message: `Database ${dbName} has not been created by the app yet`,
          };
        }

        let database: IDBDatabase;
        try {
          database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(dbName);
            request.onerror = () =>
              reject(request.error ?? new Error(`Failed to open ${dbName}`));
            request.onblocked = () =>
              reject(new Error(`Opening ${dbName} was blocked`));
            request.onsuccess = () => resolve(request.result);
          });
        } catch (error) {
          return {
            ok: false,
            retryable: true,
            message: error instanceof Error ? error.message : String(error),
          };
        }

        const missingStores = requiredStores.filter(
          (name) => !database.objectStoreNames.contains(name),
        );
        if (missingStores.length > 0) {
          database.close();
          return {
            ok: false,
            retryable: true,
            message: `App Dexie schema is not ready; missing stores: ${missingStores.join(', ')}`,
          };
        }

        const reviveSeedValue = (value: unknown): unknown => {
          if (Array.isArray(value)) return value.map(reviveSeedValue);
          if (value === null || typeof value !== 'object') return value;

          const record = value as Record<string, unknown>;
          const blobMarker = record.__e2eBlob;
          if (
            blobMarker &&
            typeof blobMarker === 'object' &&
            !Array.isArray(blobMarker)
          ) {
            const marker = blobMarker as Record<string, unknown>;
            if (
              Array.isArray(marker.bytes) &&
              marker.bytes.every((byte) => typeof byte === 'number') &&
              typeof marker.type === 'string'
            ) {
              return new Blob([new Uint8Array(marker.bytes)], {
                type: marker.type,
              });
            }
          }

          return Object.fromEntries(
            Object.entries(record).map(([key, child]) => [
              key,
              reviveSeedValue(child),
            ]),
          );
        };

        const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> =>
          new Promise<T>((resolve, reject) => {
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });

        try {
          if (operation.kind === 'seed') {
            const storeNames = Object.keys(operation.seed);
            if (storeNames.length === 0) {
              database.close();
              return { ok: true };
            }

            const transaction = database.transaction(storeNames, 'readwrite');
            for (const [tableName, records] of Object.entries(operation.seed)) {
              const store = transaction.objectStore(tableName);
              for (const record of records ?? []) {
                store.put(reviveSeedValue(record));
              }
            }
            await new Promise<void>((resolve, reject) => {
              transaction.oncomplete = () => resolve();
              transaction.onerror = () => reject(transaction.error);
              transaction.onabort = () =>
                reject(
                  transaction.error ?? new Error('Seed transaction aborted'),
                );
            });
            return { ok: true };
          }

          if (operation.kind === 'count') {
            const transaction = database.transaction(
              operation.table,
              'readonly',
            );
            const value = await requestAsPromise(
              transaction.objectStore(operation.table).count(),
            );
            return { ok: true, value };
          }

          if (operation.kind === 'get') {
            const transaction = database.transaction(
              operation.table,
              'readonly',
            );
            const value = await requestAsPromise(
              transaction.objectStore(operation.table).get(operation.key),
            );
            return { ok: true, value };
          }

          if (operation.kind === 'getAllByIndex') {
            const transaction = database.transaction(
              operation.table,
              'readonly',
            );
            const value = await requestAsPromise(
              transaction
                .objectStore(operation.table)
                .index(operation.index)
                .getAll(operation.value),
            );
            return { ok: true, value };
          }

          const transaction = database.transaction(
            operation.table,
            'readwrite',
          );
          const store = transaction.objectStore(operation.table);
          const current = await requestAsPromise(store.get(operation.key));
          if (!current || typeof current !== 'object') {
            throw new Error(
              `Cannot update missing ${operation.table} record ${String(operation.key)}`,
            );
          }
          store.put({
            ...(current as Record<string, unknown>),
            ...(reviveSeedValue(operation.changes) as Record<string, unknown>),
          });
          await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () =>
              reject(
                transaction.error ?? new Error('Update transaction aborted'),
              );
          });
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            retryable: false,
            message: error instanceof Error ? error.message : String(error),
          };
        } finally {
          database.close();
        }
      },
      { dbName: DB_NAME, operation },
    );

    if (!result.ok && result.retryable) {
      throw new Error(result.message);
    }
  })
    .toPass({ timeout: READY_TIMEOUT_MS, intervals: [100, 200, 500] })
    .catch((error: unknown) => {
      const detail =
        result && !result.ok
          ? result.message
          : 'app database did not become ready';
      throw new Error(
        `E2E database operation failed (${operation.kind}): ${detail}`,
        { cause: error },
      );
    });

  if (!result?.ok) {
    const detail = result ? result.message : 'operation returned no result';
    throw new Error(
      `E2E database operation failed (${operation.kind}): ${detail}`,
    );
  }
  return result.value;
}

export async function seedAppDatabase(
  page: Page,
  seed: AppDbSeed,
): Promise<void> {
  await executeDbOperation(page, { kind: 'seed', seed });
}

export async function countAppDatabaseRecords(
  page: Page,
  table: AppDbTableName,
): Promise<number> {
  return (await executeDbOperation(page, { kind: 'count', table })) as number;
}

export async function getAppDatabaseRecord<T>(
  page: Page,
  table: AppDbTableName,
  key: IDBValidKey,
): Promise<T | undefined> {
  return (await executeDbOperation(page, { kind: 'get', table, key })) as
    T | undefined;
}

export async function getAppDatabaseRecordsByIndex<T>(
  page: Page,
  table: AppDbTableName,
  index: string,
  value: IDBValidKey,
): Promise<T[]> {
  return (await executeDbOperation(page, {
    kind: 'getAllByIndex',
    table,
    index,
    value,
  })) as T[];
}

export async function updateAppDatabaseRecord(
  page: Page,
  table: AppDbTableName,
  key: IDBValidKey,
  changes: Record<string, unknown>,
): Promise<void> {
  await executeDbOperation(page, { kind: 'update', table, key, changes });
}
