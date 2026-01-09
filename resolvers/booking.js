const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql } = require('graphql');

const capitalize = sParam => {
  if (typeof sParam !== 'string') return '';
  const s = sParam.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};
const isNilOrEmptyArray = el => {
  if (!Array.isArray(el)) return true;
  return R.isNil(el) || R.isEmpty(el);
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
      if (root.status === 'CANCELLED') return false;
      return root.cancellable;
    },
    editable: () => false,
    unitItems: ({ items = [] }) => R.pathOr([], [0, 'quantities'], items).map(unitItem => ({
      unitItemId: R.path(['optionLabel'], unitItem),
      unitId: R.path(['optionLabel'], unitItem),
      unitName: R.pathOr('', ['optionLabel'], unitItem),
      quantity: R.path(['quantity'], unitItem),
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
    notes: R.pathOr('', ['internalNotes']),
    price: root => ({
      original: R.path(['totalAmount'], root),
      retail: R.path(['totalAmount'], root),
      currency: R.path(['totalCurrency'], root),
    }),
    cancelPolicy: root => {
      return '';
    },
    optionId: () => 'default',
    optionName: R.path(['items', 0, 'productName']),
    resellerReference: R.propOr('', 'resellerReference'),
    // TODO
    publicUrl: R.prop('confirmation_url'),
    privateUrl: R.prop('dashboard_url'),
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


const translateBooking = async ({ rootValue, typeDefs, query }) => {
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });
  const retVal = await graphql({
    schema,
    rootValue,
    source: query,
  });
  if (retVal.errors) throw new Error(retVal.errors);
  return retVal.data;
};

module.exports = {
  translateBooking,
};
