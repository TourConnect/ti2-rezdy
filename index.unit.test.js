/* globals describe, it, expect, beforeEach */
const Plugin = require('./index');

describe('Unit Tests - Helper Functions', () => {
  let plugin;

  beforeEach(() => {
    plugin = new Plugin({
      jwtKey: 'test-jwt-key',
    });
  });

  describe('validateEndpoint', () => {
    it('should return default endpoint when no endpoint provided', () => {
      const result = plugin.validateEndpoint();
      expect(result).toBe('https://api.rezdy.com/v1');
    });

    it('should return default endpoint when empty string provided', () => {
      const result = plugin.validateEndpoint('');
      expect(result).toBe('https://api.rezdy.com/v1');
    });

    it('should return valid endpoint when provided', () => {
      const endpoint = 'https://api.rezdy-staging.com/v1';
      const result = plugin.validateEndpoint(endpoint);
      expect(result).toBe(endpoint);
    });

    it('should throw error for invalid URL', () => {
      expect(() => {
        plugin.validateEndpoint('not-a-valid-url');
      }).toThrow('Invalid endpoint URL');
    });

    it('should throw error for malformed URL', () => {
      expect(() => {
        plugin.validateEndpoint('://invalid');
      }).toThrow('Invalid endpoint URL');
    });

    it('should use instance endpoint as fallback', () => {
      plugin.endpoint = 'https://custom.endpoint.com';
      const result = plugin.validateEndpoint();
      expect(result).toBe('https://custom.endpoint.com');
    });
  });

  describe('calculateSeatsAvailable', () => {
    it('should return 0 for null input', () => {
      const result = plugin.calculateSeatsAvailable(null);
      expect(result).toBe(0);
    });

    it('should return 0 for undefined input', () => {
      const result = plugin.calculateSeatsAvailable(undefined);
      expect(result).toBe(0);
    });

    it('should return seatsAvailable when present', () => {
      const result = plugin.calculateSeatsAvailable({ seatsAvailable: 10 });
      expect(result).toBe(10);
    });

    it('should fallback to available', () => {
      const result = plugin.calculateSeatsAvailable({ available: 5 });
      expect(result).toBe(5);
    });

    it('should fallback to vacancies', () => {
      const result = plugin.calculateSeatsAvailable({ vacancies: 3 });
      expect(result).toBe(3);
    });

    it('should fallback to availableSeats', () => {
      const result = plugin.calculateSeatsAvailable({ availableSeats: 7 });
      expect(result).toBe(7);
    });

    it('should fallback to remainingSeats', () => {
      const result = plugin.calculateSeatsAvailable({ remainingSeats: 2 });
      expect(result).toBe(2);
    });

    it('should prefer seatsAvailable over other fields', () => {
      const result = plugin.calculateSeatsAvailable({
        seatsAvailable: 10,
        available: 5,
        vacancies: 3,
      });
      expect(result).toBe(10);
    });

    it('should handle zero value correctly', () => {
      const result = plugin.calculateSeatsAvailable({ seatsAvailable: 0 });
      expect(result).toBe(0);
    });
  });

  describe('extractAvailabilityData', () => {
    it('should return empty array for null input', () => {
      const result = plugin.extractAvailabilityData(null, 'product123');
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      const result = plugin.extractAvailabilityData(undefined, 'product123');
      expect(result).toEqual([]);
    });

    it('should handle direct array response', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual(data);
    });

    it('should extract from sessions field', () => {
      const data = { sessions: [{ id: 1 }] };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([{ id: 1 }]);
    });

    it('should extract from availability field', () => {
      const data = { availability: [{ id: 1 }] };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([{ id: 1 }]);
    });

    it('should extract from data field', () => {
      const data = { data: [{ id: 1 }] };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([{ id: 1 }]);
    });

    it('should extract from items field', () => {
      const data = { items: [{ id: 1 }] };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([{ id: 1 }]);
    });

    it('should handle single object as array', () => {
      const data = { id: 1, name: 'Test' };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([data]);
    });

    it('should handle requestStatus with success', () => {
      const data = {
        requestStatus: { success: true },
        sessions: [{ id: 1 }],
      };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([{ id: 1 }]);
    });

    it('should return empty array for failed requestStatus', () => {
      const data = {
        requestStatus: { success: false, error: 'Some error' },
      };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([]);
    });

    it('should not wrap requestStatus object as data', () => {
      const data = { requestStatus: { success: true } };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([]);
    });

    it('should prefer sessions over other fields when requestStatus present', () => {
      const data = {
        requestStatus: { success: true },
        sessions: [{ id: 1 }],
        data: [{ id: 2 }],
        availability: [{ id: 3 }],
      };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([{ id: 1 }]);
    });
  });

  describe('Constructor', () => {
    it('should set default endpoint if not provided', () => {
      const newPlugin = new Plugin({});
      expect(newPlugin.endpoint).toBe('https://api.rezdy.com/v1');
    });

    it('should use provided endpoint', () => {
      const newPlugin = new Plugin({ endpoint: 'https://custom.com' });
      expect(newPlugin.endpoint).toBe('https://custom.com');
    });

    it('should set jwtKey from params', () => {
      const newPlugin = new Plugin({ jwtKey: 'my-secret-key' });
      expect(newPlugin.jwtKey).toBe('my-secret-key');
    });
  });

  describe('tokenTemplate', () => {
    it('should return template with apiKey', () => {
      const template = plugin.tokenTemplate();
      expect(template).toHaveProperty('apiKey');
      expect(template.apiKey).toHaveProperty('type', 'text');
      expect(template.apiKey).toHaveProperty('regExp');
    });

    it('should return template with resellerId', () => {
      const template = plugin.tokenTemplate();
      expect(template).toHaveProperty('resellerId');
      expect(template.resellerId).toHaveProperty('type', 'text');
      expect(template.resellerId).toHaveProperty('regExp');
    });

    it('should validate apiKey regex', () => {
      const template = plugin.tokenTemplate();
      const regex = template.apiKey.regExp;
      
      // Valid hex strings
      expect(regex.test('abc123')).toBeTruthy();
      expect(regex.test('ABCDEF')).toBeTruthy();
      expect(regex.test('0123456789abcdefABCDEF')).toBeTruthy();
      
      // Invalid strings
      expect(regex.test('xyz')).toBeFalsy();
      expect(regex.test('abc-123')).toBeFalsy();
      expect(regex.test('abc 123')).toBeFalsy();
    });
  });
});

