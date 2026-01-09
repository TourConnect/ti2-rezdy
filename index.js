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

const endpoint = 'https://api.rezdy-staging.com/latest';

const CONCURRENCY = 3; // is this ok ?
if (process.env.debug) {
  curlirize(axiosRaw);
}

const isNilOrEmpty = R.either(R.isNil, R.isEmpty);

const getHeaders = ({
  apiKey,
}) => ({
  apiKey,
  'Content-Type': 'application/json',
});


const axiosSafeRequest = R.pick(['headers', 'method', 'url', 'data']);
const axiosSafeResponse = response => {
  const retVal = R.pick(['data', 'status', 'statusText', 'headers', 'request'], response);
  retVal.request = axiosSafeRequest(retVal.request);
  return retVal;
};
class Plugin {
  constructor(params) { // we get the env variables from here
    Object.entries(params).forEach(([attr, value]) => {
      this[attr] = value;
    });
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
    this.axios = async (...args) => axiosRaw(...args).catch(err => {
      const errMsg = R.omit(['config'], err.toJSON());
      console.log(`error in ${this.name}`, err.response.data);
      if (pluginObj.events) {
        pluginObj.events.emit(`${this.name}.axios.error`, {
          request: args[0],
          err: errMsg,
        });
      }
      throw R.pathOr(err, ['response', 'data', 'details'], err);
    });
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
      }
    });
  }

  async validateToken({
    token: {
      apiKey,
    },
  }) {
    const url = `${endpoint || this.endpoint}/products`;
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

  async searchProducts({
    token: {
      apiKey,
    },
    payload,
    typeDefsAndQueries: {
      productTypeDefs,
      productQuery,
    },
  }) {
    let url = `${endpoint || this.endpoint}/products`;
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

  async searchQuote({
    token: {
      apiKey,
    },
    payload: {
      productIds,
      optionIds,
    },
  }) {
    return { quote: [] };
  }

  async searchAvailability({
    token: {
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
    const localDateStart = `${moment(startDate, dateFormat).format('YYYY-MM-DD')}T00:00:00.000Z`;
    const localDateEnd = `${moment(endDate, dateFormat).format('YYYY-MM-DD')}T00:00:00.000Z`;
    const headers = getHeaders({
      apiKey,
    });
    const url = `${endpoint || this.endpoint}/availability`;
    let availability = (
      await Promise.map(productIds, async (productId, ix) => {
        const minAvailability = units[ix].reduce((acc, u) => (u.quantity || 0) + acc, 0);
        return R.path(['data'], await this.axios({
          method: 'post',
          url: `${url}/?productCode=${productId}startTime=${localDateStart}&endTime=${localDateEnd}&minAvailability=${minAvailability}`,
          headers,
        }));
      }, { concurrency: CONCURRENCY })
    );
    availability = await Promise.map(availability,
      (avails, ix) => {
        return Promise.map(avails,
          async avail => {
            const pickupPoints = R.pathOr([], ['data', 'pickupLocations'], await this.axios({
              method: 'get',
              url: `${endpoint || this.endpoint}/products/${avail.productCode}/pickups`,
            }));
            return translateAvailability({
              typeDefs: availTypeDefs,
              query: availQuery,
              rootValue: {
                ...avail,
                pickupPoints,
              },
              variableValues: {
                productId: productIds[ix],
                optionId: optionIds[ix],
                currency,
                unitsWithQuantity: units[ix],
                jwtKey: this.jwtKey,
              },
            });
        });
      },
    );
    return { availability };
  }

  async availabilityCalendar({
    token: {
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
    return { availability: [] };
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
    const localDateStart = `${moment(startDate, dateFormat).format('YYYY-MM-DD')}T00:00:00.000Z`;
    const localDateEnd = `${moment(endDate, dateFormat).format('YYYY-MM-DD')}T00:00:00.000Z`;
    const headers = getHeaders({
      apiKey,
    });
    const url = `${endpoint || this.endpoint}/availability`;
    let availability = (
      await Promise.map(productIds, async (productId, ix) => {
        const minAvailability = units[ix].reduce((acc, u) => (u.quantity || 0) + acc, 0);
        return R.path(['data'], await this.axios({
          method: 'post',
          url: `${url}/?productCode=${productId}startTime=${localDateStart}&endTime=${localDateEnd}&minAvailability=${minAvailability}`,
          headers,
        }));
      }, { concurrency: CONCURRENCY })
    );
    availability = await Promise.map(availability,
      (avails) => {
        return Promise.map(avails,
          avail => translateAvailability({
            typeDefs: availTypeDefs,
            query: availQuery,
            rootValue: avail,
          }),
        );
      },
    );
    return { availability };
  }

  async createBooking({
    token: {
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
    },
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(availabilityKey, 'an availability code is required !');
    assert(R.path(['name'], holder), 'a holder\' first name is required');
    assert(R.path(['surname'], holder), 'a holder\' surname is required');
    const headers = getHeaders({
      apiKey,
    });
    const urlForCreateBooking = `${endpoint || this.endpoint}/bookings`;
    const dataFromAvailKey = await jwt.verify(availabilityKey, this.jwtKey);
    let booking = R.path(['data'], await this.axios({
      method: 'post',
      url: urlForCreateBooking,
      data: {
        // settlementMethod, 
        ...dataFromAvailKey,
        internalNotes: notes,
        customer: {
          firstName: holder.name,
          lastName: holder.surname,
          email: R.path(['emailAddress'], holder),
          phone: R.pathOr('', ['phoneNumber'], holder),
        },
        pickupLocation: {
          locationName: pickupPoint,
        },
        ...(reference ? { resellerReference: reference } : {}),
        ...(resellerId ? { resellerId } : {}),
      },
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

  async cancelBooking({
    token: {
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
    const headers = getHeaders({
      apiKey,
    });
    const url = `${endpoint || this.endpoint}/bookings/${bookingId || id}/cancel`;
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

  async searchBooking({
    token: {
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
    const headers = getHeaders({
      apiKey,
    });
    const searchByUrl = async url => {
      try {
        return R.path(['data'], await this.axios({
          method: 'get',
          url,
          headers,
        }));
      } catch (err) {
        return [];
      }
    };
    const bookings = await (async () => {
      let url;
      if (!isNilOrEmpty(bookingId)) {
        return Promise.all([
          searchByUrl(`${endpoint || this.endpoint}/bookings/${bookingId}`),
          searchByUrl(`${endpoint || this.endpoint}/bookings?resellerReference=${bookingId}`),
          searchByUrl(`${endpoint || this.endpoint}/bookings?search=${bookingId}`),
        ]);
      }
      if (!isNilOrEmpty(travelDateStart)) {
        const localDateStart = moment(travelDateStart, dateFormat).format('YYYY-MM-DD');
        const localDateEnd = moment(travelDateEnd, dateFormat).format('YYYY-MM-DD');
        url = `${endpoint || this.endpoint}/bookings?minTourStartTime=${encodeURIComponent(localDateStart)}&maxTourStartTime=${encodeURIComponent(localDateEnd)}`;
        return R.path(['data'], await this.axios({
          method: 'get',
          url,
          headers,
        }));
      }
      return [];
    })();
    return ({
      bookings: await Promise.map(R.unnest(bookings), async booking => {
        return translateBooking({
          rootValue: booking,
          typeDefs: bookingTypeDefs,
          query: bookingQuery,
        });
      })
    });
  }
}

module.exports = Plugin;
