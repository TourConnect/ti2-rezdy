const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql } = require('graphql');

/**
 * GraphQL resolvers for rate/pricing data transformation
 * Maps Rezdy API rate structure to TI2 rate schema
 */
const resolvers = {
  Query: {
    rateId: R.path(['unitId']),
    rateName: root => R.toLower(R.path(['unitName'], root)),
    pricing: root => [{
      original: R.path(['total_including_tax'], root),
      retail: R.path(['total_including_tax'], root),
      currencyPrecision: 2,
      currency: R.path(['company', 'currency'], root),
    }],
  },
};

/**
 * Translates Rezdy rate data to TI2 format using GraphQL schema
 * @param {Object} params - Translation parameters
 * @param {Object} params.rootValue - Raw rate data from Rezdy API
 * @param {string} params.typeDefs - GraphQL type definitions
 * @param {string} params.query - GraphQL query string
 * @returns {Promise<Object>} Translated rate data
 * @throws {Error} If GraphQL execution fails
 */
const translateRate = async ({ rootValue, typeDefs, query }) => {
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
  translateRate,
};
