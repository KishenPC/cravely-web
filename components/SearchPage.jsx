'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocationScope } from './LocationScopeProvider'

const RESTAURANTS_PAGE_SIZE = 6

const DISTANCE_FILTERS = [
  { id: 'all', label: 'Any Distance' },
  { id: 'within1km', label: 'Within 1 km', maxMeters: 1000 },
  { id: 'within2km', label: 'Within 2 km', maxMeters: 2000 },
  { id: 'within5km', label: 'Within 5 km', maxMeters: 5000 },
]

const RATING_FILTERS = [
  { id: 'all', label: 'Any Rating', minRating: null },
  { id: 'rating35', label: '3.5 and above', minRating: 3.5 },
  { id: 'rating40', label: '4.0 and above', minRating: 4.0 },
  { id: 'rating45', label: '4.5 and above', minRating: 4.5 },
]

function buildRestaurantFallbackFromPlaces(places) {
  return (Array.isArray(places) ? places : []).map((place) => ({
    _id: place.id ? `place:${place.id}` : place.name,
    googlePlaceId: place.id || '',
    name: place.name || 'Unknown Restaurant',
    address: place.address || '',
    distance: '\u2014',
    distanceMeters: null,
    openNow: typeof place.openNow === 'boolean' ? place.openNow : null,
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    totalRatings: Number.isFinite(Number(place.totalRatings)) ? Number(place.totalRatings) : 0,
    mapsUrl: place.mapsUrl || '',
  }))
}

function formatOpenStatus(openNow) {
  if (openNow === true) return 'Open now'
  if (openNow === false) return 'Closed now'
  return 'Hours unavailable'
}

