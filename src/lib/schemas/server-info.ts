import * as v from 'valibot';

export const serverInfoResponseSchema = v.object({
  data: v.object({
    deviceId: v.string(),
    name: v.string(),
  }),
});
