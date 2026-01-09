const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql } = require('graphql');
const R = require('ramda');
const jwt = require('jsonwebtoken');

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
      if (root.status !== 'AVAILABLE' && root.status !== 'FREESALE') return null;
      return jwt.sign(({
        items: [{
          productCode: productId,
          startTimeLocal: root.startTimeLocal,
          quantities: unitsWithQuantity.filter(o => o.quantity).map(o => ({
            optionLabel: o.unitName,
            value: o.quantity,
          })),
        }],
      }), jwtKey);
    },
    dateTimeStart: root => R.path(['startTimeLocal'], root),
    dateTimeEnd: root => R.path(['endTimeLocal'], root),
    allDay: R.path(['allDay']),
    vacancies: R.prop('seatsAvailable'),
    available: avail => avail.seatsAvailable > 0,
    // get the starting price
    pricing: root => {
      const unitsWithQuantity = root.unitsWithQuantity;
      const total = unitsWithQuantity.reduce((acc, u) => {
        const unit = root.priceOptions.find(p => p.id === u.unitId);
        if (!unit) return acc;
        return acc + unit.price * u.quantity;
      }, 0 );
      return { total };
    },
    unitPricing: root => root.priceOptions || [],
    pickupAvailable: root => Boolean(R.path(['pickupPoints', 'length'], root)),
  //   pickupRequired: R.prop('pickupRequired'),
    pickupPoints: root => R.pathOr([], ['pickupPoints'], root)
      .map(o => ({
        id: o.locationName,
        name: o.locationName,
        directions: o.pickupInstructions,
        localDateTime: o.pickupTime,
      })),
  },
  Pricing: {
    unitId: R.prop('unitId'),
    original: R.prop('total'),
    retail: R.prop('total'),
    net: R.prop('total'),
    currencyPrecision: R.prop('currencyPrecision'),
  },
};


const translateAvailability = async ({ rootValue, variableValues, typeDefs, query }) => {
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  })
  const retVal = await graphql({
    schema,
    rootValue,
    source: query,
    variableValues,
  });
  if (retVal.errors) throw new Error(retVal.errors);
  return retVal.data;
};
module.exports = {
  translateAvailability,
};
