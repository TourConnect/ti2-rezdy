/* globals describe, it, expect */
const { translateAvailability } = require('./availability');

describe('Availability Resolver Unit Tests', () => {
  const mockTypeDefs = `
    type Query {
      key: String
      dateTimeStart: String
      dateTimeEnd: String
      allDay: Boolean
      vacancies: Int
      available: Boolean
      pricing: Pricing
      unitPricing: [Pricing]
      pickupAvailable: Boolean
      pickupRequired: Boolean
      pickupPoints: [PickupPoint]
      offers: String
    }
    type Pricing {
      unitId: String
      original: Float
      retail: Float
      net: Float
      currencyPrecision: Int
    }
    type PickupPoint {
      id: String
      name: String
      directions: String
      localDateTime: String
    }
  `;

  const mockQuery = `
    query {
      key
      dateTimeStart
      available
    }
  `;

  describe('translateAvailability - success cases', () => {
    it('should translate availability with valid data', async () => {
      const rootValue = {
        status: 'AVAILABLE',
        startTimeLocal: '2026-02-01T10:00:00',
        endTimeLocal: '2026-02-01T12:00:00',
        seatsAvailable: 10,
        priceOptions: [],
        unitsWithQuantity: [],
      };

      const variableValues = {
        productId: 'prod-123',
        optionId: 'opt-456',
        currency: 'USD',
        unitsWithQuantity: [],
        jwtKey: 'test-key',
      };

      const result = await translateAvailability({
        rootValue,
        variableValues,
        typeDefs: mockTypeDefs,
        query: mockQuery,
      });

      expect(result).toBeTruthy();
      expect(result.available).toBeDefined();
      expect(result.dateTimeStart).toBe('2026-02-01T10:00:00');
    });

    it('should handle FREESALE status', async () => {
      const rootValue = {
        status: 'FREESALE',
        startTimeLocal: '2026-02-01T10:00:00',
        seatsAvailable: 0,
        priceOptions: [],
        unitsWithQuantity: [],
      };

      const variableValues = {
        productId: 'prod-123',
        optionId: 'opt-456',
        currency: 'USD',
        unitsWithQuantity: [],
        jwtKey: 'test-key',
      };

      const result = await translateAvailability({
        rootValue,
        variableValues,
        typeDefs: mockTypeDefs,
        query: mockQuery,
      });

      expect(result).toBeTruthy();
    });

    it('should convert null prototype objects to plain objects', async () => {
      const rootValue = {
        status: 'AVAILABLE',
        startTimeLocal: '2026-02-01T10:00:00',
        seatsAvailable: 10,
        priceOptions: [],
        unitsWithQuantity: [],
      };

      const result = await translateAvailability({
        rootValue,
        variableValues: {
          productId: 'prod-123',
          optionId: 'opt-456',
          currency: 'USD',
          unitsWithQuantity: [],
          jwtKey: 'test-key',
        },
        typeDefs: mockTypeDefs,
        query: mockQuery,
      });

      // Check that result is a plain object
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });
  });

  describe('translateAvailability - error handling', () => {
    it('should throw error for GraphQL errors', async () => {
      const rootValue = {
        status: 'AVAILABLE',
        startTimeLocal: '2026-02-01T10:00:00',
        priceOptions: [],
        unitsWithQuantity: [],
      };

      const invalidQuery = `query { nonExistentField }`;

      await expect(
        translateAvailability({
          rootValue,
          variableValues: {
            jwtKey: 'test-key',
            productId: 'prod-123',
            optionId: 'opt-456',
            currency: 'USD',
            unitsWithQuantity: [],
          },
          typeDefs: mockTypeDefs,
          query: invalidQuery,
        })
      ).rejects.toThrow();
    });

    it('should serialize multiple GraphQL errors', async () => {
      const rootValue = {
        priceOptions: [],
        unitsWithQuantity: [],
      };
      const invalidQuery = `query { field1 field2 field3 }`;

      await expect(
        translateAvailability({
          rootValue,
          variableValues: {
            jwtKey: 'test-key',
            productId: 'prod-123',
            optionId: 'opt-456',
            currency: 'USD',
            unitsWithQuantity: [],
          },
          typeDefs: mockTypeDefs,
          query: invalidQuery,
        })
      ).rejects.toThrow();
    });
  });

  describe('Helper Functions', () => {
    // These would test the helper functions if they were exported
    // For now, they're tested indirectly through translateAvailability
    
    it('should handle price option matching by unitId', async () => {
      const rootValue = {
        status: 'AVAILABLE',
        startTimeLocal: '2026-02-01T10:00:00',
        priceOptions: [
          { id: 'adult', label: 'Adult', price: 50 },
          { id: 'child', label: 'Child', price: 25 },
        ],
        unitsWithQuantity: [
          { unitId: 'adult', quantity: 2 },
        ],
      };

      const query = `
        query {
          pricing {
            original
          }
        }
      `;

      const result = await translateAvailability({
        rootValue,
        variableValues: {
          productId: 'prod-123',
          optionId: 'opt-456',
          currency: 'USD',
          unitsWithQuantity: [{ unitId: 'adult', quantity: 2 }],
          jwtKey: 'test-key',
        },
        typeDefs: mockTypeDefs,
        query,
      });

      expect(result.pricing).toBeTruthy();
      expect(result.pricing.original).toBe(100); // 2 * 50
    });
  });
});
