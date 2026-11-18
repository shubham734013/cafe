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
    { name: 'Payments' },
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
        summary: 'Fetch full or route-scoped authorized CafeOS state',
        parameters: [
          {
            name: 'screen',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Optional screen identifier to return only the data used by that route.',
          },
          {
            name: 'scope',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['main', 'kitchen'] },
            description: 'Use kitchen for kitchen-specific route data.',
          },
        ],
        responses: {
          '200': { description: 'Authorized CafeOS state, optionally reduced to one route' },
          '400': { description: 'Unknown screen or scope' },
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
                required: ['serviceMode', 'items'],
                properties: {
                  serviceMode: { type: 'string', enum: ['dine-in', 'takeaway', 'delivery'] },
                  tableNumber: { type: 'string', example: 'T3' },
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
    '/customer-feedback': {
      post: {
        tags: ['CRM & Loyalty'],
        summary: 'Submit customer feedback for the cafe team',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['customerName', 'rating', 'comment'],
                properties: {
                  customerName: { type: 'string', maxLength: 80 },
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  comment: { type: 'string', minLength: 3, maxLength: 1000 },
                  tags: { type: 'array', items: { type: 'string', maxLength: 60 } },
                  dishName: { type: 'string', maxLength: 80 },
                  diningMode: { type: 'string', enum: ['dine-in', 'takeaway', 'delivery'] },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Feedback saved and sent to the cafe team' },
          '400': { description: 'Validation error' },
          '429': { description: 'Too many feedback submissions' },
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
      '/orders/{id}/payment-session': {
        post: {
          tags: ['Payments'],
          summary: 'Create or resume a hosted UPI Gateway checkout for an accessible order',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Hosted checkout URL and current payment status' },
            '403': { description: 'Order is not accessible to this customer or staff role' },
            '503': { description: 'UPI Gateway is not configured' },
          },
        },
      },
      '/orders/{id}/payment-status': {
        get: {
          tags: ['Payments'],
          summary: 'Refresh payment status from the UPI Gateway API',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Current verified payment status' },
            '403': { description: 'Order is not accessible to this customer or staff role' },
          },
        },
      },
      '/webhooks/upi-gateway': {
        post: {
          tags: ['Payments'],
          summary: 'Receive a timestamp-signed UPI Gateway webhook and verify order status',
          description: 'The CafeOS server re-fetches payment status from the gateway before updating an order.',
          parameters: [
            {
              name: 'X-Signature',
              in: 'header',
              required: true,
              schema: { type: 'string' },
              description: 'Timestamped HMAC-SHA256 signature supplied by UPI Gateway.',
            },
          ],
          responses: {
            '200': { description: 'Webhook verified and processed' },
            '401': { description: 'Invalid or expired signature' },
            '503': { description: 'Payment verification or persistence is unavailable; retry' },
          },
        },
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
