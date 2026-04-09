import dbConnect from '../../lib/db';
import { getLocationContext } from '../../lib/location/service';
import { parseLocationQuery } from '../../lib/location/shared';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { hasLocation, location } = parseLocationQuery(req.query || {});
    if (!hasLocation) {
      res.status(400).json({ error: 'Valid lat and lng query parameters are required' });
      return;
    }

    await dbConnect();

    const context = await getLocationContext(location);
    res.status(200).json({
      places: context.places,
      status: context.status,
      syncedCount: context.syncedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch nearby restaurants' });
  }
}
