const axiosRaw = require('axios');
const curlirize = require('axios-curlirize');
const R = require('ramda');
const Promise = require('bluebird');
const assert = require('assert');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const wildcardMatch = require('./utils/wildcardMatch');
const { DEFAULT_EXCLUDED_CUSTOMER_QUESTION_IDS } = require('./utils/customerFieldConstants');
const {
  CORE_CREATE_BOOKING_FIELD_IDS_BY_LABEL,
  resolveBookingFieldValue,
  buildBookingFields,
  toCreateBookingFieldModel,
  filterFieldRowsForBookingLevelMerge,
  filterFieldRowsForParticipantLevelMerge,
  mergeFieldsWithExplicitValues,
  mergeHolderWithCustomFieldValues,
  decorateCountryFields,
  decorateGenderField,
} = require('./utils/bookingFields');
const { getIso31661Alpha2Countries } = require('./utils/country');
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
// Default participant fields when product booking fields are unavailable
const DEFAULT_PARTICIPANT_BOOKING_FIELDS = [
  {
    label: 'First Name',
    visiblePerParticipant: false,
    requiredPerParticipant: false,
  },
  {
    label: 'Last Name',
    visiblePerParticipant: false,
    requiredPerParticipant: false,
  },
];

if (process.env.debug) {
  curlirize(axiosRaw);
}

const isNilOrEmpty = R.either(R.isNil, R.isEmpty);

/**
 * Validates if a string is a valid URL
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
 * Validate and normalize endpoint URL.
 * @param {string} endpoint - Endpoint URL to validate
 * @param {string} [fallback] - Fallback endpoint when none provided
 * @returns {string} Validated endpoint or default
 * @throws {Error} If endpoint is provided but invalid
 */
const validateEndpoint = (endpoint, fallback) => {
  if (!endpoint) {
    return fallback || DEFAULT_ENDPOINT;
  }
  if (!isValidUrl(endpoint)) {
    throw new Error(`Invalid endpoint URL: ${endpoint}`);
  }
  return endpoint;
};

/**
 * Builds the standard set of Rezdy API headers.
 */
const getHeaders = ({ apiKey }) => ({
  apiKey,
  'Content-Type': 'application/json',
});

/**
 * Safely extracts request information from axios request config
 * Sanitizes sensitive data like API keys from headers
 */
const axiosSafeRequest = (request) => {
  const safe = R.pick(['method', 'url', 'data'], request);
  if (request.headers) {
    safe.headers = R.omit(['apiKey', 'apikey', 'authorization', 'Authorization'], request.headers);
  }
  return safe;
};

/**
 * Safely extracts response information from axios response
 */
const axiosSafeResponse = (response) => {
  const retVal = R.pick(['data', 'status', 'statusText', 'headers', 'request'], response);
  retVal.request = axiosSafeRequest(retVal.request);
  return retVal;
};

const stripTravelerPrefix = (label) => {
  const raw = String(label || '').trim();
  if (!raw) return '';
  return raw.replace(/^[A-Za-z]+\s+\d+:\s*/i, '').trim();
};

const normalizeParticipantFieldRows = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return null;
    if (row.id || row.label) {
      return {
        ...(row.id ? { id: String(row.id) } : {}),
        ...(row.label ? { label: stripTravelerPrefix(row.label) || String(row.label) } : {}),
        value: row.value !== undefined && row.value !== null ? String(row.value) : '',
      };
    }
    const nestedField = R.path(['field'], row);
    if (!nestedField || typeof nestedField !== 'object') return null;
    const id = nestedField.id != null && nestedField.id !== '' ? String(nestedField.id) : null;
    const rawLabel = nestedField.label || nestedField.title;
    const label = rawLabel ? stripTravelerPrefix(rawLabel) : null;
    if (!id && !label) return null;
    return {
      ...(id ? { id } : {}),
      ...(label ? { label: String(label) } : {}),
      value: row.value !== undefined && row.value !== null ? String(row.value) : '',
    };
  }).filter(Boolean);
};

