/**
 * Map Rezdy's product-level `passengerFields[].field` enum values onto the
 * UI-side traveler field ids returned by `buildCreateBookingFields`. Used to
 * tag a contact field as `visiblePerParticipant` (and optionally
 * `requiredPerParticipant`) when Rezdy says it must be collected for every
 * passenger.
 *
 * Keep keys upper-snake to mirror the wire format and ease diffing against
 * Rezdy's docs; alias variants (e.g. `POSTCODE` vs `POST_CODE`) are listed
 * explicitly so we don't silently miss either spelling.
 */
const REZDY_PASSENGER_FIELD_TO_UI_ID = {
  FIRST_NAME: 'firstName',
  FIRSTNAME: 'firstName',
  LAST_NAME: 'lastName',
  LASTNAME: 'lastName',
  EMAIL: 'emailAddress',
  EMAILADDRESS: 'emailAddress',
  PHONE_NUMBER: 'phoneNumber',
  PHONENUMBER: 'phoneNumber',
  POST_CODE: 'postCode',
  POSTCODE: 'postCode',
  COUNTRY: 'country',
};

const DEFAULT_EXCLUDED_CUSTOMER_QUESTION_IDS = [
  ...new Set([
    ...Object.values(REZDY_PASSENGER_FIELD_TO_UI_ID || {}),
  ]),
];

module.exports = {
  REZDY_PASSENGER_FIELD_TO_UI_ID,
  DEFAULT_EXCLUDED_CUSTOMER_QUESTION_IDS,
};
