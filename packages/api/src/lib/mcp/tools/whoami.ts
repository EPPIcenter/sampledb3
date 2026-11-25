import { z } from 'zod'
import { defineMcpTool } from '../types'

const whoamiOutputSchema = z.object({
  user: z.object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    username: z.string().optional(),
  }),
  role: z.enum(['viewer', 'member']),
  instance: z.object({
    name: z.string(),
    version: z.string(),
    buildId: z.string(),
  }),
  importsAvailable: z.boolean(),
  importsUnavailableReason: z.string().optional(),
})

export const whoamiTool = defineMcpTool({
  name: 'whoami',
  title: 'Who Am I',
  description:
    'Return the signed-in user, the role in effect for this Connected app (capped at member), the SampleDB instance name and build, and whether import tools are available.',
  access: 'read',
  outputSchema: whoamiOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  handler: (_args, ctx) => {
    const payload: z.infer<typeof whoamiOutputSchema> = {
      user: {
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        ...(ctx.user.username ? { username: ctx.user.username } : {}),
      },
      role: ctx.effectiveRole,
      instance: {
        name: ctx.instance.name,
        version: ctx.instance.version,
        buildId: ctx.instance.buildId,
      },
      importsAvailable: ctx.canWrite,
      ...(ctx.canWrite
        ? {}
        : {
            importsUnavailableReason:
              'Your account has the viewer role, which allows reading and exporting data but not importing or creating records.',
          }),
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(payload, null, 2),
        },
      ],
      structuredContent: payload,
    }
  },
})
