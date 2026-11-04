/* globals describe, it, expect, jest */
jest.mock('./resolvers/product', () => ({
  translateProduct: jest.fn(async ({ rootValue }) => ({
    productId: rootValue.productCode,
    productName: rootValue.name,
  })),
}));

const Plugin = require('./index');

const searchProducts = async (axios, payload) => {
  const app = new Plugin({});
  app.axios = axios;
  return app.searchProducts({
    token: {
      endpoint: 'https://api.rezdy.com/v1',
      apiKey: 'key',
    },
    typeDefsAndQueries: {},
    payload,
  });
};

describe('Rezdy product catalog pagination', () => {
  it('requests the final empty page for an exact page boundary', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ productCode: `p${i}` }));
    const axios = jest.fn().mockResolvedValueOnce({ data: { products: rows } })
      .mockResolvedValueOnce({ data: { products: [] } });
    expect((await searchProducts(axios)).products).toHaveLength(100);
    expect(axios).toHaveBeenCalledTimes(2);
  });

  it('rejects a later page failure instead of returning the earlier pages', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ productCode: `p${i}` }));
    const axios = jest.fn().mockResolvedValueOnce({ data: { products: rows } })
      .mockRejectedValueOnce(new Error('rate limited'));
    await expect(searchProducts(axios)).rejects.toThrow('rate limited');
  });

  it('rejects a repeated full page after two requests', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ productCode: `p${i}` }));
    const axios = jest.fn().mockResolvedValue({ data: { products: rows } });

    await expect(searchProducts(axios)).rejects.toThrow('no new product codes');
    expect(axios).toHaveBeenCalledTimes(2);
  });

  it('rejects a catalog that still has full pages at the page limit', async () => {
    const axios = jest.fn(async ({ url }) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      return {
        data: {
          products: Array.from({ length: 100 }, (_, i) => ({ productCode: `p${offset + i}` })),
        },
      };
    });

    await expect(searchProducts(axios)).rejects.toThrow('exceeded the page limit');
    expect(axios).toHaveBeenCalledTimes(200);
  });

  it('returns a valid empty supplier catalog', async () => {
    expect((await searchProducts(async () => ({ data: { products: [] } }))).products).toEqual([]);
  });
  it('follows offset until a short page and returns every product', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      productCode: `product-${index}`,
    }));
    const pages = [
      firstPage,
      [{ productCode: 'product-99' }, { productCode: 'product-100' }],
    ];
    const urls = [];
    const axios = jest.fn(async ({ url }) => {
      urls.push(url);
      return { data: { products: pages[urls.length - 1] } };
    });

    const result = await searchProducts(axios);

    expect(result.products).toHaveLength(101);
    expect(result.products[0].productId).toBe('product-0');
    expect(result.products[100].productId).toBe('product-100');
    expect(urls).toEqual([
      'https://api.rezdy.com/v1/products?limit=100&offset=0',
      'https://api.rezdy.com/v1/products?limit=100&offset=100',
    ]);
  });

  it('rejects a page that is not a products array', async () => {
    const axios = jest.fn(async () => ({ data: { products: { productCode: 'a' } } }));

    await expect(searchProducts(axios)).rejects.toThrow('products array');
  });

  it('rejects a catalog row without a stable product code', async () => {
    const axios = jest.fn(async () => ({ data: { products: [{ name: 'Missing code' }] } }));

    await expect(searchProducts(axios)).rejects.toThrow('productCode');
  });
});

describe('Rezdy single product search', () => {
  it.each([
    { products: [{ productCode: 'a/b', name: 'Night Cruise' }] },
    { products: { productCode: 'a/b', name: 'Night Cruise' } },
    { product: { productCode: 'a/b', name: 'Night Cruise' } },
  ])('accepts the detail response shape %j and encodes the product ID', async (data) => {
    const axios = jest.fn().mockResolvedValue({ data });

    expect((await searchProducts(axios, { productId: 'a/b' })).products).toEqual([
      { productId: 'a/b', productName: 'Night Cruise', getCreateBookingFields: [] },
    ]);
    expect(axios).toHaveBeenCalledTimes(1);
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.rezdy.com/v1/products/a%2Fb',
    }));
  });

  it.each([null, {}, { products: null }, { products: [] }, { product: null }])(
    'returns no products for an empty detail response %j',
    async (data) => {
      const axios = jest.fn().mockResolvedValue({ data });
      expect((await searchProducts(axios, { productId: 'missing' })).products).toEqual([]);
      expect(axios).toHaveBeenCalledTimes(1);
    },
  );
});
