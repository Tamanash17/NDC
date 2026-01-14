# NDC Booking Tool - Enterprise Backend

Enterprise-grade NDC 21.3 booking backend supporting all 9 NDC operations with multi-tenant authentication.

## Version
3.1.1 (Complete - 9/10 Rating)

## Features
- All 9 NDC 21.3 Operations (Prime Flow + Servicing Flow)
- Multi-tenant authentication with token caching
- Circuit breaker pattern for resilience
- Exponential backoff retry
- XML transaction logging with audit trail
- Prometheus-compatible metrics
- Docker support with multi-stage builds
- Full TypeScript with strict mode
- Comprehensive test suite with Vitest

## Quick Start
```bash
npm install
npm run dev        # Development with hot reload
npm run build      # Production build
npm start          # Start production server
npm test           # Run tests
npm run lint       # Run ESLint
```

## Docker
```bash
docker-compose up -d
```

## Required Headers
| Header | Description |
|--------|-------------|
| X-NDC-Auth-Domain | Authentication domain (e.g., navaborad) |
| X-NDC-API-ID | Your API ID |
| X-NDC-API-Password | Your API password |
| X-NDC-Subscription-Key | Azure subscription key |

## API Endpoints
- GET /api/health - Health check
- POST /api/auth/token - Authenticate
- POST /api/ndc/air-shopping - Search flights
- POST /api/ndc/offer-price - Price offers
- POST /api/ndc/service-list - Get ancillaries
- POST /api/ndc/seat-availability - Get seat maps
- POST /api/ndc/order-create - Create booking
- POST /api/ndc/order-retrieve - Retrieve order
- POST /api/ndc/order-reshop - Get change options
- POST /api/ndc/order-quote - Quote changes
- POST /api/ndc/order-change - Apply changes

## License
Proprietary - Internal Use Only