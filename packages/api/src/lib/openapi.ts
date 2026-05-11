/**
 * OpenAPI/Swagger documentation setup
 * 
 * Note: To enable full OpenAPI support, install @hono/zod-openapi:
 *   bun add @hono/zod-openapi
 * 
 * Then update routes to use OpenAPIHono instead of Hono
 */

export const openApiInfo = {
  openapi: '3.0.0',
  info: {
    title: 'SampleDB API',
    version: '1.1.0',
    description: 'API documentation for SampleDB - Laboratory sample management system',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
    {
      url: 'https://api.sampledb.example.com',
      description: 'Production server',
    },
  ],
  tags: [
    { name: 'Studies', description: 'Study management endpoints' },
    { name: 'Subjects', description: 'Subject management endpoints' },
    { name: 'Specimens', description: 'Specimen management endpoints' },
    { name: 'Containers', description: 'Container management endpoints' },
    { name: 'Controls', description: 'Control batch and definition endpoints' },
    { name: 'Locations', description: 'Location hierarchy management' },
    { name: 'Reference Data', description: 'Specimen types, storage types, tags, strains, units' },
    { name: 'Export', description: 'Data export endpoints' },
    { name: 'Import', description: 'Data import endpoints' },
    { name: 'Search', description: 'Unified search endpoints' },
    { name: 'Statistics', description: 'Statistics and analytics endpoints' },
  ],
  components: {
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          errorCode: { type: 'string' },
          details: { type: 'object' },
        },
        required: ['error'],
      },
      ApiResponse: {
        type: 'object',
        properties: {
          data: { type: 'object' },
          meta: {
            type: 'object',
            properties: {
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' },
                },
              },
            },
          },
        },
        required: ['data'],
      },
    },
    responses: {
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      InternalServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
  },
}

/**
 * Basic OpenAPI endpoint (returns JSON schema)
 * For full Swagger UI, install @hono/swagger-ui
 */
export function createOpenApiRoute() {
  return async (c: any) => {
    return c.json(openApiInfo)
  }
}
