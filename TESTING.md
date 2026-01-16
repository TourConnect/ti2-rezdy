# Testing Guide

## Overview

This project supports two types of testing:

1. **Unit Tests** - Fast, isolated tests of individual functions
2. **Integration Tests** - Full workflow tests using fixtures (no credentials needed)

## Quick Start

### For Local Development (No Credentials Needed)

```bash
# Run all tests
npm test

# Or run separately:
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
```

### For CI/CD

```bash
# Run all tests
npm test
```

**No environment variables or API credentials required!**

---

## Integration Tests

### Why Use Fixture-Based Tests?

✅ **No API Credentials Required** - Run tests locally without exposing secrets  
✅ **Fast Execution** - No network calls means tests run in milliseconds  
✅ **Reliable** - No API downtime or rate limiting  
✅ **Reproducible** - Same fixtures = same results every time  
✅ **Test Edge Cases** - Easily test error scenarios with fixtures  
✅ **Safe for CI** - No need to store credentials in CI environment  
✅ **Offline Development** - Work without internet connection  

### How It Works

```
┌─────────────────┐
│  Test Code      │
│  calls Plugin   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Plugin makes   │
│  axios request  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│  Jest Mock      │─────▶│  Fixtures    │
│  intercepts     │      │  Return Data │
│  axios call     │◀─────│              │
└────────┬────────┘      └──────────────┘
         │
         ▼
┌─────────────────┐
│  Test receives  │
│  fixture data   │
│  as response    │
└─────────────────┘
```

### Available Fixtures

All fixtures are in the `__fixtures__/` directory:

| Fixture File | Description |
|--------------|-------------|
| `products.js` | Mock product catalog data |
| `availability.js` | Mock availability sessions |
| `booking.js` | Mock booking/order data |
| `bookingResponse.js` | Mock create/cancel booking responses |
| `units.js` | Mock pricing unit definitions |

### Running Integration Tests

```bash
npm run test:integration
```

### Test Coverage

The integration tests cover:

- ✅ Token validation
- ✅ Product search (all products, by ID, by name pattern)
- ✅ Availability calendar
- ✅ Availability search with availability keys
- ✅ Booking creation
- ✅ Booking search (by ID, reference, supplier ID, travel date)
- ✅ Booking cancellation

---

## Unit Tests

Unit tests test individual functions in isolation without any API calls or external dependencies.

### Running Unit Tests

```bash
npm run test:unit
```

### What's Covered

- Core Plugin class methods
- Helper functions (`validateEndpoint`, `calculateSeatsAvailable`, etc.)
- GraphQL resolvers (availability, booking)
- Data transformation logic
- Error handling

---

## Test Scripts Reference

| Command | Description | Requires Credentials |
|---------|-------------|---------------------|
| `npm test` | Run all tests | No |
| `npm run test:unit` | Run unit tests only | No |
| `npm run test:integration` | Run integration tests | No |
| `npm run test:coverage` | Run with coverage report | No |
| `npm run test:watch` | Run in watch mode | No |
