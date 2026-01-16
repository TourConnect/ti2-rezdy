const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql } = require('graphql');
const R = require('ramda');
const jwt = require('jsonwebtoken');

// Availability status constants
const STATUS_AVAILABLE = 'AVAILABLE';
const STATUS_FREESALE = 'FREESALE';

/**
 * Finds a price option by unit ID
 * @param {Array<Object>} priceOptions - Array of price options to search
 * @param {string|number} unitId - Unit ID to find
 * @returns {Object|null} Matching price option or null
 */
const findPriceOptionByUnitId = (priceOptions, unitId) => {
  if (unitId === undefined || unitId === null) return null;
  if (!Array.isArray(priceOptions) || priceOptions.length === 0) return null;
  const unitIdStr = String(unitId).toLowerCase();
  return priceOptions.find(p => {
    const pIdStr = p.id !== undefined ? String(p.id).toLowerCase() : '';
    const pUnitIdStr = p.unitId ? String(p.unitId).toLowerCase() : '';
    return pIdStr === unitIdStr
      || pUnitIdStr === unitIdStr
      || p.id === unitId
      || p.unitId === unitId;
  }) || null;
};

/**
 * Finds a price option by label or name
 * @param {Array<Object>} priceOptions - Array of price options to search
 * @param {string} label - Label or name to find
 * @returns {Object|null} Matching price option or null
 */
const findPriceOptionByLabel = (priceOptions, label) => {
  if (!label) return null;
  if (!Array.isArray(priceOptions) || priceOptions.length === 0) return null;
  const labelStr = String(label).toLowerCase();
  return priceOptions.find(p => {
    const pLabelStr = p.label ? String(p.label).toLowerCase() : '';
    const pNameStr = p.name ? String(p.name).toLowerCase() : '';
    return pLabelStr === labelStr || pNameStr === labelStr;
  }) || null;
};

