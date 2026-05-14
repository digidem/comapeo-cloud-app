import * as v from 'valibot';

export const backupSchema = v.object({
  version: v.pipe(v.number(), v.value(1)),
  exportedAt: v.string(),
  data: v.record(v.string(), v.string()),
});

export type BackupData = v.InferOutput<typeof backupSchema>;
