const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql } = require('graphql');

// Booking status constants
const STATUS_CANCELLED = 'CANCELLED';
// Default option ID for bookings without specific options
const DEFAULT_OPTION_ID = 'default';

/**
 * Constructs the Rezdy dashboard URL for a booking from the API endpoint
 * @param {string} orderNumber - The order/booking number (e.g., 'R4DLYBR')
 * @param {string} apiEndpoint - API endpoint URL (e.g., 'https://api.rezdy.com/v1')
 * @returns {string} Full dashboard URL
 */
const buildDashboardUrl = (orderNumber, apiEndpoint) => {
  if (!orderNumber) return '';
  if (!apiEndpoint || typeof apiEndpoint !== 'string') return '';

  try {
    // Parse the API endpoint URL
    const url = new URL(apiEndpoint);

    // Transform api.rezdy.com -> app.rezdy.com
    // Transform api.rezdy-staging.com -> app.rezdy-staging.com
    // Works with any domain following this pattern
    const dashboardHost = url.host.replace(/^api\./, 'app.');

    // Construct the dashboard URL
    return `${url.protocol}//${dashboardHost}/orders/edit/${orderNumber}`;
  } catch (err) {
    // If URL parsing fails, return empty string
    return '';
  }
};

const resolvers = {
  Query: {
    id: R.path(['orderNumber']),
    orderId: R.pathOr('', ['orderNumber']),
    bookingId: R.pathOr('', ['orderNumber']),
    supplierBookingId: R.path(['orderNumber']),
    status: e => R.path(['status'], e),
    productId: R.path(['items', 0, 'productCode']),
    productName: R.path(['items', 0, 'productName']),
    cancellable: root => {
      // Cancelled bookings cannot be cancelled again
      if (root.status === STATUS_CANCELLED) return false;
      return root.cancellable;
    },
    // Rezdy API does not support editing bookings after creation
    // Bookings must be cancelled and recreated if changes are needed
    editable: () => false,
    unitItems: ({ items = [] }) => R.pathOr([], [0, 'quantities'], items).map(unitItem => ({
      unitItemId: R.path(['optionLabel'], unitItem),
      unitId: R.path(['optionLabel'], unitItem),
      unitName: R.pathOr('', ['optionLabel'], unitItem),
      quantity: R.pathOr(R.path(['value'], unitItem), ['quantity'], unitItem),
    })),
    start: R.path(['items', 0, 'startTimeLocal']),
    end: R.path(['items', 0, 'endTimeLocal']),
    bookingDate: R.path(['dateCreated']),
    holder: root => ({
      name: R.path(['customer', 'firstName'], root),
      surname: R.path(['customer', 'lastName'], root),
      fullName: R.path(['customer', 'name'], root),
      phoneNumber: R.path(['customer', 'phone'], root),
    }),
    notes: root => R.pathOr(R.pathOr('', ['comments'], root), ['internalNotes'], root),
    price: root => ({
      original: R.path(['totalAmount'], root),
      retail: R.path(['totalAmount'], root),
      currency: R.path(['totalCurrency'], root),
    }),
    // Rezdy API does not provide cancellation policy in booking response
    // Cancellation policies are defined at the product level
    cancelPolicy: () => '',
    optionId: () => DEFAULT_OPTION_ID,
    optionName: R.path(['items', 0, 'productName']),
    resellerReference: R.propOr('', 'resellerReference'),
    // Public URL for booking confirmation (customer-facing)
    publicUrl: R.prop('confirmation_url'),
    // Private URL for booking dashboard (supplier-facing)
    // Constructed dynamically since Rezdy API doesn't return this field
    privateUrl: root => {
      const orderNumber = root.orderNumber;
      const apiEndpoint = root._rezdyApiEndpoint;
      return buildDashboardUrl(orderNumber, apiEndpoint);
    },
    pickupRequested: R.prop('pickupRequested'),
    pickupPointId: R.prop('pickupPointId'),
    pickupPoint: root => {
      const pickupPoint = R.path(['items', 0, 'pickupPoint'], root);
      if (!pickupPoint) return null;
      return {
        id: pickupPoint.locationName,
        name: pickupPoint.locationName,
        directions: pickupPoint.pickupInstructions,
        localDateTime: pickupPoint.pickupTime,
      };
    },
  },
};


/**
 * Translates booking data using GraphQL schema
 * Handles both wrapped format (with requestStatus) and direct booking format
 * @param {Object} params - Translation parameters
 * @param {Object} params.rootValue - Root value object (may be wrapped or direct booking)
 * @param {string} params.typeDefs - GraphQL type definitions
 * @param {string} params.query - GraphQL query string
 * @param {string} [params.apiEndpoint] - API endpoint URL for dashboard URL construction
 * @returns {Promise<Object>} Translated booking data
 * @throws {Error} If GraphQL execution fails
 */
const translateBooking = async ({ rootValue, typeDefs, query, apiEndpoint }) => {
  // Handle wrapped booking format: { requestStatus: {...}, booking: {...} }
  // or direct booking format: { orderNumber: ..., status: ..., ... }
  let booking = rootValue && rootValue.booking ? rootValue.booking : rootValue;

  // Add endpoint to booking data for dashboard URL construction
  // Create a new object to avoid mutating the original
  booking = {
    ...booking,
    _rezdyApiEndpoint: apiEndpoint,
  };
  
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });
  const retVal = await graphql({
    schema,
    rootValue: booking,
    source: query,
  });
  // Properly serialize GraphQL errors
  if (retVal.errors) {
    const errorMessages = retVal.errors.map(err => err.message).join('; ');
    throw new Error(errorMessages);
  }
  return retVal.data;
};

module.exports = {
  translateBooking,
};