const resolvers = {
  Query: {
    key: (root, args) => {
      const {
        productId,
        optionId,
        currency,
        unitsWithQuantity,
        jwtKey,
      } = args;
      if (!jwtKey) return null;
      const status = root.status || root.availabilityStatus;
      if (status !== STATUS_AVAILABLE && status !== STATUS_FREESALE) return null;
      const startTimeLocal = root.startTimeLocal || root.startTime || root.start;
      if (!startTimeLocal) return null;
      
      // Get priceOptions to look up unit names by unitId
      const priceOptions = root.priceOptions || root.prices || [];
      
      // Calculate total price based on units and quantities (use canonical id/unitId only)
      let totalAmount = 0;
      if (Array.isArray(priceOptions) && priceOptions.length > 0 && Array.isArray(unitsWithQuantity)) {
        totalAmount = unitsWithQuantity.reduce((acc, u) => {
          if (!u || !u.unitId) return acc;
          const unit = findPriceOptionByUnitId(priceOptions, u.unitId);
          if (!unit) return acc;
          const price = unit.price !== undefined ? unit.price : (unit.amount || 0);
          const quantity = u.quantity || 0;
          return acc + (price * quantity);
        }, 0);
      }
      
      return jwt.sign(({
        items: [{
          productCode: productId,
          startTimeLocal: startTimeLocal,
          quantities: (unitsWithQuantity || []).filter(o => o && o.quantity).map(o => {
            // Try to get unitName from the unit object first
            let optionLabel = o.unitName || o.label;
            
            // If not found, look up from priceOptions using unitId
            if (!optionLabel && o.unitId) {
              const priceOption = findPriceOptionByUnitId(priceOptions, o.unitId);
              if (priceOption) {
                optionLabel = priceOption.label || priceOption.name || priceOption.unitName;
              }
            }

            // Last-resort fallback: try matching by label/name (log in debug mode)
            if (!optionLabel && (o.label || o.unitName)) {
              const fallbackOption = findPriceOptionByLabel(priceOptions, o.label || o.unitName);
              if (fallbackOption) {
                if (process.env.debug) {
                  console.log('Fallback unit label match used for availability key', {
                    inputLabel: o.label || o.unitName,
                    matchedId: fallbackOption.id || fallbackOption.unitId || null,
                  });
                }
                optionLabel = fallbackOption.label || fallbackOption.name || fallbackOption.unitName;
              }
            }
            
            // Fallback to 'Adult' if still not found
            return {
              optionLabel: optionLabel || 'Adult',
              value: o.quantity || 0,
            };
          }),
        }],
        totalAmount, // Store total amount in JWT for use in booking
      }), jwtKey);
    },
    dateTimeStart: root => {
      const value = root.startTimeLocal || root.startTime || root.start || root.dateTimeStart;
      return value || null;
    },
    dateTimeEnd: root => {
      const value = root.endTimeLocal || root.endTime || root.end || root.dateTimeEnd;
      return value || null;
    },
    allDay: root => {
      const value = root.allDay;
      return value !== undefined ? value : (root.allDayEvent || false);
    },
    vacancies: root => {
      const value = root.seatsAvailable !== undefined ? root.seatsAvailable 
        : (root.available !== undefined ? root.available 
          : (root.vacancies !== undefined ? root.vacancies 
            : (root.availableSeats !== undefined ? root.availableSeats 
              : (root.remainingSeats !== undefined ? root.remainingSeats : 0))));
      return value !== null && value !== undefined ? value : 0;
    },
    available: avail => {
      const seatsAvailable = avail.seatsAvailable !== undefined ? avail.seatsAvailable 
        : (avail.available !== undefined ? avail.available 
          : (avail.vacancies !== undefined ? avail.vacancies 
            : (avail.availableSeats !== undefined ? avail.availableSeats 
              : (avail.remainingSeats !== undefined ? avail.remainingSeats : 0))));
      return seatsAvailable != null && seatsAvailable > 0;
    },
    // get the starting price
    pricing: root => {
      const unitsWithQuantity = root.unitsWithQuantity || [];
      if (!Array.isArray(unitsWithQuantity) || unitsWithQuantity.length === 0) {
        return { total: 0 };
      }
      const priceOptions = root.priceOptions || root.prices || [];
      if (!Array.isArray(priceOptions) || priceOptions.length === 0) {
        return { total: 0 };
      }

      // Calculate total price based on units and their quantities
      const total = unitsWithQuantity.reduce((acc, u) => {
        if (!u || !u.unitId) return acc;
        const unit = findPriceOptionByUnitId(priceOptions, u.unitId);
        if (!unit) return acc;
        const price = unit.price !== undefined ? unit.price : (unit.amount || 0);
        const quantity = u.quantity || 0;
        return acc + (price * quantity);
      }, 0);
      
      return { total };
    },
    unitPricing: root => {
      const priceOptions = root.priceOptions || root.prices || [];
      if (!Array.isArray(priceOptions)) return [];
      // Map priceOptions to the structure expected by the Pricing type resolver
      // Pricing resolver expects: unitId, total (for original/retail/net), currencyPrecision
      return priceOptions.map(p => {
        const price = p.price !== undefined ? p.price : (p.amount || 0);
        const unitId = p.id || p.unitId || p.label || p.name;
        return {
          unitId: unitId, // This will be used by Pricing.unitId resolver
          total: price,    // This will be used by Pricing.original/retail/net resolvers
          currencyPrecision: p.currencyPrecision || null,
          // Keep original fields for reference
          ...p,
        };
      });
    },
    pickupAvailable: root => {
      const pickupPoints = root.pickupPoints || [];
      return Array.isArray(pickupPoints) && pickupPoints.length > 0;
    },
    pickupRequired: root => {
      return root.pickupRequired !== undefined ? root.pickupRequired : null;
    },
    pickupPoints: root => {
      const pickupPoints = root.pickupPoints || [];
      if (!Array.isArray(pickupPoints)) return [];
      return pickupPoints.map(o => ({
        id: o.locationName || o.id || o.name,
        name: o.locationName || o.name || o.id,
        directions: o.pickupInstructions || o.directions || '',
        localDateTime: o.pickupTime || o.localDateTime || o.time,
      }));
    },
    offers: root => {
      return root.offers || null;
    },
  },
  Pricing: {
    unitId: root => {
      // For unitPricing items, unitId comes from the mapped priceOption
      // For the main pricing object, unitId is null (it's an aggregate)
      return root.unitId !== undefined ? root.unitId : null;
    },
    original: root => {
      // For unitPricing items, use total (which is the price)
      // For the main pricing object, use total (which is the calculated sum)
      const total = root.total !== undefined ? root.total : (root.price !== undefined ? root.price : 0);
      return total;
    },
    retail: root => {
      const total = root.total !== undefined ? root.total : (root.price !== undefined ? root.price : 0);
      return total;
    },
    net: root => {
      const total = root.total !== undefined ? root.total : (root.price !== undefined ? root.price : 0);
      return total;
    },
    currencyPrecision: root => {
      return root.currencyPrecision !== undefined ? root.currencyPrecision : null;
    },
  },
};


/**
 * Translates availability data using GraphQL schema
 * @param {Object} params - Translation parameters
 * @param {Object} params.rootValue - Root value object with availability data
 * @param {Object} params.variableValues - Variable values for GraphQL query
 * @param {Object} params.typeDefs - GraphQL type definitions
 * @param {string} params.query - GraphQL query string
 * @returns {Promise<Object>} Translated availability data
 */
const translateAvailability = async ({ rootValue, variableValues, typeDefs, query }) => {  
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });
  const retVal = await graphql({
    schema,
    rootValue,
    source: query,
    variableValues,
  });
  
  // Properly serialize GraphQL errors
  if (retVal.errors) {
    // Log errors only in non-test environment
    if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
      console.error('GraphQL errors:', retVal.errors);
    }
    const errorMessages = retVal.errors.map(err => err.message).join('; ');
    throw new Error(errorMessages);
  }
  
  // Convert GraphQL result to plain objects (remove null prototype)
  // This ensures compatibility with UI components that expect regular objects
  const convertToPlainObject = (obj) => {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
      return obj.map(convertToPlainObject);
    }
    if (typeof obj === 'object') {
      const plainObj = {};
      // Use Object.keys() which safely handles null prototype objects
      // and only returns own enumerable properties
      Object.keys(obj).forEach(key => {
        plainObj[key] = convertToPlainObject(obj[key]);
      });
      return plainObj;
    }
    return obj;
  };
  
  return convertToPlainObject(retVal.data);
};
module.exports = {
  translateAvailability,
};
