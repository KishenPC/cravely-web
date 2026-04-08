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

function formatReview(reviewDoc) {
  const review = reviewDoc.toObject ? reviewDoc.toObject() : reviewDoc;
  const reviewerName = review.userId?.name || 'Anonymous';
  const initials = reviewerName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'A';

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

      const { dishId, rating, text, tags, restaurantId, newDishName, price, category } = req.body || {};
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

        if (!normalizedDishName || !restaurantId || !Number.isFinite(numericPrice) || numericPrice <= 0) {
          res.status(400).json({
            error: 'restaurantId, newDishName, and a valid price are required when adding a new dish.',
          });
          return;
        }

        if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
          res.status(400).json({ error: 'Selected restaurant is invalid.' });
          return;
        }

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
          res.status(404).json({ error: 'Selected restaurant was not found.' });
          return;
        }

        dish = await Dish.findOne({
          restaurantId,
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

      const parsedTags = parseTags(tags);

      const review = await Review.create({
        userId: user._id,
        dishId: dish._id,
        restaurantId: dish.restaurantId,
        rating: numericRating,
        text: trimmedText,
        tags: parsedTags,
        photos: [],
      });

      await Promise.all([
        refreshDishStats(dish._id),
        refreshUserStats(user._id),
      ]);

      const populated = await Review.findById(review._id)
        .populate('userId', 'name')
        .populate('dishId', 'name')
        .populate('restaurantId', 'name');

      const formatted = formatReview(populated);
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
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
