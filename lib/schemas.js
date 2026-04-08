const mongoose = require('mongoose');
const { Schema } = mongoose;

// 1. Users
const userSchema = new Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String },            // null for Google-only users
  image:     { type: String },            // profile picture URL
  provider:  { type: String, default: 'credentials' }, // 'credentials' or 'google'
  college:   { type: String, default: '' },
  points:    { type: Number, default: 0, min: 0 },
  totalPointsEarned: { type: Number, default: 0, min: 0 },
  totalPointsSpent: { type: Number, default: 0, min: 0 },
  totalReviews: { type: Number, default: 0, min: 0 },
  totalUpvotes: { type: Number, default: 0, min: 0 },
  totalPhotos:  { type: Number, default: 0, min: 0 }
}, { timestamps: true });


// 2. Restaurants
const restaurantSchema = new Schema({
  name:     { type: String, required: true },
  googlePlaceId: { type: String },
  address:  { type: String },
  location: {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  rating: { type: Number, default: null },
  totalRatings: { type: Number, default: 0 },
  openNow: { type: Boolean, default: null },
  mapsUrl: { type: String, default: '' },
  lastSyncedAt: { type: Date, default: Date.now },
  source: { type: String, default: 'manual' }
}, { timestamps: true });

restaurantSchema.index({ location: '2dsphere' });
restaurantSchema.index({ googlePlaceId: 1 }, { unique: true, sparse: true });


// 3. Dishes
const dishSchema = new Schema({
  name:           { type: String, required: true },
  price:          { type: Number, required: true, min: 0 },
  averageRating:  { type: Number, default: 0, min: 0 },
  totalReviews:   { type: Number, default: 0, min: 0 },
  category:       { type: String },
  restaurantId:   { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true }
}, { timestamps: true });

dishSchema.index({ restaurantId: 1 });
dishSchema.index({ name: "text" });


// 4. Reviews
const reviewSchema = new Schema({
  userId:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  dishId:        { type: Schema.Types.ObjectId, ref: 'Dish', required: true },
  restaurantId:  { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  rating:        { type: Number, required: true, min: 1, max: 5 },
  text:          { type: String, required: true },
  tags:          { type: [String], default: [] },
  photos:        { type: [String], default: [] },
  upvotes:       { type: Number, default: 0, min: 0 },
  upvotedBy:     [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

reviewSchema.index({ userId: 1 });
reviewSchema.index({ dishId: 1 });
reviewSchema.index({ restaurantId: 1 });
reviewSchema.index({ restaurantId: 1, rating: -1 });


// 5. Offers
const offerSchema = new Schema({
  restaurantId:  { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  title:         { type: String, required: true },
  description:   { type: String },
  pointsCost:    { type: Number, default: 25, min: 1 },
  startTime:     { type: Date },
  endTime:       { type: Date },
  isActive:      { type: Boolean, default: true },
  maxClaims:     { type: Number },
  currentClaims: { type: Number, default: 0 }
}, { timestamps: true });

offerSchema.index({ restaurantId: 1 });
offerSchema.index({ isActive: 1, endTime: 1 });


// 6. Rewards
const rewardSchema = new Schema({
  title:        { type: String, required: true },
  description:  { type: String },
  pointsCost:   { type: Number, required: true, min: 1 },
  isActive:     { type: Boolean, default: true }
}, { timestamps: true });


// 7. Redemptions
const redemptionSchema = new Schema({
  userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rewardId:    { type: Schema.Types.ObjectId, ref: 'Reward' },
  offerId:     { type: Schema.Types.ObjectId, ref: 'Offer' },
  redemptionType: { type: String, enum: ['reward', 'offer'], default: 'reward' },
  pointsSpent: { type: Number, required: true, min: 1 },
  redeemedAt:  { type: Date, default: Date.now }
}, { timestamps: true });

redemptionSchema.index({ userId: 1 });
redemptionSchema.index({ rewardId: 1 });
redemptionSchema.index({ offerId: 1 });


// ----- Model Exports -----
module.exports = {
  User:        mongoose.models.User || mongoose.model('User', userSchema),
  Restaurant:  mongoose.models.Restaurant || mongoose.model('Restaurant', restaurantSchema),
  Dish:        mongoose.models.Dish || mongoose.model('Dish', dishSchema),
  Review:      mongoose.models.Review || mongoose.model('Review', reviewSchema),
  Offer:       mongoose.models.Offer || mongoose.model('Offer', offerSchema),
  Reward:      mongoose.models.Reward || mongoose.model('Reward', rewardSchema),
  Redemption:  mongoose.models.Redemption || mongoose.model('Redemption', redemptionSchema),
};
