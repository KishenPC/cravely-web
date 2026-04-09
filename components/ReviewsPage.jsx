"use client"

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useLocationScope } from './LocationScopeProvider';

const initialFormData = {
  mode: 'existing',
  dishId: '',
  restaurantId: '',
  newDishName: '',
  price: '',
  category: '',
  rating: '5',
  text: '',
  tags: '',
};

async function readApiPayload(response) {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

function buildDishOptions(scopedDishes) {
  return scopedDishes.map((dish) => ({
    id: dish._id,
    label: `${dish.dish} (${dish.name})`,
  }));
}

function buildVirtualRestaurantOptions(places) {
  return places
    .filter((place) => place?.id && place?.name)
    .map((place) => ({
      _id: `place:${place.id}`,
      name: place.name,
      address: place.address || '',
      googlePlaceId: place.id,
      location: place.location || null,
      mapsUrl: place.mapsUrl || '',
      rating: place.rating ?? null,
      totalRatings: Number.isFinite(Number(place.totalRatings)) ? Number(place.totalRatings) : 0,
      openNow: typeof place.openNow === 'boolean' ? place.openNow : null,
      isVirtual: true,
    }));
}

export default function ReviewsPage() {
  const { status } = useSession();
  const {
    hydrated,
    hasLocation,
    location,
    data: locationData,
    loadingContext,
    locating,
    error: locationError,
    requestLocationAndRefresh,
    refreshContext,
    clearLocationScope,
  } = useLocationScope();

  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviewsError, setReviewsError] = useState('');
  const [upvotes, setUpvotes] = useState({});

  const [formData, setFormData] = useState(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const [restaurantFilter, setRestaurantFilter] = useState('all');
  const [dishFilter, setDishFilter] = useState('all');

  const nearbyRestaurants = locationData?.restaurants || [];
  const nearbyPlaces = locationData?.places || [];
  const scopedDishes = locationData?.dishes || [];

  const dishOptions = useMemo(() => buildDishOptions(scopedDishes), [scopedDishes]);
  const restaurantOptions = useMemo(() => {
    if (nearbyRestaurants.length > 0) return nearbyRestaurants;
    if (hasLocation && nearbyPlaces.length > 0) {
      return buildVirtualRestaurantOptions(nearbyPlaces);
    }
    return [];
  }, [nearbyRestaurants, nearbyPlaces, hasLocation]);

  const scopedRestaurantIds = useMemo(
    () => new Set(nearbyRestaurants.map((restaurant) => String(restaurant._id || '')).filter(Boolean)),
    [nearbyRestaurants]
  );

  useEffect(() => {
    async function fetchReviews() {
      try {
        const response = await fetch('/api/reviews');
        const payload = await readApiPayload(response);
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to fetch reviews');
        }

        const nextReviews = Array.isArray(payload) ? payload : [];
        setReviews(nextReviews);
        const upvoteMap = {};
        nextReviews.forEach((review) => {
          upvoteMap[review._id] = review.upvotes || 0;
        });
        setUpvotes(upvoteMap);
      } catch (error) {
        setReviewsError(error.message || 'Failed to fetch reviews');
      } finally {
        setLoadingReviews(false);
      }
    }

    fetchReviews();
  }, []);

  useEffect(() => {
    setFormData((prev) => {
      const nextDishId = dishOptions.some((dish) => dish.id === prev.dishId)
        ? prev.dishId
        : (dishOptions[0]?.id || '');

      const nextRestaurantId = restaurantOptions.some((restaurant) => restaurant._id === prev.restaurantId)
        ? prev.restaurantId
        : (restaurantOptions[0]?._id || '');

      let nextMode = prev.mode;
      if (nextMode === 'existing' && dishOptions.length === 0 && restaurantOptions.length > 0) {
        nextMode = 'new';
      } else if (nextMode === 'new' && restaurantOptions.length === 0 && dishOptions.length > 0) {
        nextMode = 'existing';
      }

      return {
        ...prev,
        mode: nextMode,
        dishId: nextDishId,
        restaurantId: nextRestaurantId,
      };
    });
  }, [dishOptions, restaurantOptions]);

  const scopedReviews = useMemo(() => {
    if (!hasLocation) return [];
    if (scopedRestaurantIds.size === 0) return [];
    return reviews.filter((review) => scopedRestaurantIds.has(String(review.restaurantId || '')));
  }, [reviews, scopedRestaurantIds, hasLocation]);

  const restaurantFilterOptions = useMemo(() => {
    const optionMap = new Map();
    scopedReviews.forEach((review) => {
      const id = String(review.restaurantId || '').trim();
      const name = String(review.restaurant || '').trim();
      if (!id || !name) return;
      if (!optionMap.has(id)) {
        optionMap.set(id, name);
      }
    });

    return Array.from(optionMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedReviews]);

  const dishFilterOptions = useMemo(() => {
    const optionMap = new Map();
    scopedReviews.forEach((review) => {
      const itemRestaurantId = String(review.restaurantId || '').trim();
      const itemDishId = String(review.dishId || '').trim();
      const dishName = String(review.dish || '').trim();
      const restaurantName = String(review.restaurant || '').trim();

      if (!itemDishId || !dishName) return;
      if (restaurantFilter !== 'all' && itemRestaurantId !== restaurantFilter) return;

      if (!optionMap.has(itemDishId)) {
        optionMap.set(itemDishId, {
          id: itemDishId,
          name: dishName,
          restaurant: restaurantName,
        });
      }
    });

    return Array.from(optionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedReviews, restaurantFilter]);

  useEffect(() => {
    if (dishFilter === 'all') return;
    const stillAvailable = dishFilterOptions.some((option) => option.id === dishFilter);
    if (!stillAvailable) {
      setDishFilter('all');
    }
  }, [dishFilter, dishFilterOptions]);

  const filteredReviews = useMemo(() => {
    return scopedReviews.filter((review) => {
      const itemRestaurantId = String(review.restaurantId || '').trim();
      const itemDishId = String(review.dishId || '').trim();

      if (restaurantFilter !== 'all' && itemRestaurantId !== restaurantFilter) {
        return false;
      }

      if (dishFilter !== 'all' && itemDishId !== dishFilter) {
        return false;
      }

      return true;
    });
  }, [scopedReviews, restaurantFilter, dishFilter]);

  function handleUpvote(reviewId) {
    setUpvotes((prev) => ({ ...prev, [reviewId]: (prev[reviewId] || 0) + 1 }));
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleModeChange(mode) {
    setSubmitError('');
    setSubmitSuccess('');
    setFormData((prev) => ({
      ...prev,
      mode,
      dishId: prev.dishId || dishOptions[0]?.id || '',
      restaurantId: prev.restaurantId || restaurantOptions[0]?._id || '',
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!hasLocation) {
      setSubmitError('Use your location first so we can verify nearby restaurants.');
      return;
    }

    if (status !== 'authenticated') {
      setSubmitError('Please sign in to post a review.');
      return;
    }

    setSubmitting(true);

    try {
      const trimmedText = formData.text.trim();
      const isNewDishMode = formData.mode === 'new';

      if (!trimmedText) {
        throw new Error('Review text is required.');
      }

      if (!isNewDishMode && !formData.dishId) {
        throw new Error('Please choose a dish to review.');
      }

      if (
        isNewDishMode &&
        (!formData.restaurantId || !formData.newDishName.trim() || !Number.isFinite(Number(formData.price)) || Number(formData.price) <= 0)
      ) {
        throw new Error('Restaurant, dish name, and a valid price are required for a new dish.');
      }

      const selectedRestaurant = restaurantOptions.find(
        (restaurant) => restaurant._id === formData.restaurantId
      );
      const isVirtualRestaurant = String(selectedRestaurant?._id || '').startsWith('place:');

      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: Number(formData.rating),
          text: trimmedText,
          tags: formData.tags,
          ...(isNewDishMode
            ? {
                newDishName: formData.newDishName.trim(),
                price: Number(formData.price),
                category: formData.category.trim(),
                ...(isVirtualRestaurant
                  ? {
                      newRestaurant: {
                        googlePlaceId: selectedRestaurant?.googlePlaceId,
                        name: selectedRestaurant?.name,
                        address: selectedRestaurant?.address,
                        location: selectedRestaurant?.location,
                        mapsUrl: selectedRestaurant?.mapsUrl,
                        rating: selectedRestaurant?.rating,
                        totalRatings: selectedRestaurant?.totalRatings,
                        openNow: selectedRestaurant?.openNow,
                      },
                    }
                  : {
                      restaurantId: formData.restaurantId,
                    }),
              }
            : {
                dishId: formData.dishId,
              }),
        }),
      });

      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to submit review');
      }

      setReviews((prev) => [payload, ...prev]);
      setUpvotes((prev) => ({ [payload._id]: payload.upvotes || 0, ...prev }));
      setSubmitSuccess(payload.createdDish ? 'Dish and review submitted successfully.' : 'Review submitted successfully.');

      if (location) {
        await refreshContext(location, { force: true, persist: false });
      }

      if (isNewDishMode && payload.dishOption) {
        const option = payload.dishOption;
        const nextDishId = option.id || payload.dishId;
        if (nextDishId) {
          setFormData((prev) => ({
            ...initialFormData,
            mode: 'existing',
            dishId: nextDishId,
            restaurantId: prev.restaurantId || restaurantOptions[0]?._id || '',
          }));
        } else {
          setFormData((prev) => ({
            ...initialFormData,
            mode: 'existing',
            dishId: prev.dishId || dishOptions[0]?.id || '',
            restaurantId: prev.restaurantId || restaurantOptions[0]?._id || '',
          }));
        }
      } else {
        setFormData((prev) => ({
          ...prev,
          rating: '5',
          text: '',
          tags: '',
        }));
      }
    } catch (error) {
      setSubmitError(error.message || 'Unable to submit review.');
    } finally {
      setSubmitting(false);
    }
  }

  function clearFilters() {
    setRestaurantFilter('all');
    setDishFilter('all');
  }

  const hasActiveFilters = restaurantFilter !== 'all' || dishFilter !== 'all';
  const canSubmit =
    hasLocation &&
    status === 'authenticated' &&
    !submitting &&
    (formData.mode === 'new' ? restaurantOptions.length > 0 : dishOptions.length > 0);

  if (!hydrated || loadingReviews || loadingContext) {
    return <div className="page-content">Loading reviews...</div>;
  }

  return (
    <div className="page-content" key="reviews">
      <div className="section-label">Reviews</div>
      <h2 className="section-title">What students are saying</h2>
      <p className="section-desc">
        Nearby-only review feed. We only show restaurants and dishes available around your current location.
      </p>

      <div className="maps-cta-card">
        <div>
          <div className="maps-cta-title">Use location for nearby reviews</div>
          <p className="maps-cta-text">
            Search and Reviews now share one location cache and one nearby data source.
          </p>
          {hasLocation && (
            <p className="maps-cta-text">
              Nearby restaurants available: {restaurantOptions.length}. Nearby places synced: {nearbyPlaces.length}.
            </p>
          )}
        </div>
        <button
          className="maps-location-btn"
          onClick={() => requestLocationAndRefresh()}
          disabled={locating || submitting}
          type="button"
        >
          {locating ? 'Locating...' : hasLocation ? 'Refresh Nearby' : 'Use My Location'}
        </button>
      </div>

      {hasLocation && (
        <button
          className="review-action-btn"
          type="button"
          onClick={clearLocationScope}
          style={{ marginBottom: '12px' }}
        >
          Clear Location Scope
        </button>
      )}

      {locationError && <div className="auth-error">{locationError}</div>}
      {reviewsError && <div className="auth-error">{reviewsError}</div>}

      <div className="review-form-card">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="review-mode-toggle" role="tablist" aria-label="Review type">
            <button
              className={`review-mode-btn${formData.mode === 'existing' ? ' active' : ''}`}
              type="button"
              onClick={() => handleModeChange('existing')}
              disabled={submitting || !hasLocation}
            >
              Existing Dish
            </button>
            <button
              className={`review-mode-btn${formData.mode === 'new' ? ' active' : ''}`}
              type="button"
              onClick={() => handleModeChange('new')}
              disabled={submitting || !hasLocation}
            >
              Add New Dish
            </button>
          </div>

          {!hasLocation && (
            <div className="review-form-hint">
              Use your location to unlock nearby restaurants and dish reviews.
            </div>
          )}

          {formData.mode === 'existing' ? (
            <div className="auth-field">
              <label htmlFor="dishId">Dish</label>
              <select
                id="dishId"
                name="dishId"
                value={formData.dishId}
                onChange={handleChange}
                disabled={!hasLocation || dishOptions.length === 0 || submitting}
                required
              >
                {dishOptions.length === 0 ? (
                  <option value="">No nearby dishes available</option>
                ) : (
                  dishOptions.map((dish) => (
                    <option key={dish.id} value={dish.id}>{dish.label}</option>
                  ))
                )}
              </select>
              {dishOptions.length === 0 && hasLocation && (
                <div className="review-form-hint">
                  No nearby dishes found yet. Switch to "Add New Dish" to create one for a nearby restaurant.
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="auth-field">
                <label htmlFor="restaurantId">Restaurant</label>
                <select
                  id="restaurantId"
                  name="restaurantId"
                  value={formData.restaurantId}
                  onChange={handleChange}
                  disabled={!hasLocation || restaurantOptions.length === 0 || submitting}
                  required
                >
                  {restaurantOptions.length === 0 ? (
                    <option value="">No nearby restaurants available</option>
                  ) : (
                    restaurantOptions.map((restaurant) => (
                      <option key={restaurant._id} value={restaurant._id}>{restaurant.name}</option>
                    ))
                  )}
                </select>
                {restaurantOptions.length === 0 && hasLocation && (
                  <div className="review-form-hint">
                    No nearby restaurants were synced from Maps for your location.
                  </div>
                )}
              </div>

              <div className="auth-field">
                <label htmlFor="newDishName">Dish Name</label>
                <input
                  id="newDishName"
                  name="newDishName"
                  type="text"
                  maxLength={80}
                  placeholder="Ex: Schezwan Paneer Maggi"
                  value={formData.newDishName}
                  onChange={handleChange}
                  disabled={!hasLocation || submitting}
                  required
                />
              </div>

              <div className="review-inline-fields">
                <div className="auth-field">
                  <label htmlFor="price">Price (INR)</label>
                  <input
                    id="price"
                    name="price"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="120"
                    value={formData.price}
                    onChange={handleChange}
                    disabled={!hasLocation || submitting}
                    required
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="category">Category</label>
                  <input
                    id="category"
                    name="category"
                    type="text"
                    maxLength={40}
                    placeholder="Snacks, Beverage..."
                    value={formData.category}
                    onChange={handleChange}
                    disabled={!hasLocation || submitting}
                  />
                </div>
              </div>
            </>
          )}

          <div className="review-form-hint">
            {formData.mode === 'new'
              ? 'Your new dish will be saved under a nearby restaurant and reviewed immediately.'
              : 'Only nearby dishes are listed here.'}
          </div>

          <div className="auth-field">
            <label htmlFor="rating">Rating</label>
            <select id="rating" name="rating" value={formData.rating} onChange={handleChange} disabled={!hasLocation || submitting}>
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>{value} Star{value > 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>

          <div className="auth-field">
            <label htmlFor="text">Your Review</label>
            <textarea
              id="text"
              name="text"
              rows={4}
              maxLength={500}
              placeholder="Write your honest experience..."
              value={formData.text}
              onChange={handleChange}
              disabled={!hasLocation || submitting}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="tags">Tags (comma separated)</label>
            <input
              id="tags"
              name="tags"
              type="text"
              maxLength={120}
              placeholder="spicy, budget-friendly, must-try"
              value={formData.tags}
              onChange={handleChange}
              disabled={!hasLocation || submitting}
            />
          </div>

          {submitError && <div className="auth-error">{submitError}</div>}
          {submitSuccess && <div className="auth-success">{submitSuccess}</div>}

          <button
            className="auth-submit-btn"
            type="submit"
            disabled={!canSubmit}
          >
            {!hasLocation
              ? 'Use location to post review'
              : status !== 'authenticated'
                ? 'Sign in to post review'
                : submitting
                  ? 'Submitting...'
                  : formData.mode === 'new'
                    ? 'Add Dish and Review'
                    : 'Submit Review'}
          </button>
        </form>
      </div>

      <div className="review-form-card review-filter-card">
        <div className="section-label">Filter Reviews</div>

        <div className="review-inline-fields">
          <div className="auth-field">
            <label htmlFor="restaurantFilter">Restaurant</label>
            <select
              id="restaurantFilter"
              name="restaurantFilter"
              value={restaurantFilter}
              onChange={(event) => setRestaurantFilter(event.target.value)}
              disabled={restaurantFilterOptions.length === 0}
            >
              <option value="all">All Nearby Restaurants</option>
              {restaurantFilterOptions.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
              ))}
            </select>
          </div>

          <div className="auth-field">
            <label htmlFor="dishFilter">Dish</label>
            <select
              id="dishFilter"
              name="dishFilter"
              value={dishFilter}
              onChange={(event) => setDishFilter(event.target.value)}
              disabled={dishFilterOptions.length === 0}
            >
              <option value="all">All Nearby Dishes</option>
              {dishFilterOptions.map((dish) => (
                <option key={dish.id} value={dish.id}>{dish.name} ({dish.restaurant})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="review-filter-summary-row">
          <span>{filteredReviews.length} of {scopedReviews.length} review{scopedReviews.length === 1 ? '' : 's'}</span>
          {hasActiveFilters && (
            <button className="review-action-btn" type="button" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="reviews-grid">
        {!hasLocation ? (
          <div>Use My Location to load reviews for nearby restaurants.</div>
        ) : scopedReviews.length === 0 ? (
          <div>No reviews available for nearby restaurants yet.</div>
        ) : filteredReviews.length === 0 ? (
          <div>No reviews match the selected restaurant/dish filters.</div>
        ) : (
          filteredReviews.map((review, index) => (
            <div className="review-card" key={review._id || index}>
              <div className="review-header">
                <div className="reviewer">
                  <div
                    className="reviewer-avatar"
                    style={{
                      background: index === 0 ? '#E8652D' : index === 1 ? '#F59E0B' : '#1A1A2E',
                    }}
                  >
                    {review.initials}
                  </div>
                  <div>
                    <div className="reviewer-name">{review.name}</div>
                    <div className="reviewer-date">{review.date}</div>
                    <div className="review-subtitle">{[review.dish, review.restaurant].filter(Boolean).join(' / ')}</div>
                  </div>
                </div>
                <div className="review-stars">
                  {Array.from({ length: 5 }).map((_, starIndex) => (
                    <span key={starIndex} style={{ opacity: starIndex < review.stars ? 1 : 0.2 }}>{'\u2605'}</span>
                  ))}
                </div>
              </div>

              <p className="review-text">{review.text}</p>

              {Array.isArray(review.tags) && review.tags.length > 0 && (
                <div className="review-tags">
                  {review.tags.map((tag, tagIndex) => (
                    <span className="review-tag" key={tagIndex}>{tag}</span>
                  ))}
                </div>
              )}

              <div className="review-actions">
                <button className="review-action-btn" type="button" onClick={() => handleUpvote(review._id || index)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/>
                    <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
                  </svg>
                  Helpful ({upvotes[review._id || index] || 0})
                </button>
                <button className="review-action-btn" type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  Reply
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </div>
        <p>Photo reviews are not built yet.</p>
      </div>
    </div>
  )
}
