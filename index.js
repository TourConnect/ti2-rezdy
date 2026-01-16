const axiosRaw = require('axios');
const curlirize = require('axios-curlirize');
const R = require('ramda');
const Promise = require('bluebird');
const assert = require('assert');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const wildcardMatch = require('./utils/wildcardMatch');
const { translateProduct } = require('./resolvers/product');
const { translateAvailability } = require('./resolvers/availability');
const { translateBooking } = require('./resolvers/booking');
const { translateRate } = require('./resolvers/rate');

// Concurrency limit for parallel API requests
const CONCURRENCY = 3;
// Rezdy API error code for "No order found" - expected in search scenarios
const ERROR_CODE_NO_ORDER_FOUND = '24';
// Default Rezdy API endpoint
const DEFAULT_ENDPOINT = 'https://api.rezdy.com/v1';
// Availability status constants
const STATUS_AVAILABLE = 'AVAILABLE';
const STATUS_FREESALE = 'FREESALE';
// Email value to skip (case-insensitive)
const SKIP_EMAIL_VALUE = 'collect';
// Payment type constants
const PAYMENT_TYPE_CASH = 'CASH';
const PAYMENT_RECIPIENT_SUPPLIER = 'SUPPLIER';
// Booking status constants
const STATUS_CANCELLED = 'CANCELLED';
// Default option ID
const DEFAULT_OPTION_ID = 'default';

if (process.env.debug) {
  curlirize(axiosRaw);
}

const isNilOrEmpty = R.either(R.isNil, R.isEmpty);

/**
 * Validates if a string is a valid URL
 * @param {string} string - String to validate
 * @returns {boolean} True if valid URL, false otherwise
 */
