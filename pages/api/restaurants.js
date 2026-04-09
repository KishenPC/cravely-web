import dbConnect from '../../lib/db';
import {
  getAllRestaurants,
  getLocationContext,
  getRestaurantsByPlaceIds,
  toRestaurantResponse,
} from '../../lib/location/service';
import { parseLocationQuery, parsePlaceIds } from '../../lib/location/shared';

export default async function handler(req, res) {
  try {
    await dbConnect();

    if (req.method !== 'GET') {
      res.status(405).end();
      return;
    }

    const placeIds = parsePlaceIds(req.query?.placeIds);
    if (placeIds.length > 0) {
      const restaurants = await getRestaurantsByPlaceIds(placeIds);
      res.status(200).json(restaurants.map((restaurant) => toRestaurantResponse(restaurant)));
      return;
    }

    const { hasLocation, location } = parseLocationQuery(req.query || {});
    if (hasLocation) {
      const context = await getLocationContext(location);
      res.status(200).json(context.restaurants);
      return;
    }

    const restaurants = await getAllRestaurants();
    res.status(200).json(restaurants);
  } catch (error) {
    console.error('API /restaurants error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
