/* globals describe, it, expect, jest */
jest.mock('./resolvers/product', () => ({
  translateProduct: jest.fn(async ({ rootValue }) => ({
    productId: rootValue.productCode,
    productName: rootValue.name,
  })),
}));

const Plugin = require('./index');

describe('searchProducts force refresh payload', () => {
  it('keeps the full catalog when Ti2 includes internal refresh metadata', async () => {
    const app = new Plugin({});
    app.axios = jest.fn(async () => ({
      data: { products: [{ productCode: '1', name: 'Harbour Cruise' }] },
    }));

    const result = await app.searchProducts({
      token: {
        endpoint: 'https://rezdy.example/v1',
        apiKey: 'key',
      },
      payload: {
        forceRefresh: true,
        requestId: 'worker-job-id',
        fullSyncTrigger: 'manual',
        admissionOverrideReason: 'TourConnect app integration product sync',
        backgroundJob: 'job-id',
        cacheOnly: false,
        fullSyncStartedAt: '2026-11-04T00:00:00Z',
        fullSyncAdmissionToken: 'admission-token',
        scheduledProductSyncEnabled: true,
        omitServiceCodes: [],
        pickupPointsRequired: false,
        credentials: 'legacy-serialized-credentials',
      },
      typeDefsAndQueries: {},
    });

    expect(result.products).toEqual([
      {
        productId: '1',
        productName: 'Harbour Cruise',
        getCreateBookingFields: [],
      },
    ]);
  });

  it('applies a real name filter alongside refresh control fields', async () => {
    const app = new Plugin({});
    app.axios = jest.fn().mockResolvedValue({
      data: {
        products: [
          { productCode: '1', name: 'Harbour night cruise' },
          { productCode: '2', name: 'Harbour day cruise' },
        ],
      },
    });

    const result = await app.searchProducts({
      token: { endpoint: 'https://rezdy.example/v1', apiKey: 'key' },
      payload: { forceRefresh: true, credentials: 'serialized', productName: '*night*' },
      typeDefsAndQueries: {},
    });

    expect(result.products.map(product => product.productId)).toEqual(['1']);
  });
});
