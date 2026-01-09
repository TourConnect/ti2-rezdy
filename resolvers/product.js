const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql } = require('graphql');

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
