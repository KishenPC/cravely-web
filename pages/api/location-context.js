import dbConnect from '../../lib/db';
import { getLocationContext } from '../../lib/location/service';
import { parseLocationQuery } from '../../lib/location/shared';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).end();
      return;
    }

    await dbConnect();

    const { hasLocation, location } = parseLocationQuery(req.query || {});
    if (!hasLocation) {
      res.status(400).json({ error: 'Valid lat and lng query parameters are required.' });
      return;
    }

    const context = await getLocationContext(location);
    res.status(200).json(context);
  } catch (error) {
    console.error('API /location-context error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