const isValidUrl = (string) => {
  if (!string || typeof string !== 'string') return false;
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

/**
 * Gets headers for API requests
 * @param {Object} params - Header parameters
 * @param {string} params.apiKey - API key for authentication
 * @returns {Object} Headers object
 */
const getHeaders = ({
  apiKey,
}) => ({
  apiKey,
  'Content-Type': 'application/json',
});


/**
 * Safely extracts request information from axios request config
 * Sanitizes sensitive data like API keys from headers
 * @param {Object} request - Axios request config object
 * @returns {Object} Safe request object with only selected fields and sanitized headers
 */
const axiosSafeRequest = (request) => {
  const safe = R.pick(['method', 'url', 'data'], request);
  if (request.headers) {
    // Omit sensitive headers to prevent API key leakage in logs
    safe.headers = R.omit(['apiKey', 'apikey', 'authorization', 'Authorization'], request.headers);
  }
  return safe;
};

/**
 * Safely extracts response information from axios response
 * @param {Object} response - Axios response object
 * @returns {Object} Safe response object with sanitized request field
 */
const axiosSafeResponse = response => {
  const retVal = R.pick(['data', 'status', 'statusText', 'headers', 'request'], response);
  retVal.request = axiosSafeRequest(retVal.request);
  return retVal;
};
class Plugin {
  /**
   * Plugin constructor
   * @param {Object} params - Plugin configuration parameters
   * @param {string} [params.endpoint] - Rezdy API endpoint (defaults to production)
   */
  constructor(params) { // we get the env variables from here
    Object.entries(params).forEach(([attr, value]) => {
      this[attr] = value;
    });
    // Set default endpoint if not provided
    if (!this.endpoint) {
      this.endpoint = DEFAULT_ENDPOINT;
    }
    if (this.events) {
      axiosRaw.interceptors.request.use(request => {
        this.events.emit(`${this.name}.axios.request`, axiosSafeRequest(request));
        return request;
      });
      axiosRaw.interceptors.response.use(response => {
        this.events.emit(`${this.name}.axios.response`, axiosSafeResponse(response));
        return response;
      });
    }
    const pluginObj = this;
    this.axios = async (...args) => {
      try {
        const response = await axiosRaw(...args);
        // Check if response has requestStatus with success: false
        // This is a valid HTTP response but indicates an API-level error
        if (response.data && response.data.requestStatus && !response.data.requestStatus.success) {
          const errorCode = R.path(['data', 'requestStatus', 'error', 'errorCode'], response);
          // Error code '24' means "No order found" - this is expected in search scenarios
          // Don't treat it as an exception, return the response so caller can handle it
          if (errorCode === ERROR_CODE_NO_ORDER_FOUND) {
            return response;
          }
          // For other API errors, throw an error
          const errorMessage = R.path(['data', 'requestStatus', 'error', 'errorMessage'], response);
          const error = new Error(errorMessage || 'API request failed');
          error.response = response;
          error.errorCode = errorCode;
          throw error;
        }
        return response;
      } catch (err) {
        const errMsg = R.omit(['config'], err.toJSON ? err.toJSON() : {});
        // Only log errors that are not expected "not found" responses
        const errorCode = R.path(['response', 'data', 'requestStatus', 'error', 'errorCode'], err);
        if (errorCode !== ERROR_CODE_NO_ORDER_FOUND) {
          if (process.env.debug) {
            console.log(`error in ${this.name}`, err.response?.data || err.message);
          }
          if (pluginObj.events) {
            pluginObj.events.emit(`${this.name}.axios.error`, {
              request: args[0],
              err: errMsg,
            });
          }
        }
        throw R.pathOr(err, ['response', 'data', 'details'], err);
      }
    };
    /**
     * Returns the token template for API authentication
     * @returns {Object} Token template with apiKey and resellerId fields
     */
    this.tokenTemplate = () => ({
      apiKey: {
        type: 'text',
        regExp: /^[a-fA-F0-9]+$/,
        description: 'the Api Key provided from Rezdy, should be in uuid format',
      },
      resellerId: {
        type: 'text',
        regExp: /^[a-fA-F0-9]+$/,
        description: 'the Reseller Id provided from Rezdy, should be in uuid format',
      },
    });
  }

  /**
   * Validates and normalizes endpoint URL
   * @param {string} endpoint - Endpoint URL to validate
   * @returns {string} Validated endpoint or default
   * @throws {Error} If endpoint is provided but invalid
   */
  validateEndpoint(endpoint) {
    if (!endpoint) {
      return this.endpoint || DEFAULT_ENDPOINT;
    }
    if (!isValidUrl(endpoint)) {
      throw new Error(`Invalid endpoint URL: ${endpoint}`);
    }
    return endpoint;
  }

  /**
   * Calculates seats available from availability object
   * Handles multiple field name variations and ensures numeric return
   * @param {Object} avail - Availability object
   * @returns {number} Number of seats available (always a number, never string)
   */
  calculateSeatsAvailable(avail) {
    if (!avail) return 0;
    const seats = avail.seatsAvailable !== undefined ? avail.seatsAvailable 
      : (avail.available !== undefined ? avail.available 
        : (avail.vacancies !== undefined ? avail.vacancies 
          : (avail.availableSeats !== undefined ? avail.availableSeats 
            : (avail.remainingSeats !== undefined ? avail.remainingSeats : 0))));
    // Ensure numeric return value to prevent string/number type issues
    return Number(seats) || 0;
  }

  /**
   * Extract availability data from Rezdy API response
   * Handles multiple response structures:
   * - Direct array: [{...}, {...}]
   * - Wrapped: { data: [{...}, {...}] }
   * - Wrapped: { availability: [{...}, {...}] }
   * - Wrapped: { sessions: [{...}, {...}] }
   * - Single object: {...}
   * @param {Object|Array} data - API response data
   * @param {string} productId - Product identifier for logging
   * @returns {Array<Object>} Extracted availability data array
   */
  extractAvailabilityData(data, productId) {
    if (!data) return [];
    
    // If response has a requestStatus wrapper, check it first
    if (data.requestStatus) {
      if (data.requestStatus.success === false) {
        // API error - return empty array
        if (process.env.debug) {
          console.log(`API error for product ${productId}:`, data.requestStatus);
        }
        return [];
      }
      // If success, the actual data might be in a different field
      // Try common field names - sessions is the most common for Rezdy
      if (Array.isArray(data.sessions)) return data.sessions;
      if (Array.isArray(data.availability)) return data.availability;
      if (Array.isArray(data.data)) return data.data;
      if (Array.isArray(data.items)) return data.items;
    }
    
    // Handle different response structures
    if (Array.isArray(data)) {
      return data;
    } else if (data && Array.isArray(data.data)) {
      return data.data;
    } else if (data && Array.isArray(data.availability)) {
      return data.availability;
    } else if (data && Array.isArray(data.sessions)) {
      return data.sessions;
    } else if (data && Array.isArray(data.items)) {
      return data.items;
    } else if (data && typeof data === 'object' && !data.requestStatus) {
      // Single availability object (but not if it's just a requestStatus wrapper)
      return [data];
    }
    
    // Unexpected response structure - log only in debug mode
    if (process.env.debug) {
      console.log(`Unexpected response structure for product ${productId}:`, JSON.stringify(data, null, 2));
    }
    
    return [];
  }

  /**
   * Validates API token by checking if products can be retrieved
   * @param {Object} params - Validation parameters
   * @param {Object} params.token - Token object
   * @param {string} params.token.endpoint - API endpoint URL
   * @param {string} params.token.apiKey - API key for authentication
   * @returns {Promise<boolean>} True if token is valid, false otherwise
   */
  async validateToken({
    token: {
      endpoint,
      apiKey,
    },
  }) {
    const validatedEndpoint = this.validateEndpoint(endpoint);
    const url = `${validatedEndpoint}/products`;
    const headers = getHeaders({
      apiKey,
    });
    try {
      const products = R.path(['data', 'products'], await this.axios({
        method: 'get',
        url,
        headers,
      }));
      return Array.isArray(products) && products.length > 0;
    } catch (err) {
      return false;
    }
  }

  /**
   * Searches for products
   * @param {Object} params - Search parameters
   * @param {Object} params.token - Token object with endpoint and apiKey
   * @param {Object} [params.payload] - Search payload with optional productId
   * @param {Object} params.typeDefsAndQueries - GraphQL type definitions and query
   * @returns {Promise<Object>} Object with products array
   */
  async searchProducts({
    token: {
      endpoint,
      apiKey,
    },
    payload,
    typeDefsAndQueries: {
      productTypeDefs,
      productQuery,
    },
  }) {
    const validatedEndpoint = this.validateEndpoint(endpoint);
    let url = `${validatedEndpoint}/products`;
    if (!isNilOrEmpty(payload)) {
      if (payload.productId) {
        url = `${url}/${payload.productId}`;
      }
    }
    const headers = getHeaders({
      apiKey,
    });
    let results = R.pathOr([], ['data', 'products'], await this.axios({
      method: 'get',
      url,
      headers,
    }));
    if (!Array.isArray(results)) results = [results];
    let products = await Promise.map(results, async product => {
      return translateProduct({
        rootValue: product,
        typeDefs: productTypeDefs,
        query: productQuery,
      });
    });
    // dynamic extra filtering
    if (!isNilOrEmpty(payload)) {
      const extraFilters = R.omit(['productId'], payload);
      if (Object.keys(extraFilters).length > 0) {
        products = products.filter(
          product => Object.entries(extraFilters).every(
            ([key, value]) => {
              if (typeof value === 'string') return wildcardMatch(value, product[key]);
              return true;
            },
          ),
        );
      }
    }
    return ({ products });
  }

  /**
   * Searches for quote (not implemented)
   * @param {Object} params - Search parameters
   * @param {Object} params.token - Token object with endpoint and apiKey
   * @param {Object} params.payload - Search payload with productIds and optionIds
   * @returns {Promise<Object>} Object with empty quote array
   */
  async searchQuote({
    token: {
      endpoint,
      apiKey,
    },
    payload: {
      productIds,
      optionIds,
    },
  }) {
    // Not implemented - Rezdy API doesn't support quote endpoint
    return { quote: [] };
  }

  /**
   * Searches for availability for given products
   * @param {Object} params - Search parameters
   * @param {Object} params.token - Token object with endpoint and apiKey
   * @param {Object} params.payload - Search payload with productIds, dates, etc.
   * @param {Object} params.typeDefsAndQueries - GraphQL type definitions and query
   * @returns {Promise<Object>} Object with availability array
   */
  async searchAvailability({
    token: {
      endpoint,
      apiKey,
    },
    payload: {
      productIds,
      optionIds,
      units,
      startDate,
      endDate,
      dateFormat,
      currency,
    },
    typeDefsAndQueries: {
      availTypeDefs,
      availQuery,
    },
  }) {
    assert(this.jwtKey, 'JWT secret should be set');
    assert(
      productIds.length === optionIds.length,
      'mismatched productIds/options length',
    );
    assert(
      optionIds.length === units.length,
      'mismatched options/units length',
    );
    assert(productIds.every(Boolean), 'some invalid productId(s)');
    assert(optionIds.every(Boolean), 'some invalid optionId(s)');
    const validatedEndpoint = this.validateEndpoint(endpoint);
    const localDateStart = moment(startDate, dateFormat).format('YYYY-MM-DD HH:mm:ss');
    const localDateEnd = moment(endDate, dateFormat).format('YYYY-MM-DD 23:59:59');
    const headers = getHeaders({
      apiKey,
    });
    const url = `${validatedEndpoint}/availability`;
    let availability = (
      await Promise.map(productIds, async (productId, ix) => {
        const response = await this.axios({
          method: 'get',
          url: `${url}?productCode=${encodeURIComponent(productId)}&startTimeLocal=${encodeURIComponent(localDateStart)}&endTimeLocal=${encodeURIComponent(localDateEnd)}`,
          headers,
        });
        
        // Extract availability data from response using helper function
        return this.extractAvailabilityData(response.data, productId);
      }, { concurrency: CONCURRENCY })
    );
    // Filter out any null/undefined values and ensure all elements are arrays
    availability = availability.filter(Boolean).map(avails => Array.isArray(avails) ? avails : []);
    
    // Fetch pickup points once per product (not per availability session)
    const pickupPointsByProduct = await Promise.map(productIds, async (productId) => {
      return R.pathOr([], ['data', 'pickupLocations'], await this.axios({
        method: 'get',
        url: `${validatedEndpoint}/products/${productId}/pickups`,
        headers,
      }));
    }, { concurrency: CONCURRENCY });
    
    availability = await Promise.map(availability,
      async (avails, ix) => {
        return await Promise.map(avails,
          async avail => {
            const pickupPoints = pickupPointsByProduct[ix];
            
            // Map all possible field variations from Rezdy API response
            // First, ensure we have the basic fields from the API response
            // Status: If not provided, infer from seatsAvailable (if seatsAvailable > 0, consider it AVAILABLE)
            let status = avail.status || avail.availabilityStatus || avail.availability?.status;
            const seatsAvailable = this.calculateSeatsAvailable(avail);
            if (!status) {
              // If seats are available, assume it's AVAILABLE; otherwise, we can't determine
              status = seatsAvailable > 0 ? STATUS_AVAILABLE : null;
            }
            
            const startTimeLocal = avail.startTimeLocal || avail.startTime || avail.start;
            const endTimeLocal = avail.endTimeLocal || avail.endTime || avail.end;
            const allDay = avail.allDay !== undefined ? avail.allDay : (avail.allDayEvent || false);
            const priceOptions = avail.priceOptions || avail.prices || avail.pricingOptions || [];

            if (!startTimeLocal || !status) {
              return null;
            }
            
            // Validate status is one of the expected values
            if (status !== STATUS_AVAILABLE && status !== STATUS_FREESALE) {
              return null;
            }
            
            const rootValue = {
              ...avail, // Spread original avail object first to preserve all fields
              pickupPoints,
              unitsWithQuantity: units[ix],
              // Override with normalized field names that resolvers expect
              status,
              startTimeLocal,
              endTimeLocal,
              allDay,
              seatsAvailable,
              priceOptions: Array.isArray(priceOptions) ? priceOptions : [],
            };
            
            const result = await translateAvailability({
              typeDefs: availTypeDefs,
              query: availQuery,
              rootValue,
              variableValues: {
                productId: productIds[ix],
                optionId: optionIds[ix],
                currency,
                unitsWithQuantity: units[ix],
                jwtKey: this.jwtKey,
              },
            });

            return result;
        });
      },
    );
    
    // Ensure clean structure: filter out null/undefined items and ensure proper array structure
    // Combine map and filter operations for better performance
    availability = availability
      .map(avails => {
        if (!Array.isArray(avails)) return [];
        return avails.filter(avail => avail !== null && avail !== undefined);
      })
      .filter(avails => Array.isArray(avails) && avails.length > 0);
    
    return { availability };
  }

  /**
   * Gets availability calendar for given products
   * @param {Object} params - Calendar parameters
   * @param {Object} params.token - Token object with endpoint and apiKey
   * @param {Object} params.payload - Calendar payload with productIds, dates, etc.
   * @param {Object} params.typeDefsAndQueries - GraphQL type definitions and query
   * @returns {Promise<Object>} Object with availability array
   */
  async availabilityCalendar({
    token: {
      endpoint,
      apiKey,
    },
    payload: {
      productIds,
      optionIds,
      units,
      startDate,
      endDate,
      currency,
      dateFormat,
    },
    typeDefsAndQueries: {
      availTypeDefs,
      availQuery,
    },
  }) {
    assert(
      productIds.length === optionIds.length,
      'mismatched productIds/options length',
    );
    assert(
      optionIds.length === units.length,
      'mismatched options/units length',
    );
    assert(productIds.every(Boolean), 'some invalid productId(s)');
    assert(optionIds.every(Boolean), 'some invalid optionId(s)');
    const validatedEndpoint = this.validateEndpoint(endpoint);
    const localDateStart = moment(startDate, dateFormat).format('YYYY-MM-DD HH:mm:ss');
    const localDateEnd = moment(endDate, dateFormat).format('YYYY-MM-DD 23:59:59');
    const headers = getHeaders({
      apiKey,
    });
    const url = `${validatedEndpoint}/availability`;
    let availability = (
      await Promise.map(productIds, async (productId, ix) => {
        const response = await this.axios({
          method: 'get',
          url: `${url}?productCode=${encodeURIComponent(productId)}&startTimeLocal=${encodeURIComponent(localDateStart)}&endTimeLocal=${encodeURIComponent(localDateEnd)}`,
          headers,
        });
        
        // Extract availability data from response using helper function
        return this.extractAvailabilityData(response.data, productId);
      }, { concurrency: CONCURRENCY })
    );
    // Filter out any null/undefined values and ensure all elements are arrays
    availability = availability.filter(Boolean).map(avails => Array.isArray(avails) ? avails : []);
    
    // Fetch pickup points once per product (not per availability session)
    const pickupPointsByProduct = await Promise.map(productIds, async (productId) => {
      return R.pathOr([], ['data', 'pickupLocations'], await this.axios({
        method: 'get',
        url: `${validatedEndpoint}/products/${productId}/pickups`,
        headers,
      }));
    }, { concurrency: CONCURRENCY });
    
    availability = await Promise.map(availability,
      async (avails, ix) => {
        return await Promise.map(avails,
          async avail => {            
            const pickupPoints = pickupPointsByProduct[ix];
            
            // Map all possible field variations from Rezdy API response
            // First, ensure we have the basic fields from the API response
            // Status: If not provided, infer from seatsAvailable (if seatsAvailable > 0, consider it AVAILABLE)
            let status = avail.status || avail.availabilityStatus || avail.availability?.status;
            const seatsAvailable = this.calculateSeatsAvailable(avail);
            if (!status) {
              // If seats are available, assume it's AVAILABLE; otherwise, we can't determine
              status = seatsAvailable > 0 ? STATUS_AVAILABLE : null;
            }
            
            const startTimeLocal = avail.startTimeLocal || avail.startTime || avail.start;
            const endTimeLocal = avail.endTimeLocal || avail.endTime || avail.end;
            const allDay = avail.allDay !== undefined ? avail.allDay : (avail.allDayEvent || false);
            const priceOptions = avail.priceOptions || avail.prices || avail.pricingOptions || [];

            if (!startTimeLocal || !status) {
              return null;
            }
            
            // Validate status is one of the expected values
            if (status !== STATUS_AVAILABLE && status !== STATUS_FREESALE) {
              return null;
            }
            
            const rootValue = {
              ...avail, // Spread original avail object first to preserve all fields
              pickupPoints,
              unitsWithQuantity: units[ix],
              // Override with normalized field names that resolvers expect
              status,
              startTimeLocal,
              endTimeLocal,
              allDay,
              seatsAvailable,
              priceOptions: Array.isArray(priceOptions) ? priceOptions : [],
            };

            const result = await translateAvailability({
              typeDefs: availTypeDefs,
              query: availQuery,
              rootValue,
              variableValues: {
                productId: productIds[ix],
                optionId: optionIds[ix],
                currency,
                unitsWithQuantity: units[ix],
                jwtKey: this.jwtKey,
              },
            });
            
            return result;
        });
      },
    );
    // Ensure clean structure: filter out null/undefined items and empty arrays
    // Combine map and filter operations for better performance
    availability = availability
      .map(avails => {
        if (!Array.isArray(avails)) return [];
        return avails.filter(avail => avail !== null && avail !== undefined);
      })
      .filter(avails => Array.isArray(avails) && avails.length > 0);
    return { availability };
  }

  /**
   * Creates a booking from an availability key
   * @param {Object} params - Booking creation parameters
   * @param {Object} params.token - Token object with endpoint, apiKey, and optional resellerId
   * @param {Object} params.payload - Booking payload with availabilityKey, holder, etc.
   * @param {Object} params.typeDefsAndQueries - GraphQL type definitions and query
   * @returns {Promise<Object>} Object with booking result
   */
  async createBooking({
    token: {
      endpoint,
      apiKey,
      resellerId,
    },
    payload: {
      availabilityKey,
      holder,
      notes,
      reference,
      // settlementMethod,
      pickupPoint,
      participants,
      payments,
      createdBy,
    },
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(availabilityKey, 'an availability code is required !');
    assert(R.path(['name'], holder), "a holder's first name is required");
    assert(R.path(['surname'], holder), "a holder's surname is required");
    const validatedEndpoint = this.validateEndpoint(endpoint);
    const headers = getHeaders({
      apiKey,
    });
    const urlForCreateBooking = `${validatedEndpoint}/bookings`;
    const dataFromAvailKey = await jwt.verify(availabilityKey, this.jwtKey);
    
    // Build the booking payload matching Rezdy API format
    const bookingData = {
      // Comments (internal notes, not visible to customers)
      ...(notes ? { comments: notes } : {}),
      // Customer information
      customer: {
        firstName: holder.name,
        lastName: holder.surname,
        // Skip email if value is 'collect' (case-insensitive) - used for special cases
        ...(String(R.path(['emailAddress'], holder) || '').toLowerCase() !== SKIP_EMAIL_VALUE
          ? { email: R.path(['emailAddress'], holder) }
          : {}),
        phone: R.pathOr('', ['phoneNumber'], holder),
      },
      // Created by (if provided)
      ...(createdBy ? { createdBy } : {}),
      // Items from availability key
      items: (dataFromAvailKey.items || []).map(item => {
        // Ensure quantities have both optionLabel and value
        const quantities = (item.quantities || []).map(qty => {
          // If quantity already has optionLabel and value, use it as-is
          if (qty.optionLabel && qty.value !== undefined) {
            return {
              optionLabel: qty.optionLabel,
              value: qty.value,
            };
          }
          // If it's just a value, try to get optionLabel from the original structure
          // This shouldn't happen if JWT is created correctly, but handle it anyway
          return {
            optionLabel: qty.optionLabel || qty.label || 'Quantity',
            value: qty.value !== undefined ? qty.value : qty.quantity || 1,
          };
        });
        
        const itemData = {
          productCode: item.productCode,
          startTimeLocal: item.startTimeLocal,
          quantities,
        };
        // Add participants if provided (should match quantity)
        // If participants are provided, use them; otherwise, create from holder
        const totalQuantity = quantities.reduce((sum, qty) => sum + (qty.value || qty.quantity || 0), 0);
        const participantTarget = Math.max(totalQuantity, 1);
        const defaultParticipant = {
          firstName: holder.name,
          lastName: holder.surname,
        };

        let participantsToAdd = participants;
        if (!participantsToAdd || !Array.isArray(participantsToAdd) || participantsToAdd.length === 0) {
          // If no participants provided, create one per quantity
          participantsToAdd = Array.from({ length: participantTarget }, () => ({ ...defaultParticipant }));
        } else if (participantsToAdd.length < participantTarget) {
          // If fewer participants provided than quantities, pad with holder
          const padding = Array.from(
            { length: participantTarget - participantsToAdd.length },
            () => ({ ...defaultParticipant }),
          );
          participantsToAdd = participantsToAdd.concat(padding);
        }
        
        if (participantsToAdd && Array.isArray(participantsToAdd) && participantsToAdd.length > 0) {
          itemData.participants = participantsToAdd.map(participant => {
            // If participant is an object with fields, use it directly
            if (participant.fields && Array.isArray(participant.fields)) {
              return { fields: participant.fields };
            }
            // Otherwise, build fields from participant object
            const fields = [];
            if (participant.firstName || participant.name) {
              fields.push({
                label: 'First Name',
                value: participant.firstName || participant.name,
              });
            }
            if (participant.lastName || participant.surname) {
              fields.push({
                label: 'Last Name',
                value: participant.lastName || participant.surname,
              });
            }
            // Add any other fields
            if (participant.fields) {
              fields.push(...participant.fields);
            }
            return { fields };
          });
        }
        // Add pickup location if provided
        if (pickupPoint) {
          itemData.pickupLocation = {
            locationName: pickupPoint,
          };
        }
        return itemData;
      }),
      // Payments - ensure proper format matching Rezdy API
      payments: (() => {
        // If payments are provided, format them correctly
        if (payments && Array.isArray(payments) && payments.length > 0) {
          return payments.map(payment => {
            // Validate and normalize payment amount
            let amount = payment.amount || 0;
            if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
              if (process.env.debug) {
                console.warn('Invalid payment amount detected, setting to 0:', payment.amount);
              }
              amount = 0;
            }
            
            // Ensure payment has all required fields in correct format
            return {
              amount,
              type: payment.type || PAYMENT_TYPE_CASH,
              recipient: payment.recipient || PAYMENT_RECIPIENT_SUPPLIER,
              label: payment.label || 'Payment',
            };
          });
        }
        // If no payments provided, add a default payment
        // Note: Rezdy API requires at least one payment
        // Use totalAmount from availability key if available
        let totalAmount = dataFromAvailKey.totalAmount || 0;
        
        // Validate totalAmount is a valid number
        if (typeof totalAmount !== 'number' || isNaN(totalAmount) || totalAmount < 0) {
          if (process.env.debug) {
            console.warn('Invalid totalAmount from availability key, setting to 0:', dataFromAvailKey.totalAmount);
          }
          totalAmount = 0;
        }
        
        // Always include amount field (required by Rezdy API), even if 0
        return [{
          amount: totalAmount,
          type: PAYMENT_TYPE_CASH,
          recipient: PAYMENT_RECIPIENT_SUPPLIER,
          label: 'Payment for booking',
        }];
      })(),
      // Reseller reference if provided
      ...(reference ? { resellerReference: reference } : {}),
      // Reseller ID if provided
      ...(resellerId ? { resellerId } : {}),
    };
    
    let booking = R.path(['data'], await this.axios({
      method: 'post',
      url: urlForCreateBooking,
      data: bookingData,
      headers,
    }));
    return ({
      booking: await translateBooking({
        rootValue: booking,
        typeDefs: bookingTypeDefs,
        query: bookingQuery,
      })
    });
  }

  /**
   * Cancels a booking
   * @param {Object} params - Cancellation parameters
   * @param {Object} params.token - Token object with endpoint and apiKey
   * @param {Object} params.payload - Payload with bookingId or id
   * @param {Object} params.typeDefsAndQueries - GraphQL type definitions and query
   * @returns {Promise<Object>} Object with cancellation result
   */
  async cancelBooking({
    token: {
      endpoint,
      apiKey,
    },
    payload: {
      bookingId,
      id,
    },
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(!isNilOrEmpty(bookingId) || !isNilOrEmpty(id), 'Invalid booking id');
    const validatedEndpoint = this.validateEndpoint(endpoint);
    const headers = getHeaders({
      apiKey,
    });
    const url = `${validatedEndpoint}/bookings/${bookingId || id}/cancel`;
    const booking = R.path(['data'], await this.axios({
      method: 'delete',
      url,
      headers,
    }));
    return ({
      cancellation: await translateBooking({
        rootValue: booking,
        typeDefs: bookingTypeDefs,
        query: bookingQuery,
      })
    });
  }

  /**
   * Searches for bookings by ID or date range
   * @param {Object} params - Search parameters
   * @param {Object} params.token - Token object with endpoint and apiKey
   * @param {Object} params.payload - Search payload with bookingId or date range
   * @param {Object} params.typeDefsAndQueries - GraphQL type definitions and query
   * @returns {Promise<Object>} Object with bookings array
   */
  async searchBooking({
    token: {
      endpoint,
      apiKey,
    },
    payload: {
      bookingId,
      travelDateStart,
      travelDateEnd,
      dateFormat,
    },
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(
      !isNilOrEmpty(bookingId)
      || !(
        isNilOrEmpty(travelDateStart) && isNilOrEmpty(travelDateEnd) && isNilOrEmpty(dateFormat)
      ),
      'at least one parameter is required',
    );
    const validatedEndpoint = this.validateEndpoint(endpoint);
    const headers = getHeaders({
      apiKey,
    });
    let hadNonNotFoundError = false;
    const searchByUrl = async url => {
      try {
        const response = await this.axios({
          method: 'get',
          url,
          headers,
        });
        const data = R.path(['data'], response);
        // Check if the response has requestStatus with success: false
        // This is a valid response from Rezdy API, not an error
        if (data && data.requestStatus && !data.requestStatus.success) {
          // Error code 24 means "No order found" - this is expected when trying multiple search methods
          // Return null to indicate no results found
          return null;
        }
        // Handle different response structures:
        // - Direct booking lookup: returns single booking object
        // - Search endpoints: returns { bookings: [...] }
        // - Some endpoints might return the booking directly in data
        if (data.bookings) {
          return data.bookings;
        }
        // If it's a single booking object (has orderNumber), return as array
        if (data.orderNumber) {
          return [data];
        }
        // Otherwise return the data as-is (might be an array or object)
        return Array.isArray(data) ? data : (data ? [data] : []);
      } catch (err) {
        // Handle errors gracefully - return null for "not found" scenarios
        const errorCode = R.path(['response', 'data', 'requestStatus', 'error', 'errorCode'], err);
        if (errorCode === ERROR_CODE_NO_ORDER_FOUND) {
          return null; // "No order found" is expected when trying multiple search methods
        }
        hadNonNotFoundError = true;
        if (process.env.debug) {
          console.log('searchBooking API error', {
            url,
            errorCode,
            message: err.message,
          });
        }
        // For other errors, return null as well to allow other search methods to try
        return null;
      }
    };
    const bookings = await (async () => {
      let url;
      if (!isNilOrEmpty(bookingId)) {
        const results = await Promise.all([
          searchByUrl(`${validatedEndpoint}/bookings/${bookingId}`),
          searchByUrl(`${validatedEndpoint}/bookings?resellerReference=${bookingId}`),
          searchByUrl(`${validatedEndpoint}/bookings?search=${bookingId}`),
        ]);
        // Filter out null values and flatten arrays, then deduplicate by orderNumber
        const allBookings = results.filter(Boolean).reduce((acc, result) => {
          if (Array.isArray(result)) {
            return acc.concat(result);
          }
          return acc.concat([result]);
        }, []);
        // Deduplicate by orderNumber to avoid returning same booking multiple times
        const seen = new Set();
        return allBookings.filter(booking => {
          const orderNumber = booking?.orderNumber || booking?.id;
          // Filter out bookings without identifiers
          if (!orderNumber) {
            return false;
          }
          // Filter out duplicates
          if (seen.has(orderNumber)) {
            return false;
          }
          seen.add(orderNumber);
          return true;
        });
      }
      if (!isNilOrEmpty(travelDateStart)) {
        const localDateStart = moment(travelDateStart, dateFormat).format('YYYY-MM-DD');
        const localDateEnd = moment(travelDateEnd, dateFormat).format('YYYY-MM-DD');
        url = `${validatedEndpoint}/bookings?minTourStartTime=${encodeURIComponent(localDateStart)}&maxTourStartTime=${encodeURIComponent(localDateEnd)}`;
        try {
          const response = await this.axios({
            method: 'get',
            url,
            headers,
          });
          const data = R.path(['data'], response);
          // Check if the response has requestStatus with success: false
          if (data && data.requestStatus && !data.requestStatus.success) {
            return [];
          }
          return R.pathOr([], ['bookings'], data);
        } catch (err) {
          // Handle error responses gracefully
          if (err.response && err.response.data && err.response.data.requestStatus) {
            const errorCode = R.path(['response', 'data', 'requestStatus', 'error', 'errorCode'], err);
            if (errorCode === ERROR_CODE_NO_ORDER_FOUND) {
              return []; // "No order found" - return empty array
            }
          }
          throw err;
        }
      }
      return [];
    })();
    if ((!bookings || bookings.length === 0) && hadNonNotFoundError) {
      throw new Error('Search booking failed due to API errors');
    }
    return ({
      bookings: await Promise.map(Array.isArray(bookings) ? bookings : [bookings], async booking => {
        if (!booking) return null;
        return translateBooking({
          rootValue: booking,
          typeDefs: bookingTypeDefs,
          query: bookingQuery,
        });
      }).then(results => results.filter(Boolean))
    });
  }
}

module.exports = Plugin;
