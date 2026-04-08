/**
 * seed-more.js
 * Adds additional sample data without dropping existing collections.
 *
 * Run: node scripts/seed-more.js
 */

require('dotenv').config({ path: '.env.local' })
require('dotenv').config()

const mongoose = require('mongoose')
const {
  User,
  Restaurant,
  Dish,
  Review,
  Offer,
  Reward,
} = require('../lib/schemas')

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in environment')
  process.exit(1)
}

const DAY = 24 * 60 * 60 * 1000

async function upsertUser(user) {
  return User.findOneAndUpdate(
    { email: user.email.toLowerCase() },
    {
      $setOnInsert: {
        name: user.name,
        email: user.email.toLowerCase(),
        college: user.college || '',
        provider: 'credentials',
      },
      $set: {
        points: user.points,
        totalReviews: user.totalReviews,
        totalUpvotes: user.totalUpvotes,
        totalPhotos: user.totalPhotos,
      },
    },
    { upsert: true, returnDocument: 'after' }
  )
}

async function upsertRestaurant(restaurant) {
  return Restaurant.findOneAndUpdate(
    { name: restaurant.name },
    {
      $setOnInsert: {
        name: restaurant.name,
        address: restaurant.address,
        location: restaurant.location,
      },
    },
    { upsert: true, returnDocument: 'after' }
  )
}

async function upsertDish(restaurantId, dish) {
  return Dish.findOneAndUpdate(
    { name: dish.name, restaurantId },
    {
      $setOnInsert: {
        name: dish.name,
        price: dish.price,
        averageRating: dish.averageRating,
        totalReviews: dish.totalReviews,
        category: dish.category,
        restaurantId,
      },
    },
    { upsert: true, returnDocument: 'after' }
  )
}

async function upsertReview(review) {
  return Review.findOneAndUpdate(
    {
      userId: review.userId,
      dishId: review.dishId,
      text: review.text,
    },
    {
      $setOnInsert: review,
    },
    { upsert: true, returnDocument: 'after' }
  )
}

async function refreshDishStats() {
  const dishStats = await Review.aggregate([
    {
      $group: {
        _id: '$dishId',
        totalReviews: { $sum: 1 },
        averageRating: { $avg: '$rating' },
      },
    },
  ])

  for (const stat of dishStats) {
    await Dish.findByIdAndUpdate(stat._id, {
      totalReviews: stat.totalReviews,
      averageRating: Number(stat.averageRating.toFixed(1)),
    })
  }
}

async function refreshUserStats() {
  const userStats = await Review.aggregate([
    {
      $project: {
        userId: 1,
        upvotes: 1,
        photosCount: { $size: { $ifNull: ['$photos', []] } },
      },
    },
    {
      $group: {
        _id: '$userId',
        totalReviews: { $sum: 1 },
        totalUpvotes: { $sum: '$upvotes' },
        totalPhotos: { $sum: '$photosCount' },
      },
    },
  ])

  for (const stat of userStats) {
    await User.findByIdAndUpdate(stat._id, {
      totalReviews: stat.totalReviews,
      totalUpvotes: stat.totalUpvotes,
      totalPhotos: stat.totalPhotos,
      points: stat.totalReviews * 12 + stat.totalUpvotes * 2,
    })
  }
}

