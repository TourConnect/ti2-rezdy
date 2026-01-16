/* globals describe, beforeAll, beforeEach, it, expect, jest */
const R = require('ramda');
const moment = require('moment');

const Plugin = require('./index');

const { typeDefs: productTypeDefs, query: productQuery } = require('./node_modules/ti2/controllers/graphql-schemas/product');
const { typeDefs: availTypeDefs, query: availQuery } = require('./node_modules/ti2/controllers/graphql-schemas/availability');
const { typeDefs: bookingTypeDefs, query: bookingQuery } = require('./node_modules/ti2/controllers/graphql-schemas/booking');
const { typeDefs: rateTypeDefs, query: rateQuery } = require('./node_modules/ti2/controllers/graphql-schemas/rate');
const { typeDefs: pickupTypeDefs, query: pickupQuery } = require('./node_modules/ti2/controllers/graphql-schemas/pickup-point');

const typeDefsAndQueries = {
  productTypeDefs,
  productQuery,
  availTypeDefs,
  availQuery,
  bookingTypeDefs,
  bookingQuery,
  rateTypeDefs,
  rateQuery,
  pickupQuery,
  pickupTypeDefs,
};

// Mock axios
jest.mock('axios', () => {
  const actualAxios = jest.requireActual('axios');
  const mockAxios = jest.fn((config) => {
    // Load fixtures inside the mock factory (Jest requirement)
    const productsFixture = require('./__fixtures__/products');
    const availabilityFixture = require('./__fixtures__/availability');
    const bookingFixture = require('./__fixtures__/bookingResponse');
    
    const { url, method, headers } = config;
    
    // Validate apiKey header (simulate API authentication)
    // Reject if apiKey is undefined, null, or the string 'undefined'
    if (!headers || !headers.apiKey || headers.apiKey === 'undefined') {
      return Promise.reject(new Error('Unauthorized: Invalid or missing API key'));
    }
    
    // Mock GET /products
    if (method === 'get' && url.includes('/products')) {
      // Check if requesting a specific product by ID: /products/{id}
      const productIdMatch = url.match(/\/products\/([^/?]+)$/);
      if (productIdMatch) {
        const productId = productIdMatch[1];
        const product = productsFixture.products.find(p => p.productCode === productId);
        // Return single product as object (not array) - API returns object for single product
        return Promise.resolve({ data: { products: product || null } });
      }
      // All products
      return Promise.resolve({ data: productsFixture });
    }
    
    // Mock GET /availability
    if (method === 'get' && url.includes('/availability')) {
      return Promise.resolve({ data: { sessions: availabilityFixture.availability } });
    }
    
    // Mock POST /bookings (create booking)
    if (method === 'post' && url.includes('/bookings')) {
      return Promise.resolve({ data: bookingFixture.createBookingSuccess });
    }
    
    // Mock GET /bookings (search booking)
    if (method === 'get' && url.includes('/bookings')) {
      if (url.includes('orderNumber=') || url.includes('resellerReference=')) {
        return Promise.resolve({ data: { bookings: bookingFixture.searchBookingResults } });
      }
      return Promise.resolve({ data: { bookings: [] } });
    }
    
    // Mock DELETE /bookings/:id/cancel (cancel booking)
    if (method === 'delete' && url.includes('/cancel')) {
      return Promise.resolve({ data: bookingFixture.cancelBookingSuccess });
    }
    
    // Default: reject unknown requests
    return Promise.reject(new Error(`Unmocked request: ${method} ${url}`));
  });
  
  // Add axios methods that might be used
  mockAxios.create = () => mockAxios;
  mockAxios.get = (url, config) => mockAxios({ ...config, method: 'get', url });
  mockAxios.post = (url, data, config) => mockAxios({ ...config, method: 'post', url, data });
  mockAxios.put = (url, data, config) => mockAxios({ ...config, method: 'put', url, data });
  mockAxios.delete = (url, config) => mockAxios({ ...config, method: 'delete', url });
  
  // Add properties needed by axios-curlirize
  mockAxios.interceptors = {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() }
  };
  mockAxios.defaults = {
    headers: {
      common: {},
      delete: {},
      get: {},
      head: {},
      post: {},
      put: {},
      patch: {}
    }
  };
  
  return mockAxios;
});

