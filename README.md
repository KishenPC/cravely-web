# Cravely

Cravely is a student-focused food discovery platform designed for everyday campus life. It helps students discover nearby restaurants and dishes, contribute trustworthy reviews, and redeem curated offers through a points-based incentive system.

The product combines location intelligence, community feedback, and incentive design into one continuous experience:
1. Discover nearby restaurants and dishes around your current location.
2. Share real reviews and dish-level feedback.
3. Earn points from participation.
4. Spend points to claim campus-relevant offers.

Cravely is built as a full-stack web application with Next.js, NextAuth, MongoDB, and Google Maps data integration.

## Product Overview

Cravely focuses on three core ideas:

- Proximity-first discovery:
  Search and review experiences are location scoped, so content reflects what is actually nearby.

- Community-driven quality:
  Students enrich the catalog by writing reviews, adding dish context, and improving data quality over time.

- Incentivized participation:
  Point earning and point redemption connect contribution directly to user value.

## Core Features

### 1. Student Authentication and Access Control
- Google authentication via NextAuth.
- Access is restricted to `@vitstudent.ac.in` accounts.
- Domain and verified-email checks are enforced server-side.

### 2. Shared Location Context Across Pages
- Search and Reviews share one location scope provider.
- Nearby context can be refreshed on demand.
- Location context is cached client-side with a short TTL to reduce redundant requests.

### 3. Google Maps Nearby Sync to MongoDB
- Nearby restaurant places are fetched from Google Maps Places API.
- Sync behavior uses upsert semantics:
  - New places are inserted.
  - Existing places are updated with latest metadata.
- Synced restaurant metadata includes:
  - Place ID
  - Address and geo coordinates
  - Ratings and open status
  - Maps URL and sync timestamps

### 4. Search Experience
- Dish search supports keyword matching and quick filters.
- Nearby restaurant explorer supports filters for:
  - Distance
  - Rating thresholds
  - Open/closed state
- Search can operate globally (without location) or in nearby scoped mode.

### 5. Review Experience
- Nearby-only review feed tied to restaurants in current location scope.
- Review submission supports:
  - Existing dish review
  - New dish + review in one flow
  - Association to existing DB restaurant or nearby mapped place
- Review filtering supports:
  - Restaurant
  - Dish

### 6. Incentivized Points System
- Points are tied to user contribution.
- Earning rules:
  - `2` points per review
  - `2` points per upvote
- User point fields:
  - `totalPointsEarned`
  - `totalPointsSpent`
  - `points` (available balance)
- Available points formula:
  - `max(totalPointsEarned - totalPointsSpent, 0)`

### 7. Offer Claiming with Point Spending
- Offers store a `pointsCost` value.
- Offer claiming flow validates:
  - Authenticated user
  - Offer activity and expiry
  - Remaining claim capacity
  - Sufficient user points
- Successful claim flow:
  - Deducts user points
  - Increments offer claim count
  - Writes redemption history (`redemptionType: offer`)

### 8. Profile and Rewards Surface
- Profile endpoint returns user identity, stats, and point balances.
- Rewards list includes affordability checks against current points.
- Offers UI displays available points and claim eligibility states.

## Tech Stack

- Next.js (`app` + `pages/api` hybrid)
- React
- NextAuth (Google provider)
- MongoDB + Mongoose
- Google Maps Places API

## Environment Variables

Create `.env.local` with:

```env
MONGODB_URI=...
NEXTAUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_MAPS_API_KEY=...
```

Also supported for maps key fallback:
- `PLACES_URI`
- `MAPS_URI`

Optional:
- `LOCATION_MAX_PLACES` (caps nearby place fetch/sync volume)

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Seed Data

```bash
npm run seed
npm run seed:more
```

## API Overview

### Auth
- `GET/POST /api/auth/[...nextauth]`

### Location and Discovery
- `GET /api/location-context?lat=<number>&lng=<number>&radius=<meters>`
  - Returns nearby places, restaurants, dishes, and sync metadata.
- `GET /api/maps-nearby?lat=<number>&lng=<number>&radius=<meters>`
  - Returns nearby places and sync count.
- `GET /api/search-results`
  - Returns location-scoped dishes when location is provided, otherwise global results.
- `GET /api/restaurants`
  - Supports place-based and location-based retrieval.

### Reviews
- `GET /api/reviews`
- `POST /api/reviews`
  - Creates review for existing dish, or creates new dish + review.

### Offers and Redemption
- `GET /api/offers`
- `POST /api/offers/redeem`
  - Body: `{ "offerId": "..." }`

### Profile
- `GET /api/profile`

## Data Model Highlights

- `User`: identity, provider, contribution stats, and point balances.
- `Restaurant`: place identity, geo data, ratings, open status, and sync metadata.
- `Dish`: restaurant-linked menu item with aggregate rating/review stats.
- `Review`: user-linked dish feedback with tags, rating, and votes.
- `Offer`: redeemable campaign with points cost and claim counters.
- `Reward`: points-based reward catalog.
- `Redemption`: audit trail for reward/offer redemptions.