const normalizeParticipantData = (participant) => {
  const participantData = participant && typeof participant === 'object' ? participant : {};
  const participantFieldRows = Array.isArray(participantData.fields) ? participantData.fields : [];
  const participantCustomFieldRows = Array.isArray(participantData.customFieldValues)
    ? participantData.customFieldValues
    : [];
  const normalizedFields = normalizeParticipantFieldRows(
    participantFieldRows.concat(participantCustomFieldRows),
  );
  const valueById = normalizedFields.reduce((acc, row) => ({
    ...acc,
    ...(row.id ? { [row.id]: row.value } : {}),
  }), {});
  return {
    ...participantData,
    fields: normalizedFields,
    firstName: participantData.firstName || valueById.firstName || participantData.name,
    lastName: participantData.lastName || valueById.lastName || participantData.surname,
  };
};

/**
 * Extracts the single product object from a Rezdy /products/:id response.
 * Rezdy returns either { products: [obj] }, { products: obj }, or { product: obj }.
 */
const extractSingleProduct = (responseData) => {
  if (!responseData || typeof responseData !== 'object') return null;
  if (Array.isArray(responseData.products)) return responseData.products[0] || null;
  if (responseData.products && typeof responseData.products === 'object') return responseData.products;
  if (responseData.product && typeof responseData.product === 'object') return responseData.product;
  return null;
};

/**
 * Calculates seats available from availability object.
 * Handles multiple field name variations and ensures numeric return.
 */
const calculateSeatsAvailable = (avail) => {
  if (!avail) return 0;
  const seats = avail.seatsAvailable !== undefined ? avail.seatsAvailable
    : (avail.available !== undefined ? avail.available
      : (avail.vacancies !== undefined ? avail.vacancies
        : (avail.availableSeats !== undefined ? avail.availableSeats
          : (avail.remainingSeats !== undefined ? avail.remainingSeats : 0))));
  return Number(seats) || 0;
};

/**
 * Extract availability data from Rezdy API response.
 * Handles multiple response structures (direct array, wrapped, requestStatus, single object).
 */
const extractAvailabilityData = (data, productId) => {
  if (!data) return [];

  if (data.requestStatus) {
    if (data.requestStatus.success === false) {
      if (process.env.debug) {
        console.log(`API error for product ${productId}:`, data.requestStatus);
      }
      return [];
    }
    if (Array.isArray(data.sessions)) return data.sessions;
    if (Array.isArray(data.availability)) return data.availability;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.items)) return data.items;
  }

  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.availability)) return data.availability;
  if (data && Array.isArray(data.sessions)) return data.sessions;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && typeof data === 'object' && !data.requestStatus) {
    return [data];
  }

  if (process.env.debug) {
    console.log(`Unexpected response structure for product ${productId}:`, JSON.stringify(data, null, 2));
  }
  return [];
};

/**
 * Normalize the per-product list of optionIds. Mirrors ti2-rezdy's
 * `normaliseOptionIds`: callers may pass an empty array, a single option
 * (broadcast to every product), or one option per product. Throws when
 * counts don't match — preserves the existing
 * `mismatched productIds/options length` error.
 */
const normaliseOptionIds = (productIds, optionIds = []) => {
  if (!Array.isArray(productIds) || productIds.length === 0) return [];

  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    return productIds.map(() => null);
  }

  if (optionIds.length === 1 && productIds.length > 1) {
    return productIds.map(() => optionIds[0]);
  }

  if (optionIds.length !== productIds.length) {
    throw new Error('mismatched productIds/options length');
  }

  return optionIds;
};

/**
 * Normalize the per-product list of unit configs. Mirrors ti2-rezdy's
 * `normaliseUnits`. Preserves the existing
 * `mismatched options/units length` error message.
 */
const normaliseUnits = (productIds, units = []) => {
  if (!Array.isArray(productIds) || productIds.length === 0) return [];

  if (!Array.isArray(units) || units.length === 0) {
    return productIds.map(() => []);
  }

  if (!Array.isArray(units[0])) {
    return productIds.map(() => units);
  }

  if (units.length !== productIds.length) {
    throw new Error('mismatched options/units length');
  }

  return units;
};

/**
 * Normalise a single Rezdy availability/session object into the shape
 * the GraphQL availability resolvers expect. Returns null if the slot
 * should be filtered out (missing start time, or status that is not one
 * of AVAILABLE/FREESALE).
 */
