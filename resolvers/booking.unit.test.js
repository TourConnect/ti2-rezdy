/* globals describe, it, expect */
const { translateBooking } = require('./booking');

describe('Booking Resolver Unit Tests', () => {
  const mockTypeDefs = `
    type Query {
      id: String
      orderId: String
      bookingId: String
      supplierBookingId: String
      status: String
      productId: String
      productName: String
      cancellable: Boolean
      editable: Boolean
      unitItems: [UnitItem]
      start: String
      end: String
      bookingDate: String
      holder: Holder
      notes: String
      price: Price
      cancelPolicy: String
      optionId: String
      optionName: String
      resellerReference: String
      publicUrl: String
      privateUrl: String
      pickupRequested: Boolean
      pickupPointId: String
      pickupPoint: PickupPoint
    }
    type Holder {
      name: String
      surname: String
      fullName: String
      phoneNumber: String
    }
    type UnitItem {
      unitItemId: String
      unitId: String
      unitName: String
      quantity: Int
    }
    type Price {
      original: Float
      retail: Float
      currency: String
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
      id
      orderId
      status
      cancellable
    }
  `;

  describe('translateBooking - success cases', () => {
    it('should translate booking with direct format', async () => {
      const rootValue = {
        orderNumber: 'ORD-123',
        status: 'CONFIRMED',
        cancellable: true,
        items: [{
          productCode: 'PROD-1',
          quantities: [{ optionLabel: 'Adult', value: 2 }],
        }],
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: mockQuery,
      });

      expect(result).toBeTruthy();
      expect(result.id).toBe('ORD-123');
      expect(result.orderId).toBe('ORD-123');
      expect(result.status).toBe('CONFIRMED');
      expect(result.cancellable).toBe(true);
    });

    it('should unwrap booking from wrapped format', async () => {
      const rootValue = {
        requestStatus: { success: true },
        booking: {
          orderNumber: 'ORD-456',
          status: 'CONFIRMED',
          cancellable: true,
          items: [],
        },
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: mockQuery,
      });

      expect(result).toBeTruthy();
      expect(result.id).toBe('ORD-456');
    });

    it('should handle CANCELLED status making cancellable false', async () => {
      const rootValue = {
        orderNumber: 'ORD-789',
        status: 'CANCELLED',
        cancellable: true, // Should be overridden
        items: [],
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: mockQuery,
      });

      expect(result.cancellable).toBe(false);
    });

    it('should handle missing optional fields', async () => {
      const rootValue = {
        orderNumber: 'ORD-999',
        status: 'CONFIRMED',
        items: [],
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: mockQuery,
      });

      expect(result).toBeTruthy();
      expect(result.id).toBe('ORD-999');
    });
  });

  describe('translateBooking - error handling', () => {
    it('should throw error for GraphQL errors', async () => {
      const rootValue = {
        orderNumber: 'ORD-123',
        items: [],
      };

      const invalidQuery = `query { nonExistentField }`;

      await expect(
        translateBooking({
          rootValue,
          typeDefs: mockTypeDefs,
          query: invalidQuery,
        })
      ).rejects.toThrow();
    });

    it('should properly serialize error messages', async () => {
      const rootValue = {
        items: [],
      };
      const invalidQuery = `query { field1 field2 }`;

      try {
        await translateBooking({
          rootValue,
          typeDefs: mockTypeDefs,
          query: invalidQuery,
        });
        fail('Should have thrown an error');
      } catch (error) {
        // Error message should contain field names
        expect(error.message).toMatch(/field1|field2/);
      }
    });
  });

  describe('Holder resolver', () => {
    it('should map customer fields to holder', async () => {
      const rootValue = {
        orderNumber: 'ORD-123',
        status: 'CONFIRMED',
        customer: {
          firstName: 'John',
          lastName: 'Doe',
          name: 'John Doe',
          phone: '+1234567890',
        },
        items: [],
      };

      const query = `
        query {
          holder {
            name
            surname
            fullName
            phoneNumber
          }
        }
      `;

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query,
      });

      expect(result.holder.name).toBe('John');
      expect(result.holder.surname).toBe('Doe');
      expect(result.holder.fullName).toBe('John Doe');
      expect(result.holder.phoneNumber).toBe('+1234567890');
    });
  });

  describe('Notes resolver', () => {
    it('should prioritize internalNotes over comments', async () => {
      const rootValue = {
        orderNumber: 'ORD-123',
        status: 'CONFIRMED',
        internalNotes: 'Internal note',
        comments: 'Comment',
        items: [],
      };

      const query = `query { notes }`;

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query,
      });

      expect(result.notes).toBe('Internal note');
    });

    it('should fallback to comments if no internalNotes', async () => {
      const rootValue = {
        orderNumber: 'ORD-123',
        status: 'CONFIRMED',
        comments: 'Comment only',
        items: [],
      };

      const query = `query { notes }`;

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query,
      });

      expect(result.notes).toBe('Comment only');
    });
  });

  describe('UnitItems resolver', () => {
    it('should map quantities to unitItems', async () => {
      const rootValue = {
        orderNumber: 'ORD-123',
        status: 'CONFIRMED',
        items: [{
          quantities: [
            { optionLabel: 'Adult', value: 2 },
            { optionLabel: 'Child', quantity: 1 },
          ],
        }],
      };

      const query = `
        query {
          unitItems {
            unitId
            unitName
            quantity
          }
        }
      `;

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query,
      });

      expect(result.unitItems).toHaveLength(2);
      expect(result.unitItems[0].unitName).toBe('Adult');
      expect(result.unitItems[0].quantity).toBe(2);
      expect(result.unitItems[1].unitName).toBe('Child');
      expect(result.unitItems[1].quantity).toBe(1);
    });
  });

  describe('Private URL resolver', () => {
    const privateUrlQuery = `query { privateUrl }`;

    it('should build production dashboard URL from API endpoint', async () => {
      const rootValue = {
        orderNumber: 'R4DLYBR',
        status: 'CONFIRMED',
        items: [],
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: privateUrlQuery,
        apiEndpoint: 'https://api.rezdy.com/v1',
      });

      expect(result.privateUrl).toBe('https://app.rezdy.com/orders/edit/R4DLYBR');
    });

    it('should build staging dashboard URL from API endpoint', async () => {
      const rootValue = {
        orderNumber: 'R4DLYBR',
        status: 'CONFIRMED',
        items: [],
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: privateUrlQuery,
        apiEndpoint: 'https://api.rezdy-staging.com/v1',
      });

      expect(result.privateUrl).toBe('https://app.rezdy-staging.com/orders/edit/R4DLYBR');
    });

    it('should work with endpoint without /v1 path', async () => {
      const rootValue = {
        orderNumber: 'R4DLYBR',
        status: 'CONFIRMED',
        items: [],
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: privateUrlQuery,
        apiEndpoint: 'https://api.rezdy.com',
      });

      expect(result.privateUrl).toBe('https://app.rezdy.com/orders/edit/R4DLYBR');
    });

    it('should handle missing orderNumber', async () => {
      const rootValue = {
        status: 'CONFIRMED',
        items: [],
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: privateUrlQuery,
        apiEndpoint: 'https://api.rezdy.com/v1',
      });

      expect(result.privateUrl).toBe('');
    });

    it('should handle missing endpoint', async () => {
      const rootValue = {
        orderNumber: 'R4DLYBR',
        status: 'CONFIRMED',
        items: [],
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: privateUrlQuery,
      });

      expect(result.privateUrl).toBe('');
    });

    it('should handle invalid endpoint URL', async () => {
      const rootValue = {
        orderNumber: 'R4DLYBR',
        status: 'CONFIRMED',
        items: [],
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: privateUrlQuery,
        apiEndpoint: 'not-a-valid-url',
      });

      expect(result.privateUrl).toBe('');
    });

    it('should work with custom domains', async () => {
      const rootValue = {
        orderNumber: 'R4DLYBR',
        status: 'CONFIRMED',
        items: [],
      };

      const result = await translateBooking({
        rootValue,
        typeDefs: mockTypeDefs,
        query: privateUrlQuery,
        apiEndpoint: 'https://api.rezdy-custom.example.com/v1',
      });

      expect(result.privateUrl).toBe('https://app.rezdy-custom.example.com/orders/edit/R4DLYBR');
    });
  });
});