export default function SearchPage() {
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [restaurantSearchTerm, setRestaurantSearchTerm] = useState('')
  const [distanceFilter, setDistanceFilter] = useState('all')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [openFilter, setOpenFilter] = useState('all')
  const [visibleRestaurantCount, setVisibleRestaurantCount] = useState(RESTAURANTS_PAGE_SIZE)

  const {
    hydrated,
    hasLocation,
    data,
    loadingContext,
    locating,
    error: locationError,
    requestLocationAndRefresh,
  } = useLocationScope()

  const nearbyRestaurants = data?.restaurants || []
  const nearbyPlaces = data?.places || []
  const results = data?.dishes || []

  const restaurantCatalog = useMemo(() => {
    if (nearbyRestaurants.length > 0) {
      return nearbyRestaurants
    }
    return buildRestaurantFallbackFromPlaces(nearbyPlaces)
  }, [nearbyRestaurants, nearbyPlaces])

  const filters = [
    { id: 'all', label: 'All Dishes' },
    { id: 'under100', label: 'Budget (<= \u20B9100)' },
    { id: 'toprated', label: 'High Rating (>= 4.2)' },
    { id: 'nearby', label: 'Distance Available' },
    { id: 'offers', label: 'Has Offer' },
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

      if (!matchesSearch) return false

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

  const filteredRestaurants = useMemo(() => {
    const normalizedSearch = restaurantSearchTerm.trim().toLowerCase()
    const selectedDistance = DISTANCE_FILTERS.find((filter) => filter.id === distanceFilter)
    const selectedRating = RATING_FILTERS.find((filter) => filter.id === ratingFilter)

    return restaurantCatalog.filter((restaurant) => {
      const restaurantName = String(restaurant.name || '').toLowerCase()
      const restaurantAddress = String(restaurant.address || '').toLowerCase()
      const numericDistance = Number(restaurant.distanceMeters)
      const numericRating = Number(restaurant.rating)

      const matchesSearch =
        normalizedSearch.length === 0 ||
        restaurantName.includes(normalizedSearch) ||
        restaurantAddress.includes(normalizedSearch)

      if (!matchesSearch) return false

      if (selectedDistance?.maxMeters != null) {
        if (!Number.isFinite(numericDistance) || numericDistance > selectedDistance.maxMeters) {
          return false
        }
      }

      if (selectedRating?.minRating != null) {
        if (!Number.isFinite(numericRating) || numericRating < selectedRating.minRating) {
          return false
        }
      }

      if (openFilter === 'open') {
        return restaurant.openNow === true
      }

      if (openFilter === 'closed') {
        return restaurant.openNow === false
      }

      return true
    })
  }, [restaurantCatalog, restaurantSearchTerm, distanceFilter, ratingFilter, openFilter])

  const visibleRestaurants = useMemo(
    () => filteredRestaurants.slice(0, visibleRestaurantCount),
    [filteredRestaurants, visibleRestaurantCount]
  )
  const hasMoreRestaurants = visibleRestaurantCount < filteredRestaurants.length

  useEffect(() => {
    setVisibleRestaurantCount(RESTAURANTS_PAGE_SIZE)
  }, [restaurantSearchTerm, distanceFilter, ratingFilter, openFilter, restaurantCatalog.length])

  const hasRestaurantFilters =
    restaurantSearchTerm.trim().length > 0 ||
    distanceFilter !== 'all' ||
    ratingFilter !== 'all' ||
    openFilter !== 'all'

  function clearRestaurantFilters() {
    setRestaurantSearchTerm('')
    setDistanceFilter('all')
    setRatingFilter('all')
    setOpenFilter('all')
  }

  const loading = !hydrated || loadingContext
  if (loading) return <div className="page-content">Loading results...</div>

  return (
    <div className="page-content" key="search">
      <div className="section-label">Search</div>
      <h2 className="section-title">What are you craving?</h2>
      <p className="section-desc">
        Use Dish Search to filter dishes. Use Restaurant Search in the nearby restaurants section to filter restaurant cards.
      </p>

      <div className="maps-cta-card">
        <div>
          <div className="maps-cta-title">Load Nearby Restaurants</div>
          <p className="maps-cta-text">
            Uses Google Maps + your location to fetch nearby restaurants and the dishes available from them.
          </p>
        </div>
        <button
          className="maps-location-btn"
          onClick={() => requestLocationAndRefresh()}
          disabled={locating || loadingContext}
          type="button"
        >
          {locating ? 'Locating...' : hasLocation ? 'Refresh Nearby' : 'Use My Location'}
        </button>
      </div>

      {locationError && <div className="auth-error">{locationError}</div>}

      {hasLocation && (
        <>
          <div className="section-label">Nearby Restaurants</div>
          <div className="review-form-card search-restaurant-panel">
            <div className="auth-field">
              <label htmlFor="restaurantSearchInput">Search Nearby Restaurants</label>
              <div className="search-box search-box-compact search-box-infield">
                <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  id="restaurantSearchInput"
                  type="text"
                  placeholder='Try "Dominos", "food court", "canteen"...'
                  value={restaurantSearchTerm}
                  onChange={(event) => setRestaurantSearchTerm(event.target.value)}
                />
              </div>
              <div className="review-form-hint">
                Searches by restaurant name and address. Use filters below for distance, rating, and open status.
              </div>
            </div>

            <div className="restaurant-filters-grid">
              <div className="auth-field">
                <label htmlFor="distanceFilter">Distance from You</label>
                <select
                  id="distanceFilter"
                  value={distanceFilter}
                  onChange={(event) => setDistanceFilter(event.target.value)}
                >
                  {DISTANCE_FILTERS.map((filter) => (
                    <option key={filter.id} value={filter.id}>{filter.label}</option>
                  ))}
                </select>
              </div>

              <div className="auth-field">
                <label htmlFor="ratingFilter">Minimum Rating</label>
                <select
                  id="ratingFilter"
                  value={ratingFilter}
                  onChange={(event) => setRatingFilter(event.target.value)}
                >
                  {RATING_FILTERS.map((filter) => (
                    <option key={filter.id} value={filter.id}>{filter.label}</option>
                  ))}
                </select>
              </div>

              <div className="auth-field">
                <label htmlFor="openFilter">Open Status</label>
                <select
                  id="openFilter"
                  value={openFilter}
                  onChange={(event) => setOpenFilter(event.target.value)}
                >
                  <option value="all">Open + Closed</option>
                  <option value="open">Open now</option>
                  <option value="closed">Closed now</option>
                </select>
              </div>
            </div>

            <div className="restaurant-list-summary">
              <span>{visibleRestaurants.length} of {filteredRestaurants.length} restaurants shown</span>
              {hasRestaurantFilters && (
                <button className="review-action-btn" type="button" onClick={clearRestaurantFilters}>
                  Clear Filters
                </button>
              )}
            </div>

            {filteredRestaurants.length === 0 ? (
              <div>No nearby restaurants match these filters. Clear filters or refresh your location.</div>
            ) : (
              <>
                <div className="maps-list">
                  {visibleRestaurants.map((restaurant, index) => (
                    <div className="maps-card" key={restaurant._id || restaurant.googlePlaceId || index}>
                      <div className="maps-card-top">
                        <h3>{restaurant.name}</h3>
                        {Number.isFinite(Number(restaurant.rating)) ? (
                          <span className="maps-rating">{Number(restaurant.rating).toFixed(1)} / 5</span>
                        ) : (
                          <span className="maps-rating muted">No ratings</span>
                        )}
                      </div>
                      <p className="maps-address">{restaurant.address || 'Address unavailable'}</p>
                      <div className="maps-meta-row">
                        <span>{restaurant.totalRatings || 0} reviews</span>
                        <span>{restaurant.distance || '\u2014'}</span>
                        <span>{formatOpenStatus(restaurant.openNow)}</span>
                      </div>
                      {restaurant.mapsUrl && (
                        <a
                          className="maps-open-link"
                          href={restaurant.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in Google Maps
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                {hasMoreRestaurants && (
                  <button
                    className="show-more-btn"
                    type="button"
                    onClick={() => setVisibleRestaurantCount((count) => count + RESTAURANTS_PAGE_SIZE)}
                  >
                    Show {RESTAURANTS_PAGE_SIZE} More Restaurants
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      <div className="filter-row">
        {filters.map((filter) => (
          <button
            key={filter.id}
            className={'filter-chip' + (activeFilter === filter.id ? ' active' : '')}
            onClick={() => setActiveFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="auth-field dish-search-field">
        <label htmlFor="dishSearchInput">Search Dishes</label>
        <div className="search-box search-box-compact search-box-infield">
          <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            id="dishSearchInput"
            type="text"
            placeholder='Try "momos", "biryani", "maggi"...'
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <div className="review-form-hint">
          Searches dish name, restaurant name, and category within nearby restaurants.
        </div>
      </div>

      <div className="section-label">
        {searchTerm.trim() ? `Dish Results for "${searchTerm.trim()}"` : 'Dish Results (Nearby Only)'}
      </div>
      <div className="result-list">
        {filteredResults.length === 0 ? (
          <div>
            {!hasLocation
              ? 'Use My Location first to load nearby restaurants and dishes.'
              : searchTerm.trim()
                ? 'No nearby dishes matched this search. Try another keyword.'
                : 'No dishes found for your nearby restaurants yet.'}
          </div>
        ) : (
          filteredResults.map((result, index) => (
            <div className="result-card" key={result._id || index}>
              <div className="result-top">
                <div>
                  <div className="result-name">{result.name}</div>
                  <div className="result-dish">{result.dish}</div>
                </div>
                <div className="result-price">{result.price}</div>
              </div>
              <div className="result-bottom">
                <span className="result-meta">
                  <span className="star">{'\u2605'}</span> {result.rating} ({result.reviews})
                </span>
                <span className="result-meta">{result.distance}</span>
              </div>
              {result.offer && <div className="offer-badge">{result.offer}</div>}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '20px' }}>
        <span className="wip-badge">Additional dish filters coming soon</span>
      </div>
    </div>
  )
}
