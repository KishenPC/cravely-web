// pages/api/search-results.js
import dbConnect from '../../lib/db';
import { Dish, Offer, Restaurant } from '../../lib/schemas';

const DEFAULT_RADIUS_METERS = 2000;
const MIN_RADIUS_METERS = 500;
const MAX_RADIUS_METERS = 5000;

function stringifyId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;

  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') {
      return value.toHexString();
    }

    if (value._id && value._id !== value) {
      return stringifyId(value._id);
    }
  }

  return String(value);
}

function clampRadius(value) {
  const numeric = Number(value || DEFAULT_RADIUS_METERS);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_RADIUS_METERS;
  }

  return Math.min(Math.max(numeric, MIN_RADIUS_METERS), MAX_RADIUS_METERS);
}

function formatDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return '\u2014';
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

async function getNearbyRestaurantDistanceMap({ lat, lng, radius }) {
  const nearbyRestaurants = await Restaurant.aggregate([
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
        distanceMeters: 1,
      },
    },
  ]);

  const distanceMap = {};
  nearbyRestaurants.forEach((restaurant) => {
    distanceMap[stringifyId(restaurant._id)] = restaurant.distanceMeters;
  });

  return distanceMap;
}

export default async function handler(req, res) {
  try {
    await dbConnect();

    if (req.method !== 'GET') {
      res.status(405).end();
      return;
    }

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasLocationFilter = Number.isFinite(lat) && Number.isFinite(lng);
    const radius = clampRadius(req.query.radius);

    const distanceMap = hasLocationFilter
      ? await getNearbyRestaurantDistanceMap({ lat, lng, radius })
      : {};

    const restaurantIds = Object.keys(distanceMap);
    const dishFilter = hasLocationFilter
      ? { restaurantId: { $in: restaurantIds } }
      : {};

    const dishes = await Dish.find(dishFilter)
      .populate('restaurantId')
      .lean();

    const activeOffers = await Offer.find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    const offerMap = {};
    activeOffers.forEach((offer) => {
      const restaurantKey = stringifyId(offer.restaurantId);
      if (restaurantKey && !offerMap[restaurantKey]) {
        offerMap[restaurantKey] = offer.title;
      }
    });

    const results = dishes.map((dish) => {
      const restaurantKey = stringifyId(dish.restaurantId?._id);
      return {
        _id: dish._id,
        name: dish.restaurantId?.name || 'Unknown Restaurant',
        dish: dish.name,
        price: `\u20B9${dish.price}`,
        rating: dish.averageRating?.toFixed(1) || '0.0',
        reviews: `${dish.totalReviews || 0} reviews`,
        distance: hasLocationFilter ? formatDistance(distanceMap[restaurantKey]) : '\u2014',
        category: dish.category || '',
        offer: offerMap[restaurantKey] || null,
      };
    });

    res.status(200).json(results);
  } catch (error) {
    console.error('API /search-results error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