const buildAvailabilityRoot = ({ avail, pickupPoints, units }) => {
  let status = avail.status || avail.availabilityStatus || avail.availability?.status;
  const seatsAvailable = calculateSeatsAvailable(avail);
  if (!status) {
    status = seatsAvailable > 0 ? STATUS_AVAILABLE : null;
  }

  const startTimeLocal = avail.startTimeLocal || avail.startTime || avail.start;
  const endTimeLocal = avail.endTimeLocal || avail.endTime || avail.end;
  const allDay = avail.allDay !== undefined ? avail.allDay : (avail.allDayEvent || false);
  const priceOptions = avail.priceOptions || avail.prices || avail.pricingOptions || [];

  if (!startTimeLocal || !status) return null;
  if (status !== STATUS_AVAILABLE && status !== STATUS_FREESALE) return null;

  return {
    ...avail,
    pickupPoints,
    unitsWithQuantity: units,
    status,
    startTimeLocal,
    endTimeLocal,
    allDay,
    seatsAvailable,
    priceOptions: Array.isArray(priceOptions) ? priceOptions : [],
  };
};

/**
 * Fetch pickup locations for a single product. Errors are swallowed and
 * an empty array returned (pickup data is optional).
 */
const fetchPickupPointsForProduct = async ({
  axios,
  validatedEndpoint,
  headers,
  productId,
}) => {
  try {
    const response = await axios({
      method: 'get',
      url: `${validatedEndpoint}/products/${encodeURIComponent(productId)}/pickups`,
      headers,
    });
    return R.pathOr([], ['data', 'pickupLocations'], response);
  } catch (err) {
    if (process.env.debug) {
      console.warn(`Unable to fetch pickup points for product ${productId}`, err.message || err);
    }
    return [];
  }
};

/**
 * Fetch product bookingFields keyed by productCode.
 * Deduplicates productCodes and runs lookups in parallel.
 * Best-effort: missing/failed products map to [].
 */
const fetchBookingFieldsByProductCode = async ({
  axios,
  validatedEndpoint,
  headers,
  productCodes,
}) => {
  const unique = Array.from(new Set((productCodes || []).filter(Boolean)));
  const result = {};

  await Promise.map(unique, async (productCode) => {
    try {
      const response = await axios({
        method: 'get',
        url: `${validatedEndpoint}/products/${encodeURIComponent(productCode)}`,
        headers,
      });
      const product = extractSingleProduct(R.path(['data'], response));
      result[productCode] = Array.isArray(R.path(['bookingFields'], product))
        ? product.bookingFields
        : [];
    } catch (err) {
      if (process.env.debug) {
        console.warn(`Unable to fetch bookingFields for product ${productCode}`, err.message || err);
      }
      result[productCode] = [];
    }
  }, { concurrency: CONCURRENCY });

  return result;
};

/**
 * Fetch and translate availability for a single product.
 * Mirrors ti2-rezdy's `fetchAvailabilityForProduct` pattern: the per-product
 * loop body is a pure helper rather than inlined inside `searchAvailability`.
 */
const fetchAvailabilityForProduct = async ({
  axios,
  validatedEndpoint,
  headers,
  productId,
  optionId,
  units,
  localDateStart,
  localDateEnd,
  currency,
  jwtKey,
  availTypeDefs,
  availQuery,
  pickupPoints,
  bookingFields,
}) => {
  const url = `${validatedEndpoint}/availability`
    + `?productCode=${encodeURIComponent(productId)}`
    + `&startTimeLocal=${encodeURIComponent(localDateStart)}`
    + `&endTimeLocal=${encodeURIComponent(localDateEnd)}`;

  const response = await axios({
    method: 'get',
    url,
    headers,
  });

  const availabilities = extractAvailabilityData(response.data, productId);

  const slots = await Promise.map(availabilities, async (avail) => {
    const rootValue = buildAvailabilityRoot({ avail, pickupPoints, units });
    if (!rootValue) return null;

    const result = await translateAvailability({
      typeDefs: availTypeDefs,
      query: availQuery,
      rootValue,
      variableValues: {
        productId,
        optionId,
        currency,
        unitsWithQuantity: units,
        jwtKey,
      },
    });

    return {
      ...result,
      getCreateBookingFields: bookingFields || [],
    };
  });

  return slots.filter(Boolean);
};

/**
 * Common booking translation helper used by createBooking, cancelBooking,
 * and searchBooking. Mirrors ti2-rezdy's `toTranslatedBooking`.
 */
const toTranslatedBooking = ({
  rootValue,
  bookingTypeDefs,
  bookingQuery,
  validatedEndpoint,
}) => translateBooking({
  rootValue,
  typeDefs: bookingTypeDefs,
  query: bookingQuery,
  apiEndpoint: validatedEndpoint,
});