async function seedMore() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  const now = new Date()

  const users = await Promise.all([
    upsertUser({
      name: 'Anaya Shah',
      email: 'anaya@example.com',
      college: 'IIT Bombay',
      points: 96,
      totalReviews: 6,
      totalUpvotes: 12,
      totalPhotos: 2,
    }),
    upsertUser({
      name: 'Kunal Verma',
      email: 'kunal@example.com',
      college: 'Delhi University',
      points: 74,
      totalReviews: 5,
      totalUpvotes: 7,
      totalPhotos: 1,
    }),
    upsertUser({
      name: 'Sara Iqbal',
      email: 'sara@example.com',
      college: 'Manipal University',
      points: 61,
      totalReviews: 4,
      totalUpvotes: 6,
      totalPhotos: 1,
    }),
    upsertUser({
      name: 'Harsh Rana',
      email: 'harsh@example.com',
      college: 'Amity University',
      points: 54,
      totalReviews: 3,
      totalUpvotes: 5,
      totalPhotos: 0,
    }),
  ])

  const restaurants = await Promise.all([
    upsertRestaurant({
      name: 'Campus Bites',
      address: 'Sector 18, Noida',
      location: { type: 'Point', coordinates: [77.3260, 28.5672] },
    }),
    upsertRestaurant({
      name: 'Momo Station',
      address: 'FC Road, Pune',
      location: { type: 'Point', coordinates: [73.8417, 18.5204] },
    }),
    upsertRestaurant({
      name: 'Tandoori Theory',
      address: 'Koramangala, Bengaluru',
      location: { type: 'Point', coordinates: [77.6100, 12.9352] },
    }),
    upsertRestaurant({
      name: 'South Spice Hub',
      address: 'Hitech City, Hyderabad',
      location: { type: 'Point', coordinates: [78.3818, 17.4435] },
    }),
  ])

  const dishMap = {}

  const dishesByRestaurant = [
    {
      restaurant: restaurants[0],
      dishes: [
        { name: 'Cheese Maggi', price: 90, averageRating: 4.2, totalReviews: 0, category: 'Snacks' },
        { name: 'Veg Loaded Sandwich', price: 110, averageRating: 4.0, totalReviews: 0, category: 'Snacks' },
        { name: 'Cold Coffee', price: 75, averageRating: 4.1, totalReviews: 0, category: 'Beverage' },
      ],
    },
    {
      restaurant: restaurants[1],
      dishes: [
        { name: 'Chicken Steam Momos', price: 130, averageRating: 4.5, totalReviews: 0, category: 'Main Course' },
        { name: 'Paneer Afghani Momos', price: 140, averageRating: 4.3, totalReviews: 0, category: 'Main Course' },
        { name: 'Peri Peri Fries', price: 99, averageRating: 4.0, totalReviews: 0, category: 'Snacks' },
      ],
    },
    {
      restaurant: restaurants[2],
      dishes: [
        { name: 'Tandoori Chicken Bowl', price: 240, averageRating: 4.6, totalReviews: 0, category: 'Main Course' },
        { name: 'Paneer Tikka Wrap', price: 170, averageRating: 4.1, totalReviews: 0, category: 'Main Course' },
        { name: 'Mint Lemon Soda', price: 65, averageRating: 4.0, totalReviews: 0, category: 'Beverage' },
      ],
    },
    {
      restaurant: restaurants[3],
      dishes: [
        { name: 'Mini Idli Sambar', price: 95, averageRating: 4.4, totalReviews: 0, category: 'Breakfast' },
        { name: 'Ghee Podi Dosa', price: 145, averageRating: 4.7, totalReviews: 0, category: 'Breakfast' },
        { name: 'Filter Coffee', price: 55, averageRating: 4.5, totalReviews: 0, category: 'Beverage' },
      ],
    },
  ]

  for (const group of dishesByRestaurant) {
    for (const dish of group.dishes) {
      const savedDish = await upsertDish(group.restaurant._id, dish)
      dishMap[`${group.restaurant.name}:${dish.name}`] = savedDish
    }
  }

  const reviewPayloads = [
    {
      user: users[0],
      restaurant: restaurants[0],
      dishKey: 'Campus Bites:Cheese Maggi',
      rating: 5,
      text: 'Perfect midnight snack. Cheesy and spicy in the right balance.',
      tags: ['late-night', 'value-for-money'],
      upvotes: 9,
    },
    {
      user: users[1],
      restaurant: restaurants[0],
      dishKey: 'Campus Bites:Veg Loaded Sandwich',
      rating: 4,
      text: 'Crispy bread and fresh veggies. Portion size is good for the price.',
      tags: ['filling', 'quick-bite'],
      upvotes: 5,
    },
    {
      user: users[2],
      restaurant: restaurants[1],
      dishKey: 'Momo Station:Chicken Steam Momos',
      rating: 5,
      text: 'Juicy filling and the red chutney is addictive.',
      tags: ['must-try', 'spicy'],
      upvotes: 11,
    },
    {
      user: users[3],
      restaurant: restaurants[1],
      dishKey: 'Momo Station:Paneer Afghani Momos',
      rating: 4,
      text: 'Creamy paneer filling, great texture. Slightly expensive but worth it.',
      tags: ['creamy', 'premium'],
      upvotes: 4,
    },
    {
      user: users[0],
      restaurant: restaurants[2],
      dishKey: 'Tandoori Theory:Tandoori Chicken Bowl',
      rating: 5,
      text: 'Smoky flavor and tender pieces. Great for lunch.',
      tags: ['protein', 'lunch-favorite'],
      upvotes: 8,
    },
    {
      user: users[2],
      restaurant: restaurants[3],
      dishKey: 'South Spice Hub:Ghee Podi Dosa',
      rating: 5,
      text: 'Crispy edges and authentic podi taste. One of the best dosas around.',
      tags: ['crispy', 'authentic'],
      upvotes: 10,
    },
    {
      user: users[1],
      restaurant: restaurants[3],
      dishKey: 'South Spice Hub:Filter Coffee',
      rating: 4,
      text: 'Strong and aromatic. Perfect ending to breakfast.',
      tags: ['beverage', 'classic'],
      upvotes: 6,
    },
    {
      user: users[3],
      restaurant: restaurants[2],
      dishKey: 'Tandoori Theory:Paneer Tikka Wrap',
      rating: 4,
      text: 'Soft wrap with smoky paneer filling. Good on-the-go option.',
      tags: ['wrap', 'on-the-go'],
      upvotes: 5,
    },
  ]

  for (const reviewData of reviewPayloads) {
    const dish = dishMap[reviewData.dishKey]
    if (!dish) continue

    await upsertReview({
      userId: reviewData.user._id,
      dishId: dish._id,
      restaurantId: reviewData.restaurant._id,
      rating: reviewData.rating,
      text: reviewData.text,
      tags: reviewData.tags,
      photos: [],
      upvotes: reviewData.upvotes,
      upvotedBy: [],
    })
  }

  const offers = [
    {
      restaurantId: restaurants[0]._id,
      title: 'Student Combo at ₹149',
      description: 'Cheese Maggi + Cold Coffee, valid after 4 PM.',
      startTime: now,
      endTime: new Date(now.getTime() + 10 * DAY),
      isActive: true,
      maxClaims: 200,
      currentClaims: 18,
    },
    {
      restaurantId: restaurants[1]._id,
      title: 'Free Drink with Momos',
      description: 'Order any momo platter and get mint soda free.',
      startTime: now,
      endTime: new Date(now.getTime() + 8 * DAY),
      isActive: true,
      maxClaims: 120,
      currentClaims: 22,
    },
    {
      restaurantId: restaurants[3]._id,
      title: 'Breakfast Special 15% Off',
      description: 'Valid from 8 AM to 11 AM on all breakfast dishes.',
      startTime: now,
      endTime: new Date(now.getTime() + 12 * DAY),
      isActive: true,
      maxClaims: 150,
      currentClaims: 30,
    },
  ]

  for (const offer of offers) {
    await Offer.findOneAndUpdate(
      { restaurantId: offer.restaurantId, title: offer.title },
      { $setOnInsert: offer },
      { upsert: true, returnDocument: 'after' }
    )
  }

  const rewards = [
    {
      title: 'Free Cold Coffee',
      description: 'Redeem at selected cafe partners.',
      pointsCost: 70,
      isActive: true,
    },
    {
      title: '20% Off Main Course',
      description: 'Valid once per user, weekdays only.',
      pointsCost: 140,
      isActive: true,
    },
    {
      title: 'Weekend Feast Pass',
      description: 'Priority access to combo meal deals.',
      pointsCost: 220,
      isActive: true,
    },
  ]

  for (const reward of rewards) {
    await Reward.findOneAndUpdate(
      { title: reward.title },
      { $setOnInsert: reward },
      { upsert: true, returnDocument: 'after' }
    )
  }

  await refreshDishStats()
  await refreshUserStats()

  const [userCount, restaurantCount, dishCount, reviewCount, offerCount, rewardCount] = await Promise.all([
    User.countDocuments(),
    Restaurant.countDocuments(),
    Dish.countDocuments(),
    Review.countDocuments(),
    Offer.countDocuments(),
    Reward.countDocuments(),
  ])

  console.log('Seed more complete:')
  console.log(`Users: ${userCount}`)
  console.log(`Restaurants: ${restaurantCount}`)
  console.log(`Dishes: ${dishCount}`)
  console.log(`Reviews: ${reviewCount}`)
  console.log(`Offers: ${offerCount}`)
  console.log(`Rewards: ${rewardCount}`)

  await mongoose.disconnect()
}

seedMore().catch(async (err) => {
  console.error('seed-more failed:', err)
  try {
    await mongoose.disconnect()
  } catch (_) {
    // ignore disconnect errors
  }
  process.exit(1)
})