describe('mocked integration tests', () => {
  let app;
  let testProduct;
  
  const token = {
    endpoint: 'https://api.rezdy.com/v1',
    apiKey: 'mock-api-key-12345',
    resellerId: 'mock-reseller-id-67890',
  };
  
  const dateFormat = 'DD/MM/YYYY';
  
  beforeAll(() => {
    // Create plugin instance with mock JWT key
    app = new Plugin({
      jwtKey: 'mock-jwt-secret-key-for-testing',
    });
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('utilities', () => {
    describe('validateToken', () => {
      it('should validate a valid token', async () => {
        const retVal = await app.validateToken({ token });
        expect(retVal).toBeTruthy();
      });
      
      it('should reject an invalid token', async () => {
        const retVal = await app.validateToken({
          token: { someRandom: 'thing' },
        });
        expect(retVal).toBeFalsy();
      });
    });
    
    describe('template tests', () => {
      let template;
      
      it('should get the token template', async () => {
        template = await app.tokenTemplate();
        const rules = Object.keys(template);
        expect(rules).toContain('apiKey');
        expect(rules).toContain('resellerId');
      });
      
      it('should validate apiKey format', () => {
        const template = app.tokenTemplate();
        const apiKey = template.apiKey.regExp;
        expect(apiKey.test('something')).toBeFalsy();
        expect(apiKey.test('df2ce6e19ba4d3b749c88025d42a9a4e31cd2e9ac603ffd8acedeee615a76e42')).toBeTruthy();
      });
      
      it('should validate resellerId format', () => {
        const template = app.tokenTemplate();
        const resellerId = template.resellerId.regExp;
        expect(resellerId.test('something')).toBeFalsy();
        expect(resellerId.test('df2ce6e19ba4d3b749c88025d42a9a4e31cd2e9ac603ffd8acedeee615a76e42')).toBeTruthy();
      });
    });
  });
  
  describe('product search', () => {
    it('should get all products', async () => {
      const retVal = await app.searchProducts({
        token,
        typeDefsAndQueries,
      });
      
      expect(Array.isArray(retVal.products)).toBeTruthy();
      expect(retVal.products.length).toBeGreaterThan(0);
    });
    
    it('should find the Vancouver Nights product', async () => {
      const retVal = await app.searchProducts({
        token,
        typeDefsAndQueries,
      });
      
      expect(retVal.products).toContainObject([{
        productName: 'Vancouver Nights',
      }]);
      
      testProduct = retVal.products.find(({ productName }) => productName === 'Vancouver Nights');
      expect(testProduct.productId).toBeTruthy();
    });
    
    it('should get a single product by ID', async () => {
      const retVal = await app.searchProducts({
        token,
        typeDefsAndQueries,
        payload: {
          productId: '120',
        },
      });
      
      expect(Array.isArray(retVal.products)).toBeTruthy();
      expect(retVal.products).toHaveLength(1);
      expect(retVal.products[0].productId).toBe('120');
    });
    
    it('should search products by name pattern', async () => {
      const retVal = await app.searchProducts({
        token,
        typeDefsAndQueries,
        payload: {
          productName: '*night*',
        },
      });
      
      expect(Array.isArray(retVal.products)).toBeTruthy();
      expect(retVal.products.length).toBeGreaterThan(0);
      expect(retVal.products[0].productName).toContain('Night');
    });
  });
  
  describe('availability search', () => {
    it('should get availability calendar', async () => {
      const retVal = await app.availabilityCalendar({
        token,
        typeDefsAndQueries,
        payload: {
          startDate: moment().add(1, 'M').format(dateFormat),
          endDate: moment().add(1, 'M').add(2, 'd').format(dateFormat),
          dateFormat,
          productIds: ['120'],
          optionIds: ['f4aca5e5f308fa1a9ed0581470cd3b76ab6fd0a5'],
          units: [
            [{ unitId: 'adults', quantity: 2 }],
          ],
        },
      });
      
      expect(retVal).toBeTruthy();
      const { availability } = retVal;
      expect(availability).toHaveLength(1);
      expect(availability[0].length).toBeGreaterThan(0);
    });
    
    it('should search availability and return an availability key', async () => {
      const retVal = await app.searchAvailability({
        token,
        typeDefsAndQueries,
        payload: {
          startDate: moment().add(2, 'M').format(dateFormat),
          endDate: moment().add(2, 'M').format(dateFormat),
          dateFormat,
          productIds: ['120'],
          optionIds: ['f4aca5e5f308fa1a9ed0581470cd3b76ab6fd0a5'],
          units: [
            [{ unitId: 'adults', quantity: 2 }],
          ],
        },
      });
      
      expect(retVal).toBeTruthy();
      const { availability } = retVal;
      expect(availability).toHaveLength(1);
      expect(availability[0].length).toBeGreaterThan(0);
      
      const availabilityKey = R.path([0, 0, 'key'], availability);
      expect(availabilityKey).toBeTruthy();
    });
  });
  
  describe('booking process', () => {
    let booking;
    let availabilityKey;
    const reference = 'TEST-REF-12345';
    
    beforeAll(async () => {
      // Get availability key first
      const availResult = await app.searchAvailability({
        token,
        typeDefsAndQueries,
        payload: {
          startDate: moment().add(2, 'M').format(dateFormat),
          endDate: moment().add(2, 'M').format(dateFormat),
          dateFormat,
          productIds: ['120'],
          optionIds: ['f4aca5e5f308fa1a9ed0581470cd3b76ab6fd0a5'],
          units: [
            [{ unitId: 'adults', quantity: 2 }],
          ],
        },
      });
      availabilityKey = R.path([0, 0, 'key'], availResult.availability);
    });
    
    it('should create a booking', async () => {
      const retVal = await app.createBooking({
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          notes: 'Test booking notes',
          settlementMethod: 'DEFERRED',
          holder: {
            name: 'John',
            surname: 'Doe',
            phoneNumber: '+1234567890',
            emailAddress: 'john.doe@example.com',
            country: 'CA',
            locales: ['en-US', 'en'],
          },
          reference,
        },
      });
      
      expect(retVal.booking).toBeTruthy();
      ({ booking } = retVal);
      expect(booking).toBeTruthy();
      expect(R.path(['id'], booking)).toBeTruthy();
      expect(R.path(['supplierBookingId'], booking)).toBeTruthy();
    });
    
    it('should search bookings by ID', async () => {
      const retVal = await app.searchBooking({
        token,
        typeDefsAndQueries,
        payload: {
          bookingId: 'booking-id-12345',
        },
      });
      
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      expect(retVal.bookings.length).toBeGreaterThan(0);
      expect(R.path([0, 'id'], retVal.bookings)).toBeTruthy();
    });
    
    it('should search bookings by reference', async () => {
      const retVal = await app.searchBooking({
        token,
        typeDefsAndQueries,
        payload: {
          bookingId: reference,
        },
      });
      
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      expect(retVal.bookings.length).toBeGreaterThan(0);
    });
    
    it('should search bookings by supplier booking ID', async () => {
      const retVal = await app.searchBooking({
        token,
        typeDefsAndQueries,
        payload: {
          bookingId: 'REZDY-12345',
        },
      });
      
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      expect(retVal.bookings.length).toBeGreaterThan(0);
    });
    
    it('should search bookings by travel date', async () => {
      const retVal = await app.searchBooking({
        token,
        typeDefsAndQueries,
        payload: {
          travelDateStart: moment().add(2, 'M').format(dateFormat),
          travelDateEnd: moment().add(2, 'M').format(dateFormat),
          dateFormat,
        },
      });
      
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
    });
    
    it('should cancel a booking', async () => {
      const retVal = await app.cancelBooking({
        token,
        typeDefsAndQueries,
        payload: {
          bookingId: 'booking-id-12345',
          reason: 'Customer requested cancellation',
        },
      });
      
      const { cancellation } = retVal;
      expect(cancellation).toBeTruthy();
      expect(R.path(['id'], cancellation)).toBeTruthy();
    });
  });

  describe('Error scenarios', () => {
    describe('Invalid token handling', () => {
      it('should reject requests with missing apiKey', async () => {
        const invalidToken = {
          endpoint: 'https://api.rezdy.com/v1',
          apiKey: undefined,
        };

        await expect(
          app.searchProducts({
            token: invalidToken,
            typeDefsAndQueries,
          })
        ).rejects.toThrow();
      });

      it('should reject requests with null apiKey', async () => {
        const invalidToken = {
          endpoint: 'https://api.rezdy.com/v1',
          apiKey: null,
        };

        await expect(
          app.searchProducts({
            token: invalidToken,
            typeDefsAndQueries,
          })
        ).rejects.toThrow();
      });
    });

    describe('Booking creation errors', () => {
      it('should throw error when availabilityKey is missing', async () => {
        await expect(
          app.createBooking({
            token,
            typeDefsAndQueries,
            payload: {
              holder: {
                name: 'John',
                surname: 'Doe',
              },
            },
          })
        ).rejects.toThrow('an availability code is required');
      });

      it('should throw error when holder name is missing', async () => {
        await expect(
          app.createBooking({
            token,
            typeDefsAndQueries,
            payload: {
              availabilityKey: 'fake-key',
              holder: {
                surname: 'Doe',
              },
            },
          })
        ).rejects.toThrow("holder's first name is required");
      });

      it('should throw error when holder surname is missing', async () => {
        await expect(
          app.createBooking({
            token,
            typeDefsAndQueries,
            payload: {
              availabilityKey: 'fake-key',
              holder: {
                name: 'John',
              },
            },
          })
        ).rejects.toThrow("holder's surname is required");
      });
    });

    describe('Booking search errors', () => {
      it('should throw error when no search parameters provided', async () => {
        await expect(
          app.searchBooking({
            token,
            typeDefsAndQueries,
            payload: {},
          })
        ).rejects.toThrow('at least one parameter is required');
      });

      it('should handle search with invalid bookingId gracefully', async () => {
        // Mock axios to return "not found" response
        const retVal = await app.searchBooking({
          token,
          typeDefsAndQueries,
          payload: {
            bookingId: 'non-existent-booking-id',
          },
        });
        
        // Should return empty array or handle gracefully
        expect(Array.isArray(retVal.bookings)).toBeTruthy();
      });
    });

    describe('Availability search errors', () => {
      it('should throw error when productIds and optionIds length mismatch', async () => {
        await expect(
          app.searchAvailability({
            token,
            typeDefsAndQueries,
            payload: {
              productIds: ['120'],
              optionIds: ['opt1', 'opt2'], // Mismatched length
              units: [[{ unitId: 'adults', quantity: 2 }]],
              startDate: moment().add(1, 'M').format('DD/MM/YYYY'),
              endDate: moment().add(1, 'M').add(2, 'd').format('DD/MM/YYYY'),
              dateFormat: 'DD/MM/YYYY',
            },
          })
        ).rejects.toThrow('mismatched productIds/options length');
      });

      it('should throw error when optionIds and units length mismatch', async () => {
        await expect(
          app.searchAvailability({
            token,
            typeDefsAndQueries,
            payload: {
              productIds: ['120'],
              optionIds: ['opt1'],
              units: [[{ unitId: 'adults', quantity: 2 }], [{ unitId: 'children', quantity: 1 }]], // Mismatched
              startDate: moment().add(1, 'M').format('DD/MM/YYYY'),
              endDate: moment().add(1, 'M').add(2, 'd').format('DD/MM/YYYY'),
              dateFormat: 'DD/MM/YYYY',
            },
          })
        ).rejects.toThrow('mismatched options/units length');
      });

      it('should throw error when JWT key is not set', async () => {
        const appWithoutJWT = new Plugin({});
        
        await expect(
          appWithoutJWT.searchAvailability({
            token,
            typeDefsAndQueries,
            payload: {
              productIds: ['120'],
              optionIds: ['opt1'],
              units: [[{ unitId: 'adults', quantity: 2 }]],
              startDate: moment().add(1, 'M').format('DD/MM/YYYY'),
              endDate: moment().add(1, 'M').add(2, 'd').format('DD/MM/YYYY'),
              dateFormat: 'DD/MM/YYYY',
            },
          })
        ).rejects.toThrow('JWT secret should be set');
      });
    });
  });
});
