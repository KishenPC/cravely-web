'use client'

import { useEffect, useMemo, useState } from 'react'

export default function SearchPage() {

  const [activeFilter, setActiveFilter] = useState('all')
  const [results, setResults] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [nearbyPlaces, setNearbyPlaces] = useState([])
  const [mapLoading, setMapLoading] = useState(false)
  const [mapError, setMapError] = useState('')

  useEffect(() => {
    async function fetchResults() {
      try {
        const res = await fetch('/api/search-results')
        if (!res.ok) throw new Error('Failed to fetch results')
        const data = await res.json()
        setResults(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [])

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'under100', label: 'Under \u20B9100' },
    { id: 'toprated', label: 'Top Rated' },
    { id: 'nearby', label: 'Nearby' },
    { id: 'offers', label: 'With Offers' },
  ]

  const filteredResults = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return results.filter((result) => {
      const dish = (result.dish || '').toLowerCase()
      const restaurant = (result.name || '').toLowerCase()
      const category = (result.category || '').toLowerCase()
      const numericPrice = Number(String(result.price || '').replace(/[^\d.]/g, ''))
      const numericRating = Number(result.rating || 0)

      const matchesSearch =
        normalizedSearch.length === 0 ||
        dish.includes(normalizedSearch) ||
        restaurant.includes(normalizedSearch) ||
        category.includes(normalizedSearch)

      if (!matchesSearch) {
        return false
      }

      if (activeFilter === 'under100') {
        return Number.isFinite(numericPrice) && numericPrice <= 100
      }

      if (activeFilter === 'toprated') {
        return Number.isFinite(numericRating) && numericRating >= 4.2
      }

      if (activeFilter === 'nearby') {
        return !!result.distance && result.distance !== '\u2014'
      }

      if (activeFilter === 'offers') {
        return !!result.offer
      }

      return true
    })
  }, [results, searchTerm, activeFilter])

  async function fetchNearbyByLocation() {
    setMapError('')

    if (!navigator.geolocation) {
      setMapError('Geolocation is not supported in your browser.')
      return
    }

    setMapLoading(true)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const params = new URLSearchParams({
            lat: position.coords.latitude.toString(),
            lng: position.coords.longitude.toString(),
            radius: '2000',
          })

          const res = await fetch(`/api/maps-nearby?${params.toString()}`)
          const data = await res.json()

          if (!res.ok) {
            throw new Error(data.error || 'Unable to fetch nearby restaurants')
          }

          setNearbyPlaces(data.places || [])
        } catch (err) {
          setMapError(err.message || 'Unable to fetch nearby restaurants')
        } finally {
          setMapLoading(false)
        }
      },
      (geoError) => {
        if (geoError.code === 1) {
          setMapError('Location permission denied. Enable location access to use this feature.')
        } else {
          setMapError('Could not get your location. Please try again.')
        }
        setMapLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  if (loading) return <div className="page-content">Loading results...</div>
  if (error) return <div className="page-content">Error: {error}</div>

  return (
    <div className="page-content" key="search">
      <div className="section-label">Search</div>
      <h2 className="section-title">What are you craving?</h2>
      <p className="section-desc">
        Search any dish and compare prices, ratings, and distance across restaurants near you.
      </p>

      <div className="search-box">
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder='Try "momos", "biryani", "maggi"...'
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      <div className="maps-cta-card">
        <div>
          <div className="maps-cta-title">Find restaurants around me</div>
          <p className="maps-cta-text">
            Powered by Google Maps Places API. Tap once to discover what is open near your current location.
          </p>
        </div>
        <button
          className="maps-location-btn"
          onClick={fetchNearbyByLocation}
          disabled={mapLoading}
        >
          {mapLoading ? 'Locating...' : 'Use My Location'}
        </button>
      </div>

      {mapError && <div className="auth-error">{mapError}</div>}

      {nearbyPlaces.length > 0 && (
        <>
          <div className="section-label">Nearby via Google Maps</div>
          <div className="maps-list">
            {nearbyPlaces.map((place) => (
              <div className="maps-card" key={place.id}>
                <div className="maps-card-top">
                  <h3>{place.name}</h3>
                  {place.rating ? (
                    <span className="maps-rating">{place.rating} / 5</span>
                  ) : (
                    <span className="maps-rating muted">No ratings</span>
                  )}
                </div>
                <p className="maps-address">{place.address}</p>
                <div className="maps-meta-row">
                  <span>{place.totalRatings} reviews</span>
                  <span>
                    {place.openNow === null
                      ? 'Hours unavailable'
                      : place.openNow
                        ? 'Open now'
                        : 'Closed now'}
                  </span>
                </div>
                <a
                  className="maps-open-link"
                  href={place.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="filter-row">
        {filters.map(f => (
          <button
            key={f.id}
            className={'filter-chip' + (activeFilter === f.id ? ' active' : '')}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="section-label">
        {searchTerm.trim() ? `Results for "${searchTerm.trim()}"` : 'All Results'}
      </div>
      <div className="result-list">
        {filteredResults.length === 0 ? (
          <div>
            {searchTerm.trim()
              ? 'No dishes matched your search.'
              : 'No results found.'}
          </div>
        ) : (
          filteredResults.map((r, i) => (
            <div className="result-card" key={r._id || i}>
              <div className="result-top">
                <div>
                  <div className="result-name">{r.name}</div>
                  <div className="result-dish">{r.dish}</div>
                </div>
                <div className="result-price">{r.price}</div>
              </div>
              <div className="result-bottom">
                <span className="result-meta">
                  <span className="star">{'\u2605'}</span> {r.rating} ({r.reviews})
                </span>
                <span className="result-meta">{r.distance}</span>
              </div>
              {r.offer && <div className="offer-badge">{r.offer}</div>}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '20px' }}>
        <span className="wip-badge">More filters coming soon</span>
      </div>
    </div>
  )
}
