/* globals describe, it, expect, jest */
jest.mock('./resolvers/booking', () => ({
  translateBooking: jest.fn(async ({ rootValue }) => ({
    id: rootValue.orderNumber || rootValue.id,
  })),
}));

const Plugin = require('./index');

const searchByPurchaseDate = async axios => {
  const app = new Plugin({});
  app.axios = axios;
  return app.searchBooking({
    token: {
      endpoint: 'https://api.rezdy.com/v1',
      apiKey: 'key',
    },
    payload: {
      purchaseDateStart: '24/07/2026',
      purchaseDateEnd: '24/07/2026',
      dateFormat: 'DD/MM/YYYY',
    },
    typeDefsAndQueries: {},
  });
};

const bookingRows = (count, start = 0) => Array.from({ length: count }, (_, i) => ({
  orderNumber: `b${start + i}`,
}));

describe('Rezdy booking search pagination', () => {
  it('follows offset until a short page and returns more than 100 bookings', async () => {
    const pages = [
      bookingRows(100),
      bookingRows(50, 100),
    ];
    const urls = [];
    const axios = jest.fn(async ({ url }) => {
      urls.push(url);
      return { data: { bookings: pages[urls.length - 1] } };
    });

    const result = await searchByPurchaseDate(axios);

    expect(result.bookings).toHaveLength(150);
    expect(result.bookings[0].id).toBe('b0');
    expect(result.bookings[149].id).toBe('b149');
    expect(urls).toEqual([
      'https://api.rezdy.com/v1/bookings?minDateCreated=2026-07-24T00%3A00%3A00Z&maxDateCreated=2026-07-24T23%3A59%3A59Z&limit=100&offset=0',
      'https://api.rezdy.com/v1/bookings?minDateCreated=2026-07-24T00%3A00%3A00Z&maxDateCreated=2026-07-24T23%3A59%3A59Z&limit=100&offset=100',
    ]);
  });

  it('requests the final empty page for an exact page boundary', async () => {
    const axios = jest.fn().mockResolvedValueOnce({ data: { bookings: bookingRows(100) } })
      .mockResolvedValueOnce({ data: { bookings: [] } });
    expect((await searchByPurchaseDate(axios)).bookings).toHaveLength(100);
    expect(axios).toHaveBeenCalledTimes(2);
  });

  it('rejects a later page failure instead of returning the earlier pages', async () => {
    const axios = jest.fn().mockResolvedValueOnce({ data: { bookings: bookingRows(100) } })
      .mockRejectedValueOnce(new Error('rate limited'));
    await expect(searchByPurchaseDate(axios)).rejects.toThrow('rate limited');
  });

  it('keeps earlier pages when a later page returns no order found', async () => {
    const noOrder = new Error('No order found');
    noOrder.errorCode = '24';
    noOrder.response = {
      data: {
        requestStatus: {
          success: false,
          error: { errorCode: '24', errorMessage: 'No order found' },
        },
      },
    };
    const axios = jest.fn().mockResolvedValueOnce({ data: { bookings: bookingRows(100) } })
      .mockRejectedValueOnce(noOrder);

    expect((await searchByPurchaseDate(axios)).bookings).toHaveLength(100);
    expect(axios).toHaveBeenCalledTimes(2);
  });

  it('rejects a repeated full page after two requests', async () => {
    const axios = jest.fn().mockResolvedValue({ data: { bookings: bookingRows(100) } });
    await expect(searchByPurchaseDate(axios)).rejects.toThrow('no new bookings');
    expect(axios).toHaveBeenCalledTimes(2);
  });

  it('rejects a page that is not a bookings array', async () => {
    const axios = jest.fn(async () => ({ data: { bookings: { orderNumber: 'a' } } }));
    await expect(searchByPurchaseDate(axios)).rejects.toThrow('bookings array');
  });

  it('rejects a booking row without a stable identity', async () => {
    const axios = jest.fn(async () => ({ data: { bookings: [{ status: 'CONFIRMED' }] } }));
    await expect(searchByPurchaseDate(axios)).rejects.toThrow('booking identity');
  });
});
