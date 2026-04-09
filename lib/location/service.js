import { Dish, Offer, Restaurant } from '../schemas';
import {
  clampRadius,
  DEFAULT_RADIUS_METERS,
  formatDistance,
  parsePlaceIds,
  stringifyId,
} from './shared';

const MAPS_API_KEY =
  process.env.PLACES_URI ||
  process.env.MAPS_URI ||
  process.env.GOOGLE_MAPS_API_KEY;

const MAX_PLACES = Math.min(
  Math.max(Number.parseInt(process.env.LOCATION_MAX_PLACES || '40', 10) || 40, 1),
  60
);
const MAX_PLACE_PAGES = Math.min(Math.max(Math.ceil(MAX_PLACES / 20), 1), 3);
const NEXT_PAGE_TOKEN_DELAY_MS = 2200;

function normalizeNearbyPlace(place) {
  return {
    id: place.place_id,
    name: place.name,
    address: place.vicinity || 'Address unavailable',
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    totalRatings: Number.isFinite(Number(place.user_ratings_total)) ? Number(place.user_ratings_total) : 0,
    openNow: place.opening_hours?.open_now ?? null,
    mapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
    location: place.geometry?.location || null,
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestGoogleNearby(params, attempt = 0) {
  const endpoint = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      endpoint.searchParams.set(key, String(value));
    }
  });
  endpoint.searchParams.set('key', MAPS_API_KEY);

  const response = await fetch(endpoint.toString());
  const payload = await response.json();

  if (!response.ok || payload.status === 'REQUEST_DENIED' || payload.status === 'OVER_QUERY_LIMIT') {
    throw new Error(payload.error_message || 'Google Maps request failed');
  }

  // Google can return INVALID_REQUEST for a fresh page token for ~2s.
  if (payload.status === 'INVALID_REQUEST' && params?.pagetoken && attempt < 2) {
    await delay(NEXT_PAGE_TOKEN_DELAY_MS);
    return requestGoogleNearby(params, attempt + 1);
  }

  if (payload.status === 'INVALID_REQUEST') {
    throw new Error(payload.error_message || 'Google Maps request failed');
  }

  return payload;
}

export function toRestaurantResponse(restaurant, distanceMap = {}) {
  const id = stringifyId(restaurant?._id);
  const distanceMeters = Number.isFinite(restaurant?.distanceMeters)
    ? restaurant.distanceMeters
    : distanceMap[id] ?? null;

  return {
    _id: id,
    name: restaurant?.name || 'Unknown Restaurant',
    address: restaurant?.address || '',
    googlePlaceId: restaurant?.googlePlaceId || '',
    distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : null,
    distance: formatDistance(distanceMeters),
    openNow: typeof restaurant?.openNow === 'boolean' ? restaurant.openNow : null,
    rating: Number.isFinite(Number(restaurant?.rating)) ? Number(restaurant.rating) : null,
    totalRatings: Number.isFinite(Number(restaurant?.totalRatings)) ? Number(restaurant.totalRatings) : 0,
    mapsUrl: restaurant?.mapsUrl || '',
  };
}

function buildOfferMap(offers) {
  const offerMap = {};
  offers.forEach((offer) => {
    const restaurantKey = stringifyId(offer.restaurantId);
    if (restaurantKey && !offerMap[restaurantKey]) {
      offerMap[restaurantKey] = offer.title;
    }
  });
  return offerMap;
}

function mapDishes(dishes, distanceMap = {}, offerMap = {}) {
  return dishes.map((dish) => {
    const restaurantKey = stringifyId(dish.restaurantId?._id);
    return {
      _id: dish._id,
      name: dish.restaurantId?.name || 'Unknown Restaurant',
      restaurantPlaceId: dish.restaurantId?.googlePlaceId || null,
      dish: dish.name,
      price: `\u20B9${dish.price}`,
      rating: dish.averageRating?.toFixed(1) || '0.0',
      reviews: `${dish.totalReviews || 0} reviews`,
      distance: formatDistance(distanceMap[restaurantKey]),
      category: dish.category || '',
      offer: offerMap[restaurantKey] || null,
    };
  });
}

