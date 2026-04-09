// pages/api/reviews.js
import mongoose from 'mongoose';
import dbConnect from '../../lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { Dish, Restaurant, Review, User } from '../../lib/schemas';

const REVIEW_POINT_VALUE = 2;
const UPVOTE_POINT_VALUE = 2;

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

function buildInitials(name) {
  return String(name || 'Anonymous')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'A';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDishName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function parseTags(tags) {
  return (Array.isArray(tags) ? tags : String(tags || '').split(','))
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildDishOption(dishName, restaurantName, dishId) {
  return {
    id: stringifyId(dishId),
    label: `${dishName} (${restaurantName})`,
  };
}

function normalizeRestaurantPayload(payload) {
  const placeId = String(payload?.googlePlaceId || '').trim();
  const name = String(payload?.name || '').trim();
  const address = String(payload?.address || '').trim();
  const lat = Number(payload?.location?.lat);
  const lng = Number(payload?.location?.lng);

  return {
    placeId,
    name,
    address,
    lat,
    lng,
    mapsUrl: String(payload?.mapsUrl || '').trim(),
    rating: Number.isFinite(Number(payload?.rating)) ? Number(payload.rating) : null,
    totalRatings: Number.isFinite(Number(payload?.totalRatings)) ? Number(payload.totalRatings) : 0,
    openNow: typeof payload?.openNow === 'boolean' ? payload.openNow : null,
  };
}

function formatReview(reviewDoc) {
  const review = reviewDoc.toObject ? reviewDoc.toObject() : reviewDoc;
  const reviewerName = review.userId?.name || 'Anonymous';
  const initials = buildInitials(reviewerName);

  return {
    _id: stringifyId(review._id),
    dishId: stringifyId(review.dishId),
    restaurantId: stringifyId(review.restaurantId),
    name: reviewerName,
    initials,
    date: new Date(review.createdAt || Date.now()).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    stars: review.rating || 0,
    text: review.text || '',
    tags: Array.isArray(review.tags) ? review.tags : [],
    upvotes: review.upvotes || 0,
    dish: review.dishId?.name || '',
    restaurant: review.restaurantId?.name || '',
  };
}

async function refreshDishStats(dishId) {
  const [stats] = await Review.aggregate([
    { $match: { dishId } },
    {
      $group: {
        _id: '$dishId',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  await Dish.findByIdAndUpdate(dishId, {
    averageRating: stats?.averageRating || 0,
    totalReviews: stats?.totalReviews || 0,
  });
}

async function refreshUserStats(userId) {
  const [stats] = await Review.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: '$userId',
        totalReviews: { $sum: 1 },
        totalUpvotes: { $sum: '$upvotes' },
        totalPhotos: {
          $sum: {
            $size: {
              $ifNull: ['$photos', []],
            },
          },
        },
      },
    },
  ]);

  const totalReviews = stats?.totalReviews || 0;
  const totalUpvotes = stats?.totalUpvotes || 0;
  const totalPhotos = stats?.totalPhotos || 0;
  const earnedPoints = totalReviews * REVIEW_POINT_VALUE + totalUpvotes * UPVOTE_POINT_VALUE;

  const existingUser = await User.findById(userId).select('totalPointsSpent').lean();
  const totalPointsSpent = Math.max(0, Number(existingUser?.totalPointsSpent || 0));
  const availablePoints = Math.max(0, earnedPoints - totalPointsSpent);

  await User.findByIdAndUpdate(userId, {
    totalReviews,
    totalUpvotes,
    totalPhotos,
    totalPointsEarned: earnedPoints,
    points: availablePoints,
  });
}

function getKnownApiError(error) {
  if (!error) return null;

  if (error.name === 'ValidationError') {
    const firstMessage = Object.values(error.errors || {})[0]?.message;
    return {
      status: 400,
      message: firstMessage || 'Invalid review payload.',
    };
  }

  if (error.name === 'CastError') {
    return {
      status: 400,
      message: 'Invalid id or payload format.',
    };
  }

  if (error.code === 11000) {
    return {
      status: 409,
      message: 'A duplicate record was detected. Please refresh and try again.',
    };
  }

  return null;
}

export default async function handler(req, res) {
  try {
    await dbConnect();

    if (req.method === 'GET') {
      const reviews = await Review.find({})
        .populate('userId', 'name')
        .populate('dishId', 'name')
        .populate('restaurantId', 'name')
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json(reviews.map(formatReview));
      return;
    }

    if (req.method === 'POST') {
      const session = await getServerSession(req, res, authOptions);
      if (!session?.user?.email) {
        res.status(401).json({ error: 'Please sign in to submit a review.' });
        return;
      }

      const {
        dishId,
        rating,
        text,
        tags,
        restaurantId,
        newDishName,
        price,
        category,
        newRestaurant,
      } = req.body || {};
      const trimmedText = String(text || '').trim();

      if (!rating || !trimmedText) {
        res.status(400).json({ error: 'rating and text are required.' });
        return;
      }

      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
        return;
      }

      const user = await User.findOne({ email: session.user.email.toLowerCase() });
      if (!user) {
        res.status(401).json({ error: 'User account not found. Please sign in again.' });
        return;
      }

      let dish = null;
      let createdDish = false;

      if (dishId) {
        if (!mongoose.Types.ObjectId.isValid(dishId)) {
          res.status(400).json({ error: 'Selected dish is invalid.' });
          return;
        }

        dish = await Dish.findById(dishId);
        if (!dish) {
          res.status(404).json({ error: 'Selected dish was not found.' });
          return;
        }
      } else {
        const normalizedDishName = normalizeDishName(newDishName);
        const numericPrice = Number(price);
        const normalizedCategory = String(category || '').trim();

        if (!normalizedDishName || !Number.isFinite(numericPrice) || numericPrice <= 0) {
          res.status(400).json({
            error: 'newDishName and a valid price are required when adding a new dish.',
          });
          return;
        }

        let restaurant = null;

        if (restaurantId) {
          if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
            res.status(400).json({ error: 'Selected restaurant is invalid.' });
            return;
          }

          restaurant = await Restaurant.findById(restaurantId);
          if (!restaurant) {
            res.status(404).json({ error: 'Selected restaurant was not found.' });
            return;
          }
        } else if (newRestaurant) {
          const normalizedRestaurant = normalizeRestaurantPayload(newRestaurant);
          const hasCoords = Number.isFinite(normalizedRestaurant.lat) && Number.isFinite(normalizedRestaurant.lng);
          if (!normalizedRestaurant.name || !hasCoords) {
            res.status(400).json({ error: 'Nearby restaurant payload is invalid.' });
            return;
          }

          const filter = normalizedRestaurant.placeId
            ? { googlePlaceId: normalizedRestaurant.placeId }
            : { name: normalizedRestaurant.name, address: normalizedRestaurant.address };

          restaurant = await Restaurant.findOneAndUpdate(
            filter,
            {
              $set: {
                name: normalizedRestaurant.name,
                googlePlaceId: normalizedRestaurant.placeId || undefined,
                address: normalizedRestaurant.address,
                location: {
                  type: 'Point',
                  coordinates: [normalizedRestaurant.lng, normalizedRestaurant.lat],
                },
                rating: normalizedRestaurant.rating,
                totalRatings: normalizedRestaurant.totalRatings,
                openNow: normalizedRestaurant.openNow,
                mapsUrl: normalizedRestaurant.mapsUrl,
                source: 'google-maps',
                lastSyncedAt: new Date(),
              },
            },
            {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true,
            }
          );
        } else {
          res.status(400).json({ error: 'restaurantId or nearby restaurant data is required.' });
          return;
        }

        dish = await Dish.findOne({
          restaurantId: restaurant._id,
          name: new RegExp(`^${escapeRegExp(normalizedDishName)}$`, 'i'),
        });

        if (!dish) {
          dish = await Dish.create({
            name: normalizedDishName,
            price: numericPrice,
            averageRating: 0,
            totalReviews: 0,
            category: normalizedCategory,
            restaurantId: restaurant._id,
          });
          createdDish = true;
        }
      }

      const resolvedRestaurantId = stringifyId(dish?.restaurantId);
      if (!resolvedRestaurantId || !mongoose.Types.ObjectId.isValid(resolvedRestaurantId)) {
        res.status(400).json({
          error: 'Selected dish is not linked to a valid restaurant. Please pick another dish or create it again.',
        });
        return;
      }

      const parsedTags = parseTags(tags);

      const review = await Review.create({
        userId: user._id,
        dishId: dish._id,
        restaurantId: resolvedRestaurantId,
        rating: numericRating,
        text: trimmedText,
        tags: parsedTags,
        photos: [],
      });

      // Review creation should not fail because secondary stats refresh failed.
      // If this throws for any reason, we log it and still return success.
      try {
        await Promise.all([
          refreshDishStats(dish._id),
          refreshUserStats(user._id),
        ]);
      } catch (statsError) {
        console.error('Review stats refresh failed:', statsError);
      }

      let formatted = null;
      try {
        const populated = await Review.findById(review._id)
          .populate('userId', 'name')
          .populate('dishId', 'name')
          .populate('restaurantId', 'name');

        if (populated) {
          formatted = formatReview(populated);
        }
      } catch (populateError) {
        console.error('Review populate failed:', populateError);
      }

      if (!formatted) {
        let restaurantName = '';
        try {
          const fallbackRestaurant = await Restaurant.findById(resolvedRestaurantId).select('name').lean();
          restaurantName = fallbackRestaurant?.name || '';
        } catch {
          restaurantName = '';
        }

        const reviewerName = user.name || 'Anonymous';
        formatted = {
          _id: stringifyId(review._id),
          dishId: stringifyId(dish._id),
          restaurantId: resolvedRestaurantId,
          name: reviewerName,
          initials: buildInitials(reviewerName),
          date: new Date(review.createdAt || Date.now()).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          stars: numericRating,
          text: trimmedText,
          tags: parsedTags,
          upvotes: 0,
          dish: dish.name || '',
          restaurant: restaurantName,
        };
      }

      res.status(201).json({
        ...formatted,
        createdDish,
        dishOption: buildDishOption(formatted.dish, formatted.restaurant, formatted.dishId),
      });
      return;
    }

    res.status(405).end();
  } catch (error) {
    console.error('API /reviews error:', error);
    const knownError = getKnownApiError(error);
    if (knownError) {
      res.status(knownError.status).json({ error: knownError.message });
      return;
    }

    const message = process.env.NODE_ENV === 'development'
      ? (error?.message || 'Internal Server Error')
      : 'Internal Server Error';
    res.status(500).json({ error: message });
  }
}
