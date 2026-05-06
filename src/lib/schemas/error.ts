import * as v from 'valibot';

export const errorResponseSchema = v.object({
  error: v.object({
    code: v.string(),
    message: v.string(),
  }),
});
