import * as v from 'valibot';

export const projectsResponseSchema = v.object({
  data: v.array(
    v.object({
      projectId: v.string(),
      name: v.optional(v.string()),
    }),
  ),
});
