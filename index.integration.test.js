/* globals describe, beforeAll, beforeEach, it, expect, jest */
const R = require('ramda');
const moment = require('moment');
const axios = require('axios');
const jwt = require('jsonwebtoken');

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
    agentCode: 'MOCKSOURCECHANNEL67890',
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
        expect(rules).toContain('agentCode');
      });
      
      it('should validate apiKey format', () => {
        const template = app.tokenTemplate();
        const apiKey = template.apiKey.regExp;
        expect(apiKey.test('something')).toBeFalsy();
        expect(apiKey.test('df2ce6e19ba4d3b749c88025d42a9a4e31cd2e9ac603ffd8acedeee615a76e42')).toBeTruthy();
      });
      
      it('should validate agentCode format', () => {
        const template = app.tokenTemplate();
        const agentCode = template.agentCode.regExp;
        expect(agentCode.test('invalid-with-dash')).toBeFalsy();
        expect(agentCode.test('WONDERFULGLOBALTRAVEL')).toBeTruthy();
        expect(agentCode.test('ABCDEF123')).toBeTruthy();
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
      expect(Array.isArray(retVal.products[0].getCreateBookingFields)).toBeTruthy();
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

    it('should return create booking fields using product bookingFields', async () => {
      const retVal = await app.getCreateBookingFields({
        token,
        query: {
          productId: '120',
        },
      });

      expect(Array.isArray(retVal.fields)).toBeTruthy();
      expect(Array.isArray(retVal.customFields)).toBeTruthy();
      expect(Array.isArray(retVal.additionalCustomerFields)).toBeTruthy();
      expect(retVal.fields).toContainEqual(expect.objectContaining({
        id: 'firstName',
        required: true,
        requiredPerBooking: false,
        requiredPerParticipant: true,
        visiblePerParticipant: true,
      }));
      expect(retVal.fields).toContainEqual(expect.objectContaining({
        id: 'lastName',
        required: true,
        requiredPerBooking: false,
        requiredPerParticipant: true,
        visiblePerParticipant: true,
      }));
      expect(retVal.fields).toContainEqual(expect.objectContaining({
        id: 'emailAddress',
        required: true,
        requiredPerBooking: true,
        requiredPerParticipant: false,
      }));
      expect(retVal.fields).toContainEqual(expect.objectContaining({
        id: 'phoneNumber',
        required: true,
        requiredPerBooking: true,
        requiredPerParticipant: false,
      }));
      expect(retVal.customFields).toContainEqual(expect.objectContaining({
        id: 'certificationLevel',
        isPerUnitItem: true,
        required: false,
        visiblePerParticipant: true,
        visiblePerBooking: false,
        requiredPerParticipant: false,
        requiredPerBooking: false,
      }));
      expect(retVal.additionalCustomerFields).toContainEqual(expect.objectContaining({
        id: 'specialRequirements',
        required: false,
        requiredPerBooking: false,
        requiredPerParticipant: false,
        visiblePerBooking: true,
        isCustomerField: true,
      }));
      expect(retVal.fields).toContainEqual(expect.objectContaining({
        id: 'specialRequirements',
        required: false,
        requiredPerBooking: false,
        requiredPerParticipant: false,
        visiblePerBooking: true,
        isCustomerField: true,
      }));
      expect(retVal.customFields).toContainEqual(expect.objectContaining({
        id: 'certificationAgency',
        type: 'extended-option',
        options: [],
      }));
      // Country and postCode are built-in contact fields (the host UI renders
      // them for the holder). They must surface under `fields`, not duplicate
      // into `customFields`. This mirrors the ti2-rezdy pattern where
      // `country` and `postCode` are part of DEFAULT_CREATE_BOOKING_FIELDS.
      expect(retVal.fields).toContainEqual(expect.objectContaining({
        id: 'country',
        type: 'short',
      }));
      expect(retVal.customFields).not.toContainEqual(expect.objectContaining({
        id: 'country',
      }));
      expect(retVal.fields).toContainEqual(expect.objectContaining({
        id: 'postCode',
        type: 'short',
      }));
      expect(retVal.customFields).not.toContainEqual(expect.objectContaining({
        id: 'postCode',
      }));
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
      expect(Array.isArray(R.path([0, 0, 'getCreateBookingFields'], availability))).toBeTruthy();
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
      expect(Array.isArray(R.path([0, 0, 'getCreateBookingFields'], availability))).toBeTruthy();
      
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

      // Ensure Agent Code is sent to Rezdy as sourceChannel
      const createBookingRequest = axios.mock.calls.find(([config]) =>
        config && config.method === 'post' && config.url.includes('/bookings')
      );
      expect(createBookingRequest).toBeTruthy();
      expect(createBookingRequest[0].data).toMatchObject({
        sourceChannel: token.agentCode,
      });
    });

    it('should merge holder.fields (by id) into top-level Rezdy fields like ti2-rezdy', async () => {
      await app.createBooking({
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          reference: 'E2E-FIELDS',
          holder: {
            name: 'John',
            surname: 'Doe',
            phoneNumber: '+1234567890',
            emailAddress: 'john.doe@example.com',
            fields: [
              { id: 'specialRequirements', value: 'Access ramp needed' },
            ],
          },
        },
      });
      const createBookingRequest = axios.mock.calls.find(([config]) =>
        config && config.method === 'post' && config.url && config.url.includes('/bookings')
      );
      expect(createBookingRequest[0].data.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Special Requirements',
            value: 'Access ramp needed',
          }),
        ]),
      );
    });

    it('should map root-level customFieldValues (tcoutland) onto Rezdy fields', async () => {
      await app.createBooking({
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          reference: 'E2E-CUSTOM-ROOT',
          holder: {
            name: 'A',
            surname: 'B',
            emailAddress: 'a@b.com',
          },
          customFieldValues: [
            {
              field: {
                id: 'specialRequirements',
                title: 'Special Requirements',
                type: 'short',
              },
              value: 'Vegan',
            },
          ],
        },
      });
      const createBookingRequest = axios.mock.calls
        .filter(([config]) => config && config.method === 'post' && config.url && config.url.includes('/bookings'))
        .pop();
      expect(createBookingRequest[0].data.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Special Requirements',
            value: 'Vegan',
          }),
        ]),
      );
    });

    it('should serialize object-valued country field to country code', async () => {
      await app.createBooking({
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          holder: {
            name: 'A',
            surname: 'B',
            emailAddress: 'a@b.com',
            country: { label: 'Australia', value: 'AU' },
          },
        },
      });
      const createBookingRequest = axios.mock.calls
        .filter(([config]) => config && config.method === 'post' && config.url && config.url.includes('/bookings'))
        .pop();
      const bookingFields = createBookingRequest[0].data.fields || [];
      expect(bookingFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Country',
            value: 'AU',
          }),
        ]),
      );
    });

    it('should send visiblePerParticipant-only answers on participants, not on booking root fields', async () => {
      await app.createBooking({
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          holder: {
            name: 'A',
            surname: 'B',
            emailAddress: 'a@b.com',
          },
          customFieldValues: [
            {
              field: {
                id: 'certificationLevel',
                title: 'Certification level',
                type: 'short',
              },
              value: 'Advanced',
            },
          ],
        },
      });
      const createBookingRequest = axios.mock.calls
        .filter(([config]) => config && config.method === 'post' && config.url && config.url.includes('/bookings'))
        .pop();
      const { data } = createBookingRequest[0];
      const topLabels = (data.fields || []).map(f => f.label);
      expect(topLabels).not.toContain('Certification level');
      const pFields = R.path(['items', 0, 'participants', 0, 'fields'], data) || [];
      expect(pFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Certification level', value: 'Advanced' }),
        ]),
      );
    });

    it('should keep only "Ask for each Participant" rows on passenger fields (tcoutlook flow)', async () => {
      await app.createBooking({
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          holder: {
            name: 'A',
            surname: 'B',
            emailAddress: 'a@b.com',
          },
          participants: [{
            firstName: 'Passenger',
            lastName: 'One',
            fields: [
              { id: 'certificationLevel', value: 'Advanced' },
              { id: 'specialRequirements', value: 'Wheelchair access' },
              { id: 'dropOffAddress', value: '123 Main Street' },
            ],
          }],
        },
      });
      const createBookingRequest = axios.mock.calls
        .filter(([config]) => config && config.method === 'post' && config.url && config.url.includes('/bookings'))
        .pop();
      const { data } = createBookingRequest[0];
      const participantFields = R.path(['items', 0, 'participants', 0, 'fields'], data) || [];
      const participantLabels = participantFields.map(field => field.label);
      expect(participantLabels).toContain('Certification level');
      expect(participantLabels).not.toContain('Special Requirements');
      expect(participantLabels).not.toContain('Drop off address');
    });

    it('should map UI nested participant field rows without duplicating holder fallbacks', async () => {
      await app.createBooking({
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          holder: {
            name: 'Sarah',
            surname: 'Cooper',
            emailAddress: 'sarah@example.com',
          },
          participants: [
            {
              fields: [
                { field: { id: 'firstName', title: 'First Name' }, value: 'Sarah' },
                { field: { id: 'lastName', title: 'Last Name' }, value: 'Cooper' },
                { field: { id: 'weight', title: 'Weight' }, value: '140' },
                { field: { id: 'gender', title: 'Gender' }, value: 'FEMALE' },
              ],
            },
            {
              fields: [
                { field: { id: 'firstName', title: 'Adult 2: First Name' }, value: 'Peter' },
                { field: { id: 'lastName', title: 'Adult 2: Last Name' }, value: 'Cooper' },
                { field: { id: 'weight', title: 'Adult 2: Weight' }, value: '180' },
                { field: { id: 'gender', title: 'Adult 2: Gender' }, value: 'MALE' },
              ],
            },
          ],
        },
      });
      const createBookingRequest = axios.mock.calls
        .filter(([config]) => config && config.method === 'post' && config.url && config.url.includes('/bookings'))
        .pop();
      const { data } = createBookingRequest[0];
      const participant1Fields = R.path(['items', 0, 'participants', 0, 'fields'], data) || [];
      const participant2Fields = R.path(['items', 0, 'participants', 1, 'fields'], data) || [];

      expect(participant1Fields).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: 'Weight', value: '140' }),
        expect.objectContaining({ label: 'Gender', value: 'FEMALE' }),
      ]));
      expect(participant2Fields).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: 'First Name', value: 'Peter' }),
        expect.objectContaining({ label: 'Last Name', value: 'Cooper' }),
        expect.objectContaining({ label: 'Weight', value: '180' }),
        expect.objectContaining({ label: 'Gender', value: 'MALE' }),
      ]));
    });

    it('should normalize traveler-prefixed labels when participant field id is missing', async () => {
      await app.createBooking({
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          holder: {
            name: 'A',
            surname: 'B',
            emailAddress: 'a@b.com',
          },
          participants: [{
            firstName: 'Passenger',
            lastName: 'One',
            fields: [
              { label: 'Traveler 1: Certification level', value: 'Advanced' },
            ],
          }],
        },
      });
      const createBookingRequest = axios.mock.calls
        .filter(([config]) => config && config.method === 'post' && config.url && config.url.includes('/bookings'))
        .pop();
      const { data } = createBookingRequest[0];
      const participantFields = R.path(['items', 0, 'participants', 0, 'fields'], data) || [];
      expect(participantFields).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: 'Certification level', value: 'Advanced' }),
      ]));
    });

    it('should map participants customFieldValues into participant fields', async () => {
      await app.createBooking({
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          holder: {
            name: 'A',
            surname: 'B',
            emailAddress: 'a@b.com',
          },
          participants: [{
            firstName: 'Passenger',
            lastName: 'One',
            customFieldValues: [
              {
                field: { id: 'certificationLevel', title: 'Certification level' },
                value: 'Advanced',
              },
            ],
          }],
        },
      });
      const createBookingRequest = axios.mock.calls
        .filter(([config]) => config && config.method === 'post' && config.url && config.url.includes('/bookings'))
        .pop();
      const { data } = createBookingRequest[0];
      const participantFields = R.path(['items', 0, 'participants', 0, 'fields'], data) || [];
      expect(participantFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Certification level', value: 'Advanced' }),
        ]),
      );
    });

    it('should include requiredPerParticipant fields for padded passenger rows', async () => {
      const productsFixture = require('./__fixtures__/products');
      const product = productsFixture.products.find(p => p.productCode === '120');
      const originalBookingFields = product.bookingFields.map(field => ({ ...field }));
      product.bookingFields = originalBookingFields.map((field) => {
        if (field.label === 'Email') {
          return {
            ...field,
            requiredPerParticipant: true,
            visiblePerParticipant: false,
            requiredPerBooking: false,
          };
        }
        if (field.label === 'Special Requirements') {
          return {
            ...field,
            requiredPerParticipant: true,
            visiblePerParticipant: false,
            requiredPerBooking: false,
          };
        }
        return field;
      }).concat([{
        label: 'Passenger weight',
        requiredPerParticipant: true,
        requiredPerBooking: false,
        visiblePerParticipant: false,
        visiblePerBooking: false,
        fieldType: 'String',
      }]);

      try {
        await app.createBooking({
          token,
          typeDefsAndQueries,
          payload: {
            availabilityKey,
            holder: {
              name: 'A',
              surname: 'B',
              emailAddress: 'a@b.com',
            },
            participants: [{
              firstName: 'Passenger',
              lastName: 'One',
            }],
          },
        });
      } finally {
        product.bookingFields = originalBookingFields;
      }

      const createBookingRequest = axios.mock.calls
        .filter(([config]) => config && config.method === 'post' && config.url && config.url.includes('/bookings'))
        .pop();
      const { data } = createBookingRequest[0];
      const passenger2Fields = R.path(['items', 0, 'participants', 1, 'fields'], data) || [];
      const passenger2Labels = passenger2Fields.map(field => field.label);
      expect(passenger2Labels).toContain('First Name');
      expect(passenger2Labels).toContain('Last Name');
      expect(passenger2Labels).toContain('Email');
      expect(passenger2Labels).toContain('Special Requirements');
      expect(passenger2Labels).toContain('Passenger weight');
    });

    it('should allow direct booking without agentCode', async () => {
      const { agentCode, ...tokenWithoutAgentCode } = token;
      expect(agentCode).toBeTruthy();

      const retVal = await app.createBooking({
        token: tokenWithoutAgentCode,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          integrationIsDirectBooking: true,
          holder: {
            name: 'Direct',
            surname: 'Booking',
            phoneNumber: '+1234567890',
            emailAddress: 'direct.booking@example.com',
          },
        },
      });

      expect(retVal.booking).toBeTruthy();
      const createBookingRequest = axios.mock.calls.find(([config]) =>
        config && config.method === 'post' && config.url.includes('/bookings')
      );
      expect(createBookingRequest).toBeTruthy();
      expect(createBookingRequest[0].data).not.toHaveProperty('sourceChannel');
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

    it('should stop after first successful booking search endpoint', async () => {
      const bookingFixture = require('./__fixtures__/bookingResponse');
      const defaultAxiosImpl = axios.getMockImplementation();
      axios.mockImplementation((config) => {
        if (config.method === 'get' && config.url === `${token.endpoint}/bookings/SEQ-STOP-FIRST`) {
          return Promise.resolve({ data: bookingFixture.searchBookingResults[0] });
        }
        if (config.method === 'get' && config.url === `${token.endpoint}/bookings?resellerReference=SEQ-STOP-FIRST`) {
          return Promise.resolve({ data: { bookings: bookingFixture.searchBookingResults } });
        }
        if (config.method === 'get' && config.url === `${token.endpoint}/bookings?search=SEQ-STOP-FIRST`) {
          return Promise.resolve({ data: { bookings: bookingFixture.searchBookingResults } });
        }
        return defaultAxiosImpl(config);
      });

      try {
        const retVal = await app.searchBooking({
          token,
          typeDefsAndQueries,
          payload: {
            bookingId: 'SEQ-STOP-FIRST',
          },
        });
        expect(Array.isArray(retVal.bookings)).toBeTruthy();
        expect(retVal.bookings.length).toBeGreaterThan(0);
      } finally {
        axios.mockImplementation(defaultAxiosImpl);
      }

      const searchUrls = axios.mock.calls
        .map(([config]) => config)
        .filter(config => config && config.method === 'get' && typeof config.url === 'string')
        .map(config => config.url)
        .filter(url => url.includes('/bookings/SEQ-STOP-FIRST') || url.includes('SEQ-STOP-FIRST'));
      expect(searchUrls).toEqual([
        `${token.endpoint}/bookings/SEQ-STOP-FIRST`,
      ]);
    });

    it('should call second endpoint only when first endpoint has no booking', async () => {
      const bookingFixture = require('./__fixtures__/bookingResponse');
      const defaultAxiosImpl = axios.getMockImplementation();
      axios.mockImplementation((config) => {
        if (config.method === 'get' && config.url === `${token.endpoint}/bookings/SEQ-TO-SECOND`) {
          return Promise.resolve({ data: { bookings: [] } });
        }
        if (config.method === 'get' && config.url === `${token.endpoint}/bookings?resellerReference=SEQ-TO-SECOND`) {
          return Promise.resolve({ data: { bookings: bookingFixture.searchBookingResults } });
        }
        if (config.method === 'get' && config.url === `${token.endpoint}/bookings?search=SEQ-TO-SECOND`) {
          return Promise.resolve({ data: { bookings: bookingFixture.searchBookingResults } });
        }
        return defaultAxiosImpl(config);
      });

      try {
        const retVal = await app.searchBooking({
          token,
          typeDefsAndQueries,
          payload: {
            bookingId: 'SEQ-TO-SECOND',
          },
        });
        expect(Array.isArray(retVal.bookings)).toBeTruthy();
        expect(retVal.bookings.length).toBeGreaterThan(0);
      } finally {
        axios.mockImplementation(defaultAxiosImpl);
      }

      const searchUrls = axios.mock.calls
        .map(([config]) => config)
        .filter(config => config && config.method === 'get' && typeof config.url === 'string')
        .map(config => config.url)
        .filter(url => url.includes('/bookings/SEQ-TO-SECOND') || url.includes('SEQ-TO-SECOND'));
      expect(searchUrls).toEqual([
        `${token.endpoint}/bookings/SEQ-TO-SECOND`,
        `${token.endpoint}/bookings?resellerReference=SEQ-TO-SECOND`,
      ]);
    });

    it('should accept supplierBookingId as fallback identity and stop chain', async () => {
      const bookingFixture = require('./__fixtures__/bookingResponse');
      const defaultAxiosImpl = axios.getMockImplementation();
      axios.mockImplementation((config) => {
        if (config.method === 'get' && config.url === `${token.endpoint}/bookings/SEQ-SUPPLIER-ID`) {
          return Promise.resolve({
            data: {
              ...bookingFixture.searchBookingResults[0],
              orderNumber: undefined,
              id: undefined,
              bookingId: undefined,
              reference: undefined,
              supplierBookingId: 'SUP-SEQ-001',
            },
          });
        }
        if (config.method === 'get' && config.url === `${token.endpoint}/bookings?resellerReference=SEQ-SUPPLIER-ID`) {
          return Promise.resolve({ data: { bookings: bookingFixture.searchBookingResults } });
        }
        if (config.method === 'get' && config.url === `${token.endpoint}/bookings?search=SEQ-SUPPLIER-ID`) {
          return Promise.resolve({ data: { bookings: bookingFixture.searchBookingResults } });
        }
        return defaultAxiosImpl(config);
      });

      try {
        const retVal = await app.searchBooking({
          token,
          typeDefsAndQueries,
          payload: {
            bookingId: 'SEQ-SUPPLIER-ID',
          },
        });
        expect(Array.isArray(retVal.bookings)).toBeTruthy();
        expect(retVal.bookings.length).toBeGreaterThan(0);
      } finally {
        axios.mockImplementation(defaultAxiosImpl);
      }

      const searchUrls = axios.mock.calls
        .map(([config]) => config)
        .filter(config => config && config.method === 'get' && typeof config.url === 'string')
        .map(config => config.url)
        .filter(url => url.includes('/bookings/SEQ-SUPPLIER-ID') || url.includes('SEQ-SUPPLIER-ID'));
      expect(searchUrls).toEqual([
        `${token.endpoint}/bookings/SEQ-SUPPLIER-ID`,
      ]);
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
      it('should throw error when agentCode is missing for non-direct bookings', async () => {
        const tokenWithoutAgentCode = {
          endpoint: token.endpoint,
          apiKey: token.apiKey,
        };

        await expect(
          app.createBooking({
            token: tokenWithoutAgentCode,
            typeDefsAndQueries,
            payload: {
              availabilityKey: 'fake-key',
              holder: {
                name: 'John',
                surname: 'Doe',
              },
            },
          })
        ).rejects.toThrow('an agent code is required');
      });

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

      it('should throw error when participants exceed total quantity', async () => {
        await expect(
          app.createBooking({
            token,
            typeDefsAndQueries,
            payload: {
              availabilityKey: jwt.sign({
                items: [{
                  productCode: '120',
                  startTimeLocal: `${moment().add(1, 'd').format(dateFormat)} 10:00:00`,
                  quantities: [{ optionLabel: 'Adult', value: 2 }],
                }],
                totalAmount: 300,
              }, app.jwtKey),
              holder: {
                name: 'A',
                surname: 'B',
                emailAddress: 'a@b.com',
              },
              participants: [
                { firstName: 'P1', lastName: 'One' },
                { firstName: 'P2', lastName: 'Two' },
                { firstName: 'P3', lastName: 'Three' },
              ],
            },
          })
        ).rejects.toThrow(/participants count \(3\) exceeds total quantity \(2\)/);
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
