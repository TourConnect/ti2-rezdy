const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql } = require('graphql');

/**
 * GraphQL resolvers for product data transformation
 * Maps Rezdy API product structure to TI2 product schema
 */
const resolvers = {
  Query: {
    productId: R.path(['productCode']),
    productName: R.path(['name']),
    availableCurrencies: root => root.currency ? [root.currency] : [],
    defaultCurrency: R.path(['currency']),
    options: root => [root],
  },
  Option: {
    optionId: () => 'default',
    optionName: R.prop('name'),
    units: R.propOr([], ['priceOptions']),
  },
  Unit: {
    unitId: R.path(['id']),
    unitName: R.pathOr('', ['label']),
    restrictions: R.propOr({}, 'restrictions'),
    pricing: p => [{
      original: R.path(['price'], p),
      retail: R.path(['price'], p),
    }],
  },
};

/**
 * Translates Rezdy product data to TI2 format using GraphQL schema
 * @param {Object} params - Translation parameters
 * @param {Object} params.rootValue - Raw product data from Rezdy API
 * @param {string} params.typeDefs - GraphQL type definitions
 * @param {string} params.query - GraphQL query string
 * @returns {Promise<Object>} Translated product data
 * @throws {Error} If GraphQL execution fails
 */
const translateProduct = async ({
  rootValue,
  typeDefs,
  query,
}) => {
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
  translateProduct,
};
