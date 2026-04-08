"use client"

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

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

function buildDishOptions(searchData) {
  return searchData.map((item) => ({
    id: item._id,
    label: `${item.dish} (${item.name})`,
  }));
}

function appendDishOption(options, option) {
  if (!option?.id) return options;
  if (options.some((item) => item.id === option.id)) {
    return options;
  }
  return [option, ...options];
}

export default function ReviewsPage() {
  const { status } = useSession();
  const [reviews, setReviews] = useState([]);
  const [dishOptions, setDishOptions] = useState([]);
  const [restaurantOptions, setRestaurantOptions] = useState([]);
  const [upvotes, setUpvotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [restaurantFilter, setRestaurantFilter] = useState('all');
  const [dishFilter, setDishFilter] = useState('all');

  useEffect(() => {
    async function fetchData() {
      try {
        const [reviewsRes, searchRes, restaurantsRes] = await Promise.all([
          fetch('/api/reviews'),
          fetch('/api/search-results'),
          fetch('/api/restaurants'),
        ]);

        if (!reviewsRes.ok) throw new Error('Failed to fetch reviews');
        if (!searchRes.ok) throw new Error('Failed to fetch dishes');
        if (!restaurantsRes.ok) throw new Error('Failed to fetch restaurants');

        const reviewsData = await reviewsRes.json();
        const searchData = await searchRes.json();
        const restaurantsData = await restaurantsRes.json();

        setReviews(reviewsData);

        const options = buildDishOptions(searchData);
        setDishOptions(options);
        setRestaurantOptions(restaurantsData);

        const upvoteMap = {};
        reviewsData.forEach((review) => {
          upvoteMap[review._id] = review.upvotes || 0;
        });
        setUpvotes(upvoteMap);

        setFormData((prev) => ({
          ...prev,
          mode: prev.mode === 'new' || options.length > 0 ? prev.mode : restaurantsData.length > 0 ? 'new' : prev.mode,
          dishId: prev.dishId || options[0]?.id || '',
          restaurantId: prev.restaurantId || restaurantsData[0]?._id || '',
        }));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  function handleUpvote(reviewId) {
    setUpvotes((prev) => ({ ...prev, [reviewId]: (prev[reviewId] || 0) + 1 }));
    // Optionally, send upvote to backend here
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

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: Number(formData.rating),
          text: trimmedText,
          tags: formData.tags,
          ...(isNewDishMode
            ? {
                restaurantId: formData.restaurantId,
                newDishName: formData.newDishName.trim(),
                price: Number(formData.price),
                category: formData.category.trim(),
              }
            : {
                dishId: formData.dishId,
              }),
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to submit review');
      }

      setReviews((prev) => [payload, ...prev]);
      setUpvotes((prev) => ({ [payload._id]: payload.upvotes || 0, ...prev }));
      setDishOptions((prev) => appendDishOption(prev, payload.dishOption));

      setFormData((prev) => ({
        ...initialFormData,
        mode: 'existing',
        dishId: payload.dishId || prev.dishId || dishOptions[0]?.id || '',
        restaurantId: prev.restaurantId || restaurantOptions[0]?._id || '',
      }));
      setSubmitSuccess(payload.createdDish ? 'Dish and review submitted successfully.' : 'Review submitted successfully.');
    } catch (err) {
      setSubmitError(err.message || 'Unable to submit review.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    status === 'authenticated' &&
    !submitting &&
    (formData.mode === 'new' ? restaurantOptions.length > 0 : dishOptions.length > 0);

  const restaurantFilterOptions = useMemo(() => {
    const optionMap = new Map();
    reviews.forEach((review) => {
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
  }, [reviews]);

  const dishFilterOptions = useMemo(() => {
    const optionMap = new Map();
    reviews.forEach((review) => {
      const itemRestaurantId = String(review.restaurantId || '').trim();
      const dishId = String(review.dishId || '').trim();
      const dishName = String(review.dish || '').trim();
      const restaurantName = String(review.restaurant || '').trim();

      if (!dishId || !dishName) return;
      if (restaurantFilter !== 'all' && itemRestaurantId !== restaurantFilter) return;

      if (!optionMap.has(dishId)) {
        optionMap.set(dishId, {
          id: dishId,
          name: dishName,
          restaurant: restaurantName,
        });
      }
    });

    return Array.from(optionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [reviews, restaurantFilter]);

  useEffect(() => {
    if (dishFilter === 'all') return;

    const stillAvailable = dishFilterOptions.some((option) => option.id === dishFilter);
    if (!stillAvailable) {
      setDishFilter('all');
    }
  }, [dishFilter, dishFilterOptions]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((review) => {
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
  }, [reviews, restaurantFilter, dishFilter]);

  function clearFilters() {
    setRestaurantFilter('all');
    setDishFilter('all');
  }

  const hasActiveFilters = restaurantFilter !== 'all' || dishFilter !== 'all';

  if (loading) return <div className="page-content">Loading reviews...</div>;
  if (error) return <div className="page-content">Error: {error}</div>;

  return (
    <div className="page-content" key="reviews">
      <div className="section-label">Reviews</div>
      <h2 className="section-title">What students are saying</h2>
      <p className="section-desc">
        Real reviews from verified college students. No fake ratings, no paid promotions.
      </p>

      <div className="review-form-card">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="review-mode-toggle" role="tablist" aria-label="Review type">
            <button
              className={`review-mode-btn${formData.mode === 'existing' ? ' active' : ''}`}
              type="button"
              onClick={() => handleModeChange('existing')}
              disabled={submitting}
            >
              Existing Dish
            </button>
            <button
              className={`review-mode-btn${formData.mode === 'new' ? ' active' : ''}`}
              type="button"
              onClick={() => handleModeChange('new')}
              disabled={submitting}
            >
              Add New Dish
            </button>
          </div>

          {formData.mode === 'existing' ? (
            <div className="auth-field">
              <label htmlFor="dishId">Dish</label>
              <select
                id="dishId"
                name="dishId"
                value={formData.dishId}
                onChange={handleChange}
                disabled={dishOptions.length === 0 || submitting}
                required
              >
                {dishOptions.length === 0 ? (
                  <option value="">No dishes available yet</option>
                ) : (
                  dishOptions.map((dish) => (
                    <option key={dish.id} value={dish.id}>{dish.label}</option>
                  ))
                )}
              </select>
              {dishOptions.length === 0 && (
                <div className="review-form-hint">
                  No dishes are in the database yet. Switch to "Add New Dish" to create the first one.
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
                  disabled={restaurantOptions.length === 0 || submitting}
                  required
                >
                  {restaurantOptions.length === 0 ? (
                    <option value="">No restaurants available</option>
                  ) : (
                    restaurantOptions.map((restaurant) => (
                      <option key={restaurant._id} value={restaurant._id}>{restaurant.name}</option>
                    ))
                  )}
                </select>
                {restaurantOptions.length === 0 && (
                  <div className="review-form-hint">
                    Add restaurants to the database before creating dishes for review.
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
                  disabled={submitting}
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
                    disabled={submitting}
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
                    disabled={submitting}
                  />
                </div>
              </div>
            </>
          )}

          <div className="review-form-hint">
            {formData.mode === 'new'
              ? 'Your new dish will be saved first, then this review will be attached to it.'
              : 'Choose a dish that already exists in the database.'}
          </div>

          <div className="auth-field">
            <label htmlFor="rating">Rating</label>
            <select id="rating" name="rating" value={formData.rating} onChange={handleChange} disabled={submitting}>
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
              disabled={submitting}
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
              disabled={submitting}
            />
          </div>

          {submitError && <div className="auth-error">{submitError}</div>}
          {submitSuccess && <div className="auth-success">{submitSuccess}</div>}

          <button
            className="auth-submit-btn"
            type="submit"
            disabled={!canSubmit}
          >
            {status !== 'authenticated'
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
            >
              <option value="all">All Restaurants</option>
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
              <option value="all">All Dishes</option>
              {dishFilterOptions.map((dish) => (
                <option key={dish.id} value={dish.id}>{dish.name} ({dish.restaurant})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="review-filter-summary-row">
          <span>{filteredReviews.length} of {reviews.length} review{reviews.length === 1 ? '' : 's'}</span>
          {hasActiveFilters && (
            <button className="review-action-btn" type="button" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="reviews-grid">
        {reviews.length === 0 ? (
          <div>No reviews available.</div>
        ) : (
          filteredReviews.length === 0 ? (
            <div>No reviews match the selected restaurant/dish filters.</div>
          ) : (
            filteredReviews.map((r, i) => (
            <div className="review-card" key={r._id || i}>
            <div className="review-header">
              <div className="reviewer">
                <div className="reviewer-avatar" style={{
                  background: i === 0 ? '#E8652D' : i === 1 ? '#F59E0B' : '#1A1A2E'
                }}>
                  {r.initials}
                </div>
                <div>
                  <div className="reviewer-name">{r.name}</div>
                  <div className="reviewer-date">{r.date}</div>
                  <div className="review-subtitle">{[r.dish, r.restaurant].filter(Boolean).join(' / ')}</div>
                </div>
              </div>
              <div className="review-stars">
                {Array.from({ length: 5 }).map((_, s) => (
                  <span key={s} style={{ opacity: s < r.stars ? 1 : 0.2 }}>{'\u2605'}</span>
                ))}
              </div>
            </div>

            <p className="review-text">{r.text}</p>

            {Array.isArray(r.tags) && r.tags.length > 0 && (
              <div className="review-tags">
                {r.tags.map((tag, t) => (
                  <span className="review-tag" key={t}>{tag}</span>
                ))}
              </div>
            )}

            <div className="review-actions">
              <button className="review-action-btn" type="button" onClick={() => handleUpvote(r._id || i)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/>
                  <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
                </svg>
                Helpful ({upvotes[r._id || i] || 0})
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
          )
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
