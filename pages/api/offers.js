// pages/api/offers.js
import dbConnect from '../../lib/db';
import { Offer } from '../../lib/schemas';

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
  const restaurantName = offer?.restaurantId?.name || offer?.restaurant || 'Unknown Restaurant';
  const detail = offer?.description || offer?.detail || '';
  const pointsCost = typeof offer?.pointsCost === 'number' && offer.pointsCost > 0 ? offer.pointsCost : 25;
  const currentClaims = typeof offer?.currentClaims === 'number' ? offer.currentClaims : 0;
  const maxClaims = typeof offer?.maxClaims === 'number' ? offer.maxClaims : null;
  const remainingClaims = maxClaims === null ? null : Math.max(maxClaims - currentClaims, 0);

  return {
    _id: stringifyId(offer?._id),
    restaurantId: stringifyId(offer?.restaurantId?._id || offer?.restaurantId),
    restaurant: restaurantName,
    title: offer?.title || '',
    description: detail,
    detail,
    startTime: offer?.startTime || null,
    endTime: offer?.endTime || null,
    time: formatOfferTime(offer?.endTime, offer?.isActive),
    isActive: typeof offer?.isActive === 'boolean' ? offer.isActive : true,
    pointsCost,
    maxClaims,
    currentClaims,
    remainingClaims,
  };
}

export default async function handler(req, res) {
  try {
    await dbConnect();

    if (req.method === 'GET') {
      const offers = await Offer.find({})
        .populate('restaurantId', 'name')
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json(offers.map(formatOffer));
      return;
    }

    if (req.method === 'POST') {
      const offer = new Offer(req.body);
      await offer.save();

      const populated = await Offer.findById(offer._id)
        .populate('restaurantId', 'name')
        .lean();

      res.status(201).json(formatOffer(populated));
      return;
    }

    res.status(405).end();
  } catch (error) {
    console.error('API /offers error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
