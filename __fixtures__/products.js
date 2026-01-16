module.exports = {
  products: [
    {
      "productCode": "120",
      "productName": "Vancouver Nights",
      "name": "Vancouver Nights",
      "shortDescription": "Experience the magic of Vancouver at night",
      "description": "A beautiful evening tour of Vancouver's most iconic nighttime locations",
      "productType": "ACTIVITY",
      "advertisedPrice": 150,
      "currency": "CAD",
      "priceOptions": [
        {
          "id": "adults",
          "label": "Adult",
          "price": 150,
          "seatsUsed": 1
        },
        {
          "id": "children",
          "label": "Child",
          "price": 75,
          "seatsUsed": 1
        }
      ],
      "locationAddress": {
        "addressLine": "123 Vancouver St",
        "city": "Vancouver",
        "state": "BC",
        "countryCode": "CA"
      },
      "images": [],
      "quantityRequired": true,
      "quantityRequiredMin": 1,
      "quantityRequiredMax": 10,
      "durationMinutes": 180,
      "bookingMode": "INVENTORY"
    },
    {
      "productCode": "121",
      "productName": "Stanley Park Walking Tour",
      "name": "Stanley Park Walking Tour",
      "shortDescription": "Explore beautiful Stanley Park",
      "description": "A guided walking tour through Vancouver's famous Stanley Park",
      "productType": "ACTIVITY",
      "advertisedPrice": 50,
      "currency": "CAD",
      "priceOptions": [
        {
          "id": "adults",
          "label": "Adult",
          "price": 50,
          "seatsUsed": 1
        }
      ],
      "locationAddress": {
        "addressLine": "Stanley Park",
        "city": "Vancouver",
        "state": "BC",
        "countryCode": "CA"
      },
      "images": [],
      "quantityRequired": true,
      "quantityRequiredMin": 1,
      "quantityRequiredMax": 20,
      "durationMinutes": 120,
      "bookingMode": "INVENTORY"
    }
  ]
};
