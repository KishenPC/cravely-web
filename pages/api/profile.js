// pages/api/profile.js
import dbConnect from '../../lib/db';
import { User, Reward } from '../../lib/schemas';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';

export default async function handler(req, res) {
  try {
    await dbConnect();

    // Get the logged-in user's session
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (req.method === 'GET') {
      // Find the user by their email from the session
      const user = await User.findOne({ email: session.user.email.toLowerCase() });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Fetch available rewards
      const rewards = await Reward.find({ isActive: true });

      const rewardsList = rewards.map((r) => ({
        title: r.title,
        desc: r.description || '',
        cost: r.pointsCost,
        canAfford: user.points >= r.pointsCost,
      }));

      const totalPointsEarned = typeof user.totalPointsEarned === 'number'
        ? user.totalPointsEarned
        : user.totalReviews * 2 + user.totalUpvotes * 2;
      const totalPointsSpent = typeof user.totalPointsSpent === 'number' ? user.totalPointsSpent : 0;

      return res.status(200).json({
        name: user.name,
        email: user.email,
        college: user.college || '',
        image: user.image || null,
        provider: user.provider || 'credentials',
        points: user.points,
        pointsEarned: totalPointsEarned,
        pointsSpent: totalPointsSpent,
        reviews: user.totalReviews,
        upvotes: user.totalUpvotes,
        photos: user.totalPhotos,
        rewards: rewardsList,
      });
    } else if (req.method === 'POST') {
      const profile = new User(req.body);
      await profile.save();
      res.status(201).json(profile);
    } else {
      res.status(405).end();
    }
  } catch (error) {
    console.error('API /profile error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
