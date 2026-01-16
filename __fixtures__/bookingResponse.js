module.exports = {
  createBookingSuccess: {
    "orderNumber": "REZDY-12345",
    "id": "booking-id-12345",
    "status": "CONFIRMED",
    "customer": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "phone": "+1234567890"
    },
    "items": [
      {
        "productCode": "120",
        "productName": "Vancouver Nights",
        "startTimeLocal": "2026-03-15T18:00:00",
        "quantities": [
          {
            "optionLabel": "Adult",
            "value": 2
          }
        ]
      }
    ],
    "totalAmount": 300,
    "totalPaid": 300,
    "currency": "CAD",
    "createdDate": "2026-01-16T10:00:00Z",
    "modifiedDate": "2026-01-16T10:00:00Z"
  },
  
  searchBookingResults: [
    {
      "orderNumber": "REZDY-12345",
      "id": "booking-id-12345",
      "status": "CONFIRMED",
      "customer": {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "phone": "+1234567890"
      },
      "items": [
        {
          "productCode": "120",
          "productName": "Vancouver Nights",
          "startTimeLocal": "2026-03-15T18:00:00",
          "quantities": [
            {
              "optionLabel": "Adult",
              "value": 2
            }
          ]
        }
      ],
      "totalAmount": 300,
      "currency": "CAD"
    }
  ],
  
  cancelBookingSuccess: {
    "orderNumber": "REZDY-12345",
    "id": "booking-id-12345",
    "status": "CANCELLED",
    "cancellationDate": "2026-01-16T11:00:00Z",
    "cancellationReason": "Customer requested cancellation"
  }
};
