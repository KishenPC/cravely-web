import mongoose from 'mongoose';
import { getServerSession } from 'next-auth/next';
import dbConnect from '../../../lib/db';
import { Offer, Redemption, User } from '../../../lib/schemas';
import { authOptions } from '../auth/[...nextauth]';

const DEFAULT_OFFER_POINTS_COST = 25;

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

function formatOfferTime(endTime, isActive) {
  if (!endTime) {
    return isActive ? 'Limited time offer' : 'Inactive offer';
  }

  const end = new Date(endTime);
  if (Number.isNaN(end.getTime())) {
    return 'Timing unavailable';
  }

  const now = new Date();
  if (end < now) {
    return `Expired on ${end.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    })}`;
  }

  return `Ends ${end.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })}`;
}

function formatOffer(offerDoc) {
  const offer = offerDoc?.toObject ? offerDoc.toObject() : offerDoc;
  const pointsCost = typeof offer?.pointsCost === 'number' && offer.pointsCost > 0
    ? offer.pointsCost
    : DEFAULT_OFFER_POINTS_COST;
  const currentClaims = typeof offer?.currentClaims === 'number' ? offer.currentClaims : 0;
  const maxClaims = typeof offer?.maxClaims === 'number' ? offer.maxClaims : null;

  return {
    _id: stringifyId(offer?._id),
    restaurantId: stringifyId(offer?.restaurantId?._id || offer?.restaurantId),
    restaurant: offer?.restaurantId?.name || 'Unknown Restaurant',
    title: offer?.title || '',
    description: offer?.description || '',
    detail: offer?.description || '',
    startTime: offer?.startTime || null,
    endTime: offer?.endTime || null,
    time: formatOfferTime(offer?.endTime, offer?.isActive),
    isActive: typeof offer?.isActive === 'boolean' ? offer.isActive : true,
    pointsCost,
    maxClaims,
    currentClaims,
    remainingClaims: maxClaims === null ? null : Math.max(maxClaims - currentClaims, 0),
  };
}

export default async function handler(req, res) {
  try {
    await dbConnect();

    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      res.status(401).json({ error: 'Please sign in to claim offers.' });
      return;
    }

    const { offerId } = req.body || {};
    if (!offerId || !mongoose.Types.ObjectId.isValid(offerId)) {
      res.status(400).json({ error: 'A valid offerId is required.' });
      return;
    }

    const [user, offer] = await Promise.all([
      User.findOne({ email: session.user.email.toLowerCase() }),
      Offer.findById(offerId).populate('restaurantId', 'name'),
    ]);

    if (!user) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    if (!offer) {
      res.status(404).json({ error: 'Offer not found.' });
      return;
    }

    const now = new Date();
    if (!offer.isActive) {
      res.status(400).json({ error: 'This offer is currently inactive.' });
      return;
    }

    if (offer.endTime && new Date(offer.endTime) < now) {
      res.status(400).json({ error: 'This offer has expired.' });
      return;
    }

    if (typeof offer.maxClaims === 'number' && offer.currentClaims >= offer.maxClaims) {
      res.status(400).json({ error: 'This offer has reached its claim limit.' });
      return;
    }

    const pointsCost = typeof offer.pointsCost === 'number' && offer.pointsCost > 0
      ? offer.pointsCost
      : DEFAULT_OFFER_POINTS_COST;

    if (user.points < pointsCost) {
      res.status(400).json({ error: `You need ${pointsCost} points to claim this offer.` });
      return;
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        points: { $gte: pointsCost },
      },
      {
        $inc: {
          points: -pointsCost,
          totalPointsSpent: pointsCost,
        },
      },
      { new: true }
    ).lean();

    if (!updatedUser) {
      res.status(400).json({ error: `You need ${pointsCost} points to claim this offer.` });
      return;
    }

    const offerUpdateFilter = {
      _id: offer._id,
      isActive: true,
    };

    if (offer.endTime) {
      offerUpdateFilter.endTime = { $gte: now };
    }

    if (typeof offer.maxClaims === 'number') {
      offerUpdateFilter.currentClaims = { $lt: offer.maxClaims };
    }

    const updatedOffer = await Offer.findOneAndUpdate(
      offerUpdateFilter,
      { $inc: { currentClaims: 1 } },
      { new: true }
    )
      .populate('restaurantId', 'name')
      .lean();

    if (!updatedOffer) {
      await User.findByIdAndUpdate(user._id, {
        $inc: {
          points: pointsCost,
          totalPointsSpent: -pointsCost,
        },
      });

      res.status(409).json({ error: 'This offer is no longer claimable. Please refresh and try again.' });
      return;
    }

    await Redemption.create({
      userId: user._id,
      offerId: offer._id,
      redemptionType: 'offer',
      pointsSpent: pointsCost,
      redeemedAt: new Date(),
    });

    res.status(200).json({
      message: 'Offer claimed successfully.',
      pointsSpent: pointsCost,
      user: {
        id: stringifyId(updatedUser._id),
        points: updatedUser.points,
      },
      offer: formatOffer(updatedOffer),
    });
  } catch (error) {
    console.error('API /offers/redeem error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
