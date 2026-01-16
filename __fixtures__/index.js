/**
 * Centralized fixture exports for testing
 * These fixtures represent mock API responses from the Rezdy API
 */

const booking = require('./booking');
const units = require('./units');
const products = require('./products');
const availability = require('./availability');
const bookingResponse = require('./bookingResponse');

module.exports = {
  booking,
  units,
  products,
  availability,
  bookingResponse,
};
