export const cafeOpenApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Seth Sawariya CafeOS API',
    version: '1.0.0',
    description:
      'REST + Socket.IO API for CafeOS POS, Kitchen Display System (KDS), Floor Tables, Inventory, CRM, Loyalty, Campaigns, Staff & Settings.',
  },
  servers: [{ url: '/api', description: 'Same-origin CafeOS Express API' }],
  tags: [
    { name: 'System' },
    { name: 'Orders & KOT' },
    { name: 'Tables' },
    { name: 'Inventory' },
    { name: 'CRM & Loyalty' },
    { name: 'Campaigns & Staff' },
    { name: 'Auth & Settings' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'API & Socket.IO health check',
        responses: {
          '200': { description: 'Service healthy' },
        },
      },
    },
    '/bootstrap': {
      get: {
        tags: ['System'],
        summary: 'Fetch full authoritative CafeOS state snapshot',
        responses: {
          '200': { description: 'Complete CafeOS state bundle' },
        },
      },
    },
    '/orders': {
      get: {
        tags: ['Orders & KOT'],
        summary: 'List all orders',
        responses: { '200': { description: 'Array of CafeOrder' } },
      },
      post: {
        tags: ['Orders & KOT'],
        summary: 'Create a new order from Customer QR or POS Terminal (idempotent)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['serviceMode', 'items', 'paymentMode'],
                properties: {
                  serviceMode: { type: 'string', enum: ['dine-in', 'takeaway', 'delivery'] },
                  tableNumber: { type: 'string', example: 'T3' },
                  paymentMode: { type: 'string', enum: ['upi', 'cash', 'card'] },
                  couponCode: { type: 'string', example: 'CAFE50' },
                  isPosTerminal: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Order created & broadcast via Socket.IO' },
          '400': { description: 'Validation error' },
        },
      },
    },
    '/orders/{id}/advance': {
      post: {
        tags: ['Orders & KOT'],
        summary: 'Advance KOT status (placed -> preparing -> ready -> served)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Order updated' }, '404': { description: 'Not found' } },
      },
    },
    '/orders/{id}/toggle-item': {
      post: {
        tags: ['Orders & KOT'],
        summary: 'Toggle line-item KDS preparation checkoff',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Order item toggled' } },
      },
    },
    '/tables': {
      post: {
        tags: ['Tables'],
        summary: 'Add a floor table',
        responses: { '201': { description: 'Table created' }, '409': { description: 'Duplicate table ID' } },
      },
    },
    '/tables/{id}/check-in': {
      post: {
        tags: ['Tables'],
        summary: 'Check in reserved party to occupied',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Table occupied' } },
      },
    },
    '/tables/transfer': {
      post: {
        tags: ['Tables'],
        summary: 'Transfer open dine-in orders from source table to target table',
        responses: { '200': { description: 'Tables updated' } },
      },
    },
    '/tables/merge': {
      post: {
        tags: ['Tables'],
        summary: 'Merge two tables onto target table bill',
        responses: { '200': { description: 'Tables merged' } },
      },
    },
    '/inventory': {
      post: {
        tags: ['Inventory'],
        summary: 'Add raw ingredient SKU',
        responses: { '201': { description: 'Ingredient added' } },
      },
    },
    '/inventory/{id}/restock': {
      post: {
        tags: ['Inventory'],
        summary: 'Restock an ingredient SKU',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Ingredient restocked' } },
      },
    },
    '/customers': {
      post: {
        tags: ['CRM & Loyalty'],
        summary: 'Create CRM customer profile (phone normalized)',
        responses: { '201': { description: 'Customer created' } },
      },
    },
    '/customers/{id}/export': {
      get: {
        tags: ['CRM & Loyalty'],
        summary: 'DPDP Customer PII JSON export',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Customer PII export' } },
      },
    },
    '/loyalty/rules': {
      post: {
        tags: ['CRM & Loyalty'],
        summary: 'Add loyalty program rule',
        responses: { '201': { description: 'Rule created' } },
      },
    },
    '/campaigns': {
      post: {
        tags: ['Campaigns & Staff'],
        summary: 'Create promo campaign',
        responses: { '201': { description: 'Campaign created' } },
      },
    },
    '/campaigns/{id}/toggle': {
      post: {
        tags: ['Campaigns & Staff'],
        summary: 'Toggle campaign active/scheduled state',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Campaign toggled' } },
      },
    },
    '/staff': {
      post: {
        tags: ['Campaigns & Staff'],
        summary: 'Add staff member to shift roster',
        responses: { '201': { description: 'Staff added' } },
      },
    },
    '/staff/{id}/toggle-duty': {
      post: {
        tags: ['Campaigns & Staff'],
        summary: 'Clock staff member in or out',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Duty toggled' } },
      },
    },
    '/settings': {
      put: {
        tags: ['Auth & Settings'],
        summary: 'Update store settings',
        responses: { '200': { description: 'Settings saved' } },
      },
    },
    '/settings/reset': {
      post: {
        tags: ['Auth & Settings'],
        summary: 'Reset store settings to defaults',
        responses: { '200': { description: 'Settings reset' } },
      },
    },
    '/auth/pin': {
      post: {
        tags: ['Auth & Settings'],
        summary: 'Verify 4-digit staff PIN and issue HTTP-only signed session cookie',
        responses: { '200': { description: 'Authenticated' }, '401': { description: 'Invalid PIN' } },
      },
    },
    '/auth/session': {
      get: {
        tags: ['Auth & Settings'],
        summary: 'Inspect current signed staff session status',
        responses: { '200': { description: 'Session status' } },
      },
    },
  },
} as const;