function calculateHaversineMeters(origin, target) {
  const lat1 = Number(origin?.lat);
  const lng1 = Number(origin?.lng);
  const lat2 = Number(target?.lat);
  const lng2 = Number(target?.lng);
  if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) {
    return null;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

async function fetchNearbyPlacesFromGoogle({ lat, lng, radius }) {
  if (!MAPS_API_KEY) {
    return {
      places: [],
      status: 'NO_API_KEY',
      syncedCount: 0,
    };
  }

  const places = [];
  const seenPlaceIds = new Set();
  let status = 'UNKNOWN';
  let nextPageToken = null;

  for (let pageIndex = 0; pageIndex < MAX_PLACE_PAGES && places.length < MAX_PLACES; pageIndex += 1) {
    const payload = await requestGoogleNearby(
      nextPageToken
        ? { pagetoken: nextPageToken }
        : {
            location: `${lat},${lng}`,
            radius: String(radius),
            type: 'restaurant',
          }
    );

    status = payload.status || status;
    if (payload.status === 'ZERO_RESULTS') {
      break;
    }

    const normalized = (payload.results || []).map(normalizeNearbyPlace);
    normalized.forEach((place) => {
      if (!place.id || seenPlaceIds.has(place.id) || places.length >= MAX_PLACES) {
        return;
      }
      seenPlaceIds.add(place.id);
      places.push(place);
    });

    nextPageToken = payload.next_page_token || null;
    if (!nextPageToken || places.length >= MAX_PLACES) {
      break;
    }

    if (pageIndex < MAX_PLACE_PAGES - 1) {
      await delay(NEXT_PAGE_TOKEN_DELAY_MS);
    }
  }

  return {
    places,
    status,
    syncedCount: 0,
  };
}

async function syncRestaurantsFromPlaces(places) {
  const syncCandidates = places.filter(
    (place) => place.location?.lng != null && place.location?.lat != null
  );

  const syncResults = await Promise.all(
    syncCandidates.map(async (place) => {
      const filter = place.id
        ? { googlePlaceId: place.id }
        : { name: place.name, address: place.address };

      try {
        await Restaurant.findOneAndUpdate(
          filter,
          {
            $set: {
              name: place.name,
              googlePlaceId: place.id,
              address: place.address,
              location: {
                type: 'Point',
                coordinates: [place.location.lng, place.location.lat],
              },
              rating: place.rating,
              totalRatings: place.totalRatings,
              openNow: place.openNow,
              mapsUrl: place.mapsUrl,
              source: 'google-maps',
              lastSyncedAt: new Date(),
            },
          },
          {
            upsert: true,
            returnDocument: 'after',
            setDefaultsOnInsert: true,
          }
        );
        return true;
      } catch (syncError) {
        console.error('location service sync error:', syncError);
        return false;
      }
    })
  );

  return syncResults.filter(Boolean).length;
}

async function getGeoRestaurants({ lat, lng, radius }) {
  return Restaurant.aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        distanceField: 'distanceMeters',
        maxDistance: radius,
        spherical: true,
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        address: 1,
        googlePlaceId: 1,
        distanceMeters: 1,
        openNow: 1,
        rating: 1,
        totalRatings: 1,
        mapsUrl: 1,
      },
    },
  ]);
}

export async function getRestaurantsByPlaceIds(placeIds) {
  const normalized = parsePlaceIds(placeIds?.join ? placeIds.join(',') : placeIds);
  if (normalized.length === 0) return [];

  return Restaurant.find({ googlePlaceId: { $in: normalized } })
    .select('name address googlePlaceId openNow rating totalRatings mapsUrl location')
    .lean();
}

export async function getAllRestaurants() {
  const restaurants = await Restaurant.find({})
    .sort({ name: 1 })
    .select('name address googlePlaceId openNow rating totalRatings mapsUrl')
    .lean();

  return restaurants.map((restaurant) => toRestaurantResponse(restaurant));
}

export async function getGlobalSearchResults() {
  const dishes = await Dish.find({})
    .populate('restaurantId')
    .lean();

  const activeOffers = await Offer.find({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();

  const offerMap = buildOfferMap(activeOffers);
  return dishes.map((dish) => {
    const restaurantKey = stringifyId(dish.restaurantId?._id);
    return {
      _id: dish._id,
      name: dish.restaurantId?.name || 'Unknown Restaurant',
      restaurantPlaceId: dish.restaurantId?.googlePlaceId || null,
      dish: dish.name,
      price: `\u20B9${dish.price}`,
      rating: dish.averageRating?.toFixed(1) || '0.0',
      reviews: `${dish.totalReviews || 0} reviews`,
      distance: '\u2014',
      category: dish.category || '',
      offer: offerMap[restaurantKey] || null,
    };
  });
}

export async function getLocationContext(input) {
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Valid lat and lng are required.');
  }

  const radius = clampRadius(input?.radius || DEFAULT_RADIUS_METERS);
  const location = { lat, lng, radius };

  const mapsResult = await fetchNearbyPlacesFromGoogle({ lat, lng, radius });
  const syncedCount = mapsResult.places.length > 0
    ? await syncRestaurantsFromPlaces(mapsResult.places)
    : 0;

  const geoRestaurants = await getGeoRestaurants({ lat, lng, radius });
  const fallbackPlaceIds = mapsResult.places.map((place) => place.id).filter(Boolean);

  let restaurantDocs = geoRestaurants;
  if (restaurantDocs.length === 0 && fallbackPlaceIds.length > 0) {
    restaurantDocs = await getRestaurantsByPlaceIds(fallbackPlaceIds);
  }

  const distanceMap = {};
  restaurantDocs.forEach((restaurant) => {
    const id = stringifyId(restaurant._id);

    if (Number.isFinite(restaurant.distanceMeters)) {
      distanceMap[id] = restaurant.distanceMeters;
      return;
    }

    const placeId = restaurant.googlePlaceId;
    const matchingPlace = mapsResult.places.find((place) => place.id === placeId);
    if (matchingPlace?.location) {
      const meters = calculateHaversineMeters(location, matchingPlace.location);
      if (Number.isFinite(meters)) {
        distanceMap[id] = meters;
      }
    }
  });

  const restaurants = restaurantDocs.map((restaurant) => toRestaurantResponse(restaurant, distanceMap));
  const restaurantIds = restaurants.map((restaurant) => restaurant._id);

  const dishes = restaurantIds.length > 0
    ? await Dish.find({ restaurantId: { $in: restaurantIds } }).populate('restaurantId').lean()
    : [];

  const activeOffers = await Offer.find({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();

  const offerMap = buildOfferMap(activeOffers);

  return {
    location,
    status: mapsResult.status,
    syncedCount,
    places: mapsResult.places,
    restaurants,
    dishes: mapDishes(dishes, distanceMap, offerMap),
  };
}