describe('Unit Tests - Edge Cases', () => {
  let plugin;

  beforeEach(() => {
    plugin = new Plugin({
      jwtKey: 'test-jwt-key',
    });
  });

  describe('Edge Cases - validateEndpoint', () => {
    it('should handle null', () => {
      const result = plugin.validateEndpoint(null);
      expect(result).toBe('https://api.rezdy.com/v1');
    });

    it('should handle undefined', () => {
      const result = plugin.validateEndpoint(undefined);
      expect(result).toBe('https://api.rezdy.com/v1');
    });

    it('should reject non-string types', () => {
      expect(() => plugin.validateEndpoint(123)).toThrow();
      expect(() => plugin.validateEndpoint({})).toThrow();
      expect(() => plugin.validateEndpoint([])).toThrow();
    });
  });

  describe('Edge Cases - calculateSeatsAvailable', () => {
    it('should handle negative values', () => {
      const result = plugin.calculateSeatsAvailable({ seatsAvailable: -5 });
      expect(result).toBe(-5);
    });

    it('should handle string numbers and convert to number', () => {
      const result = plugin.calculateSeatsAvailable({ seatsAvailable: '10' });
      expect(result).toBe(10); // Should convert string to number
      expect(typeof result).toBe('number');
    });

    it('should handle NaN and return 0', () => {
      const result = plugin.calculateSeatsAvailable({ seatsAvailable: NaN });
      expect(result).toBe(0); // NaN should be converted to 0
      expect(typeof result).toBe('number');
    });

    it('should handle empty object', () => {
      const result = plugin.calculateSeatsAvailable({});
      expect(result).toBe(0);
    });
  });

  describe('Edge Cases - extractAvailabilityData', () => {
    it('should handle empty array', () => {
      const result = plugin.extractAvailabilityData([], 'product123');
      expect(result).toEqual([]);
    });

    it('should handle empty object', () => {
      const result = plugin.extractAvailabilityData({}, 'product123');
      expect(result).toEqual([{}]);
    });

    it('should handle mixed data types in arrays', () => {
      const data = [1, 'string', null, { id: 1 }];
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual(data);
    });

    it('should handle nested structures', () => {
      const data = {
        requestStatus: { success: true },
        sessions: [
          { id: 1, nested: { deep: 'value' } },
        ],
      };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([{ id: 1, nested: { deep: 'value' } }]);
    });

    it('should handle false boolean values correctly', () => {
      const data = {
        sessions: [{ id: 1, available: false }],
      };
      const result = plugin.extractAvailabilityData(data, 'product123');
      expect(result).toEqual([{ id: 1, available: false }]);
    });
  });

  describe('Error Scenarios - validateToken', () => {
    it('should return false when API request fails', async () => {
      // Mock axios to throw error
      const originalAxios = plugin.axios;
      plugin.axios = jest.fn().mockRejectedValue(new Error('Network error'));
      
      const result = await plugin.validateToken({
        token: {
          endpoint: 'https://api.rezdy.com/v1',
          apiKey: 'invalid-key',
        },
      });
      
      expect(result).toBe(false);
      plugin.axios = originalAxios;
    });

    it('should return false when API returns empty products array', async () => {
      const originalAxios = plugin.axios;
      plugin.axios = jest.fn().mockResolvedValue({
        data: { products: [] },
      });
      
      const result = await plugin.validateToken({
        token: {
          endpoint: 'https://api.rezdy.com/v1',
          apiKey: 'test-key',
        },
      });
      
      expect(result).toBe(false);
      plugin.axios = originalAxios;
    });
  });

  describe('Error Scenarios - searchQuote', () => {
    it('should return empty quote array (not implemented)', async () => {
      const result = await plugin.searchQuote({
        token: {
          endpoint: 'https://api.rezdy.com/v1',
          apiKey: 'test-key',
        },
        payload: {
          productIds: ['123'],
          optionIds: ['456'],
        },
      });
      
      expect(result).toEqual({ quote: [] });
    });
  });

  describe('Error Scenarios - validateEndpoint', () => {
    it('should handle empty string as falsy', () => {
      const result = plugin.validateEndpoint('');
      expect(result).toBe('https://api.rezdy.com/v1');
    });

    it('should reject object types', () => {
      expect(() => plugin.validateEndpoint({ url: 'test' })).toThrow();
    });

    it('should reject array types', () => {
      expect(() => plugin.validateEndpoint(['url'])).toThrow();
    });
  });
});
