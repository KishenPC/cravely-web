import dbConnect from '../../lib/db'
import { Restaurant } from '../../lib/schemas'

const MAPS_API_KEY =
  process.env.PLACES_URI ||
  process.env.MAPS_URI ||
  process.env.GOOGLE_MAPS_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!MAPS_API_KEY) {
    return res.status(500).json({ error: 'Missing Google Maps API key in environment' })
  }

  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const radius = Number(req.query.radius || 2000)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Valid lat and lng query parameters are required' })
  }

  const safeRadius = Math.min(Math.max(radius, 500), 5000)
  const endpoint = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
  endpoint.searchParams.set('location', `${lat},${lng}`)
  endpoint.searchParams.set('radius', String(safeRadius))
  endpoint.searchParams.set('type', 'restaurant')
  endpoint.searchParams.set('key', MAPS_API_KEY)

  try {
    const response = await fetch(endpoint.toString())
    const payload = await response.json()

    if (!response.ok || payload.status === 'REQUEST_DENIED' || payload.status === 'INVALID_REQUEST') {
      return res.status(502).json({
        error: payload.error_message || 'Google Maps request failed',
      })
    }

    const places = (payload.results || []).slice(0, 8).map((place) => ({
      id: place.place_id,
      name: place.name,
      address: place.vicinity || 'Address unavailable',
      rating: place.rating || null,
      totalRatings: place.user_ratings_total || 0,
      openNow: place.opening_hours?.open_now ?? null,
      mapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
      location: place.geometry?.location || null,
    }))

    await dbConnect()

    const syncResults = await Promise.allSettled(
      places
        .filter((place) => place.location?.lng != null && place.location?.lat != null)
        .map(async (place) => {
          const filter = place.id
            ? { googlePlaceId: place.id }
            : { name: place.name, address: place.address }

          return Restaurant.findOneAndUpdate(
            filter,
            {
              $set: {
                name: place.name,
                googlePlaceId: place.id,
                address: place.address,
                location: {
                  type: 'Point',
                  coordinates: [place.location.lng, place.location.lat],
                },
                rating: place.rating,
                totalRatings: place.totalRatings,
                openNow: place.openNow,
                mapsUrl: place.mapsUrl,
                source: 'google-maps',
                lastSyncedAt: new Date(),
              },
              $setOnInsert: {
                createdAt: new Date(),
              },
            },
            {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true,
            }
          )
        })
    )

    const syncedCount = syncResults.filter((r) => r.status === 'fulfilled').length

    return res.status(200).json({
      places,
      status: payload.status,
      syncedCount,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch nearby restaurants' })
  }
}