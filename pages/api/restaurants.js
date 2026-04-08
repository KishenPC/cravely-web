import dbConnect from '../../lib/db';
import { Restaurant } from '../../lib/schemas';

export default async function handler(req, res) {
  try {
    await dbConnect();

    if (req.method !== 'GET') {
      res.status(405).end();
      return;
    }

    const restaurants = await Restaurant.find({})
      .sort({ name: 1 })
      .select('name address')
      .lean();

    res.status(200).json(
      restaurants.map((restaurant) => ({
        _id: String(restaurant._id),
        name: restaurant.name || 'Unknown Restaurant',
        address: restaurant.address || '',
      }))
    );
  } catch (error) {
    console.error('API /restaurants error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
