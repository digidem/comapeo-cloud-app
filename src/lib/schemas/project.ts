import * as v from 'valibot';

export const projectsResponseSchema = v.object({
  data: v.array(
    v.object({
      projectId: v.string(),
      name: v.optional(v.string()),
    }),
  ),
});

export const projectDetailResponseSchema = v.object({
  data: v.object({
    projectId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    iconRef: v.optional(
      v.object({
        docId: v.string(),
        name: v.optional(v.string()),
        contentType: v.optional(v.string()),
      }),
    ),
  }),
});