class Plugin {
  /**
   * Plugin constructor
   * @param {Object} params - Plugin configuration parameters
   * @param {string} [params.endpoint] - Rezdy API endpoint (defaults to production)
   */
  constructor(params) {
    Object.entries(params).forEach(([attr, value]) => {
      this[attr] = value;
    });
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
          // Error code '24' means "No order found" - expected in search scenarios
          if (errorCode === ERROR_CODE_NO_ORDER_FOUND) {
            return response;
          }
          const errorMessage = R.path(['data', 'requestStatus', 'error', 'errorMessage'], response);
          const error = new Error(errorMessage || 'API request failed');
          error.response = response;
          error.errorCode = errorCode;
          throw error;
        }
        return response;
      } catch (err) {
        const errMsg = R.omit(['config'], err.toJSON ? err.toJSON() : {});
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
        const rezdyErrorMessage = R.path(['response', 'data', 'requestStatus', 'error', 'errorMessage'], err);
        if (rezdyErrorMessage) {
          const apiError = new Error(rezdyErrorMessage);
          apiError.errorCode = errorCode;
          apiError.response = err.response;
          throw apiError;
        }
        throw R.pathOr(err, ['response', 'data', 'details'], err);
      }
    };
    this.tokenTemplate = () => ({
      apiKey: {
        type: 'text',
        regExp: /^[a-fA-F0-9]+$/,
        description: 'the API Key provided from Rezdy, should be in uuid format',
      },
      agentCode: {
        type: 'text',
        regExp: /^[a-zA-Z0-9]+$/,
        description: 'the Agent Code provided by Rezdy, should be an alphanumeric string',
        example: 'WONDERFULGLOBALTRAVEL',
      },
    });
  }

  /**
   * Validate and normalise endpoint URL. Thin wrapper around the
   * module-level `validateEndpoint` so the instance fallback (`this.endpoint`)
   * is always honoured. Kept on the class for back-compat with unit tests.
   */
  validateEndpoint(endpoint) {
    return validateEndpoint(endpoint, this.endpoint || DEFAULT_ENDPOINT);
  }

  /**
   * Backwards-compat instance method delegating to the pure helper.
   */
  calculateSeatsAvailable(avail) {
    return calculateSeatsAvailable(avail);
  }

  /**
   * Backwards-compat instance method delegating to the pure helper.
   */
  extractAvailabilityData(data, productId) {
    return extractAvailabilityData(data, productId);
  }

  /**
   * Validates API token by checking if products can be retrieved
   */
  async validateToken({
    token: {
      endpoint,
      apiKey,
    },
  }) {
    const validatedEndpoint = this.validateEndpoint(endpoint);
    const url = `${validatedEndpoint}/products`;
    const headers = getHeaders({ apiKey });
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
    const headers = getHeaders({ apiKey });
    let results = R.pathOr([], ['data', 'products'], await this.axios({
      method: 'get',
      url,
      headers,
    }));
    if (!Array.isArray(results)) results = [results];

    let products = await Promise.map(results, async product => {
      const translated = await translateProduct({
        rootValue: product,
        typeDefs: productTypeDefs,
        query: productQuery,
      });
      return {
        ...translated,
        getCreateBookingFields: Array.isArray(R.path(['bookingFields'], product)) ? product.bookingFields : [],
      };
    });

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
   * Searches for quote (not implemented - Rezdy API doesn't expose a quote endpoint)
   */
  async searchQuote() {
    return { quote: [] };
  }

  /**
   * Searches for availability for given products.
   * Mirrors ti2-rezdy's structure: thin orchestration that fans out per
   * product to `fetchAvailabilityForProduct`.
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
    assert(Array.isArray(productIds) && productIds.length > 0, 'productIds are required');
    assert(productIds.every(Boolean), 'some invalid productId(s)');

    const normalisedOptionIds = normaliseOptionIds(productIds, optionIds);
    const normalisedUnits = normaliseUnits(productIds, units);

    if (Array.isArray(optionIds) && optionIds.length > 0) {
      assert(optionIds.every(Boolean), 'some invalid optionId(s)');
    }

    const validatedEndpoint = this.validateEndpoint(endpoint);
    const localDateStart = moment(startDate, dateFormat).format('YYYY-MM-DD HH:mm:ss');
    const localDateEnd = moment(endDate, dateFormat).format('YYYY-MM-DD 23:59:59');
    const headers = getHeaders({ apiKey });

    // Fetch pickup points and product bookingFields in parallel — both feed
    // into per-product availability translation below.
    const [pickupPointsByProduct, bookingFieldsByProductCode] = await Promise.all([
      Promise.map(productIds, async (productId) => fetchPickupPointsForProduct({
        axios: this.axios,
        validatedEndpoint,
        headers,
        productId,
      }), { concurrency: CONCURRENCY }),
      fetchBookingFieldsByProductCode({
        axios: this.axios,
        validatedEndpoint,
        headers,
        productCodes: productIds,
      }),
    ]);

    const availabilityByProduct = await Promise.map(productIds, async (productId, ix) => (
      fetchAvailabilityForProduct({
        axios: this.axios,
        validatedEndpoint,
        headers,
        productId,
        optionId: normalisedOptionIds[ix],
        units: normalisedUnits[ix] || [],
        localDateStart,
        localDateEnd,
        currency,
        jwtKey: this.jwtKey,
        availTypeDefs,
        availQuery,
        pickupPoints: pickupPointsByProduct[ix] || [],
        bookingFields: bookingFieldsByProductCode[productId] || [],
      })
    ), { concurrency: CONCURRENCY });

    // Drop products with no surviving slots so the response shape matches
    // the pre-refactor behaviour (empty product groups removed).
    const availability = availabilityByProduct.filter(slots => Array.isArray(slots) && slots.length > 0);

    return {
      availability,
      getCreateBookingFields: bookingFieldsByProductCode[productIds[0]] || [],
    };
  }

  /**
   * Gets availability calendar for given products.
   * Mirrors ti2-rezdy: simply delegates to `searchAvailability` since both
   * endpoints share identical request/response semantics in this plugin.
   */
  async availabilityCalendar(args) {
    return this.searchAvailability(args);
  }

  /**
   * Searches for pickup points for a given product.
   * Added for parity with ti2-rezdy's `searchPickupPoints`.
   */
  async searchPickupPoints({
    token: {
      endpoint,
      apiKey,
    },
    payload: { productId },
    typeDefsAndQueries: { pickupTypeDefs, pickupQuery } = {},
  }) {
    assert(productId, 'productId is required');
    const validatedEndpoint = this.validateEndpoint(endpoint);
    const headers = getHeaders({ apiKey });

    const pickupPoints = await fetchPickupPointsForProduct({
      axios: this.axios,
      validatedEndpoint,
      headers,
      productId,
    });

    // If a graphql schema/query is supplied, translate each point. Otherwise
    // return the raw Rezdy pickup-location records.
    let translatePickupPoint;
    if (pickupTypeDefs && pickupQuery) {
      try {
        // eslint-disable-next-line global-require
        ({ translatePickupPoint } = require('./resolvers/pickup-point'));
      } catch (_) {
        translatePickupPoint = null;
      }
    }

    if (typeof translatePickupPoint === 'function') {
      const translatedPoints = await Promise.map(pickupPoints, async (point) => (
        translatePickupPoint({
          rootValue: point,
          typeDefs: pickupTypeDefs,
          query: pickupQuery,
        })
      ), { concurrency: CONCURRENCY });
      return { pickupPoints: translatedPoints };
    }

    return { pickupPoints };
  }

  async getCreateBookingFields({ axios, token, payload = {}, query = {} } = {}) {
    const requestAxios = axios || this.axios;
    const requestData = Object.keys(query).length > 0 ? query : payload;
    const { productId } = requestData;

    assert(requestAxios, 'axios is required');
    assert(token, 'token is required');
    assert(productId, 'productId is required');

    const validatedEndpoint = this.validateEndpoint(R.path(['endpoint'], token));
    const headers = getHeaders({ apiKey: R.path(['apiKey'], token) });

    const bookingFieldsByProductCode = await fetchBookingFieldsByProductCode({
      axios: requestAxios,
      validatedEndpoint,
      headers,
      productCodes: [productId],
    });
    const bookingFields = bookingFieldsByProductCode[productId] || [];
    const defaultCoreTypeById = {
      firstName: 'short',
      lastName: 'short',
      emailAddress: 'short',
      phoneNumber: 'short',
      country: 'short',
      postCode: 'short',
    };
    const mappedFields = bookingFields
      .map(toCreateBookingFieldModel)
      .filter(Boolean)
      .map((field) => {
        if (!field || field.type !== 'extended-option') return field;
        const defaultType = defaultCoreTypeById[field.id];
        const hasUsableOptions = Array.isArray(field.options) && field.options.length > 0;
        if (!defaultType || hasUsableOptions) return field;
        return { ...field, type: defaultType };
      });
    const fieldswithGender = decorateGenderField(mappedFields);
    const countryOptions = getIso31661Alpha2Countries();
    const fieldsWithCountry = decorateCountryFields(fieldswithGender, countryOptions);
    const fields = fieldsWithCountry.map((field) => {
      if (field && field.id === 'country') {
        return { ...field, type: 'short' };
      }
      return field;
    });

    const excludedCustomerFieldIds = new Set(
      (Array.isArray(DEFAULT_EXCLUDED_CUSTOMER_QUESTION_IDS) ? DEFAULT_EXCLUDED_CUSTOMER_QUESTION_IDS : [])
        .map(id => String(id || '').trim())
        .filter(Boolean),
    );

    const additionalCustomerFields = fields
      .filter(field => field && field.visiblePerBooking)
      .filter(field => !excludedCustomerFieldIds.has(String(field.id || '').trim()))
      .map(field => ({ ...field, required: Boolean(field.requiredPerBooking), isCustomerField: true }));
    const additionalCustomerFieldsById = additionalCustomerFields.reduce((acc, field) => ({
      ...acc,
      [field.id]: field,
    }), {});
    const decoratedFields = fields.map(field => additionalCustomerFieldsById[field.id] || field);

    const normalizedCoreIds = new Set(Object.values(CORE_CREATE_BOOKING_FIELD_IDS_BY_LABEL));
    const customFields = decoratedFields
      .filter(field => field && !normalizedCoreIds.has(field.id))
      .filter(field => !(field && field.visiblePerBooking));
    return { fields: decoratedFields, customFields, additionalCustomerFields };
  }

  /**
   * Creates a booking from an availability key
   */
  async createBooking({
    token: {
      endpoint,
      apiKey,
      agentCode,
    },
    payload: {
      availabilityKey,
      holder,
      notes,
      reference,
      pickupPoint,
      participants,
      payments,
      createdBy,
      customFieldValues,
      integrationIsDirectBooking = false,
    },
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(availabilityKey, 'an availability code is required !');
    assert(R.path(['name'], holder), "a holder's first name is required");
    assert(R.path(['surname'], holder), "a holder's surname is required");
    if (!integrationIsDirectBooking) {
      assert(agentCode, 'an agent code is required');
    }

    const effectiveHolder = mergeHolderWithCustomFieldValues(holder, customFieldValues);
    const validatedEndpoint = this.validateEndpoint(endpoint);
    const headers = getHeaders({ apiKey });
    const urlForCreateBooking = `${validatedEndpoint}/bookings`;

    const dataFromAvailKey = await jwt.verify(availabilityKey, this.jwtKey);
    const availabilityItems = dataFromAvailKey.items || [];
    const productCodes = availabilityItems
      .map(item => R.path(['productCode'], item))
      .filter(Boolean);

    const bookingFieldsByProductCode = await fetchBookingFieldsByProductCode({
      axios: this.axios,
      validatedEndpoint,
      headers,
      productCodes,
    });

    const allBookingFields = Object.values(bookingFieldsByProductCode).flat();
    const bookingLevelFields = mergeFieldsWithExplicitValues({
      generatedFields: buildBookingFields({
        fieldDefinitions: allBookingFields,
        sources: [effectiveHolder],
        visibleKey: 'visiblePerBooking',
        requiredKey: 'requiredPerBooking',
      }),
      explicitFields: filterFieldRowsForBookingLevelMerge(
        Array.isArray(effectiveHolder.fields) ? effectiveHolder.fields : undefined,
        allBookingFields,
      ),
      fieldDefinitions: allBookingFields,
    });
    const holderEmail = resolveBookingFieldValue({
      label: 'Email',
      sources: [effectiveHolder],
    });
    const holderPhone = resolveBookingFieldValue({
      label: 'Mobile',
      sources: [effectiveHolder],
    });

    // Build the booking payload matching Rezdy API format
    const bookingData = {
      // Comments (internal notes, not visible to customers)
      ...(notes ? { comments: notes } : {}),
      customer: {
        firstName: holder.name,
        lastName: holder.surname,
        // Skip email if value is 'collect' (case-insensitive) - special-case
        // signal to Rezdy that the email will be collected later.
        ...(String(holderEmail || '').toLowerCase() !== SKIP_EMAIL_VALUE
          ? { email: holderEmail }
          : {}),
        phone: holderPhone || '',
      },
      ...(bookingLevelFields.length > 0 ? { fields: bookingLevelFields } : {}),
      ...(createdBy ? { createdBy } : {}),
      items: availabilityItems.map(item => {
        // Ensure quantities have both optionLabel and value
        const quantities = (item.quantities || []).map(qty => {
          if (qty.optionLabel && qty.value !== undefined) {
            return {
              optionLabel: qty.optionLabel,
              value: qty.value,
            };
          }
          // Defensive fallback when JWT contained an older shape.
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
        const productBookingFields = bookingFieldsByProductCode[item.productCode] || [];
        const participantFieldDefinitions = productBookingFields.length > 0
          ? productBookingFields
          : DEFAULT_PARTICIPANT_BOOKING_FIELDS;
        const totalQuantity = quantities.reduce((sum, qty) => sum + (qty.value || qty.quantity || 0), 0);
        const participantTarget = Math.max(totalQuantity, 1);
        const defaultParticipant = {
          firstName: effectiveHolder.name,
          lastName: effectiveHolder.surname,
        };

        let participantsToAdd = participants;
        if (!participantsToAdd || !Array.isArray(participantsToAdd) || participantsToAdd.length === 0) {
          participantsToAdd = Array.from({ length: participantTarget }, () => ({ ...defaultParticipant }));
        } else if (participantsToAdd.length < participantTarget) {
          const padding = Array.from(
            { length: participantTarget - participantsToAdd.length },
            () => ({ ...defaultParticipant }),
          );
          participantsToAdd = participantsToAdd.concat(padding);
        }
        if (Array.isArray(participantsToAdd) && participantsToAdd.length > participantTarget) {
          throw new Error(
            `participants count (${participantsToAdd.length}) exceeds total quantity (${participantTarget})`,
          );
        }

        if (Array.isArray(participantsToAdd) && participantsToAdd.length > 0) {
          itemData.participants = participantsToAdd.map(participant => {
            const participantData = normalizeParticipantData(participant);
            const generatedFields = buildBookingFields({
              fieldDefinitions: participantFieldDefinitions,
              // Use holder fallback for legacy flows where per-passenger values are
              // provided at booking root (for example customFieldValues).
              sources: [participantData, effectiveHolder],
              visibleKey: 'visiblePerParticipant',
              requiredKey: 'requiredPerParticipant',
            });
            const fields = mergeFieldsWithExplicitValues({
              generatedFields,
              explicitFields: filterFieldRowsForParticipantLevelMerge(
                Array.isArray(participantData.fields) ? participantData.fields : undefined,
                participantFieldDefinitions,
              ),
              fieldDefinitions: participantFieldDefinitions,
            });
            return { fields };
          });
        }
        if (pickupPoint) {
          itemData.pickupLocation = {
            locationName: pickupPoint,
          };
        }
        return itemData;
      }),
      // Payments - normalised to Rezdy's required shape (always >=1 entry).
      payments: (() => {
        if (payments && Array.isArray(payments) && payments.length > 0) {
          return payments.map(payment => {
            let amount = payment.amount || 0;
            if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
              if (process.env.debug) {
                console.warn('Invalid payment amount detected, setting to 0:', payment.amount);
              }
              amount = 0;
            }
            return {
              amount,
              type: payment.type || PAYMENT_TYPE_CASH,
              recipient: payment.recipient || PAYMENT_RECIPIENT_SUPPLIER,
              label: payment.label || 'Payment',
            };
          });
        }
        // Rezdy requires at least one payment line. Use the JWT-supplied
        // total when available so the recorded amount matches the quote.
        let totalAmount = dataFromAvailKey.totalAmount || 0;
        if (typeof totalAmount !== 'number' || isNaN(totalAmount) || totalAmount < 0) {
          if (process.env.debug) {
            console.warn('Invalid totalAmount from availability key, setting to 0:', dataFromAvailKey.totalAmount);
          }
          totalAmount = 0;
        }
        return [{
          amount: totalAmount,
          type: PAYMENT_TYPE_CASH,
          recipient: PAYMENT_RECIPIENT_SUPPLIER,
          label: 'Payment for booking',
        }];
      })(),
      ...(reference ? { resellerReference: reference } : {}),
      // The Rezdy UI surfaces this as "Agent Code" but the API field is
      // `sourceChannel` — keep that mapping explicit here.
      ...(agentCode ? { sourceChannel: agentCode } : {}),
    };

    const booking = R.path(['data'], await this.axios({
      method: 'post',
      url: urlForCreateBooking,
      data: bookingData,
      headers,
    }));

    return {
      booking: await toTranslatedBooking({
        rootValue: booking,
        bookingTypeDefs,
        bookingQuery,
        validatedEndpoint,
      }),
    };
  }

  /**
   * Cancels a booking
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
    const headers = getHeaders({ apiKey });
    const url = `${validatedEndpoint}/bookings/${bookingId || id}/cancel`;
    const booking = R.path(['data'], await this.axios({
      method: 'delete',
      url,
      headers,
    }));
    return {
      cancellation: await toTranslatedBooking({
        rootValue: booking,
        bookingTypeDefs,
        bookingQuery,
        validatedEndpoint,
      }),
    };
  }

  /**
   * Searches for bookings by ID or date range
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
    const headers = getHeaders({ apiKey });

    let hadNonNotFoundError = false;
    const searchByUrl = async url => {
      try {
        const response = await this.axios({
          method: 'get',
          url,
          headers,
        });
        const data = R.path(['data'], response);
        if (data && data.requestStatus && !data.requestStatus.success) {
          // Error code 24 ("No order found") - expected when probing multiple
          // search forms; surface as null so the caller can keep trying.
          return null;
        }
        if (data.bookings) {
          return data.bookings;
        }
        if (data.orderNumber) {
          return [data];
        }
        return Array.isArray(data) ? data : (data ? [data] : []);
      } catch (err) {
        const errorCode = R.path(['response', 'data', 'requestStatus', 'error', 'errorCode'], err);
        if (errorCode === ERROR_CODE_NO_ORDER_FOUND) {
          return null;
        }
        hadNonNotFoundError = true;
        if (process.env.debug) {
          console.log('searchBooking API error', {
            url,
            errorCode,
            message: err.message,
          });
        }
        return null;
      }
    };

    const bookings = await (async () => {
      let url;
      if (!isNilOrEmpty(bookingId)) {
        const dedupeBookings = items => {
          const seen = new Set();
          return items.filter(booking => {
            const dedupeKey = booking?.orderNumber
              || booking?.id
              || booking?.bookingId
              || booking?.reference
              || booking?.resellerReference
              || booking?.supplierBookingId;
            if (!dedupeKey) return false;
            if (seen.has(dedupeKey)) return false;
            seen.add(dedupeKey);
            return true;
          });
        };
        const trySearch = async searchUrl => {
          const result = await searchByUrl(searchUrl);
          const normalizedResults = (Array.isArray(result) ? result : [result]).filter(Boolean);
          const uniqueResults = dedupeBookings(normalizedResults);
          return uniqueResults;
        };

        const byId = await trySearch(`${validatedEndpoint}/bookings/${bookingId}`);
        if (byId.length > 0) {
          return byId;
        }

        const byResellerReference = await trySearch(
          `${validatedEndpoint}/bookings?resellerReference=${bookingId}`,
        );
        if (byResellerReference.length > 0) {
          return byResellerReference;
        }

        const bySearch = await trySearch(
          `${validatedEndpoint}/bookings?search=${bookingId}`,
        );
        if (bySearch.length > 0) {
          return bySearch;
        }

        return [];
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
          if (data && data.requestStatus && !data.requestStatus.success) {
            return [];
          }
          return R.pathOr([], ['bookings'], data);
        } catch (err) {
          if (err.response && err.response.data && err.response.data.requestStatus) {
            const errorCode = R.path(['response', 'data', 'requestStatus', 'error', 'errorCode'], err);
            if (errorCode === ERROR_CODE_NO_ORDER_FOUND) {
              return [];
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

    return {
      bookings: await Promise.map(Array.isArray(bookings) ? bookings : [bookings], async booking => {
        if (!booking) return null;
        return toTranslatedBooking({
          rootValue: booking,
          bookingTypeDefs,
          bookingQuery,
          validatedEndpoint,
        });
      }).then(results => results.filter(Boolean)),
    };
  }
}

module.exports = Plugin;
