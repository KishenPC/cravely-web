'use client'


import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

const DEFAULT_OFFER_POINTS_COST = 25;

function isOfferExpired(offer) {
  if (!offer?.isActive) return true;
  if (!offer?.endTime) return false;

  const end = new Date(offer.endTime);
  if (Number.isNaN(end.getTime())) return false;
  return end < new Date();
}

export default function OffersPage() {
  const { status } = useSession();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userPoints, setUserPoints] = useState(0);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [claimingOfferId, setClaimingOfferId] = useState('');
  const [claimError, setClaimError] = useState('');
  const [claimSuccess, setClaimSuccess] = useState('');

  useEffect(() => {
    async function fetchOffers() {
      try {
        const res = await fetch('/api/offers');
        if (!res.ok) throw new Error('Failed to fetch offers');
        const data = await res.json();
        setOffers(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchOffers();
  }, []);

  useEffect(() => {
    async function fetchPoints() {
      if (status !== 'authenticated') {
        setUserPoints(0);
        return;
      }

      setPointsLoading(true);
      try {
        const res = await fetch('/api/profile');
        if (!res.ok) {
          throw new Error('Failed to fetch points');
        }

        const profile = await res.json();
        setUserPoints(Number(profile?.points || 0));
      } catch {
        setUserPoints(0);
      } finally {
        setPointsLoading(false);
      }
    }

    fetchPoints();
  }, [status]);

  async function handleClaim(offerId) {
    if (status !== 'authenticated') {
      setClaimSuccess('');
      setClaimError('Please sign in to claim offers.');
      return;
    }

    if (!offerId) {
      setClaimSuccess('');
      setClaimError('Unable to claim this offer right now.');
      return;
    }

    setClaimingOfferId(offerId);
    setClaimError('');
    setClaimSuccess('');

    try {
      const res = await fetch('/api/offers/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to claim this offer.');
      }

      if (payload.offer?._id) {
        setOffers((prev) => prev.map((offer) => (offer._id === payload.offer._id ? payload.offer : offer)));
      }

      if (typeof payload.user?.points === 'number') {
        setUserPoints(payload.user.points);
      }

      setClaimSuccess(payload.message || 'Offer claimed successfully.');
    } catch (err) {
      setClaimError(err.message || 'Failed to claim this offer.');
    } finally {
      setClaimingOfferId('');
    }
  }

  if (loading) return <div className="page-content">Loading offers...</div>;
  if (error) return <div className="page-content">Error: {error}</div>;

  return (
    <div className="page-content" key="offers">
      <div className="section-label">Live Offers</div>
      <h2 className="section-title">Deals near your campus</h2>
      <p className="section-desc">
        Time-bound, student-only offers funded by restaurants. Claim before they expire.
      </p>

      <div className="offer-points-strip">
        <div>
          <div className="points-label">Available Points</div>
          <div className="points-value">{status === 'authenticated' ? (pointsLoading ? '...' : userPoints) : '--'}</div>
        </div>
        <div className="points-sub">
          {status === 'authenticated' ? 'Write reviews to earn. Claim offers to spend.' : 'Sign in to claim offers using your points.'}
        </div>
      </div>

      {claimError && <div className="auth-error" style={{ marginBottom: '12px' }}>{claimError}</div>}
      {claimSuccess && <div className="auth-success" style={{ marginBottom: '12px' }}>{claimSuccess}</div>}

      <div className="offers-grid">
        {offers.length === 0 ? (
          <div>No offers available.</div>
        ) : (
          offers.map((o, i) => (
            <div className="offer-card" key={o._id || i}>
              <div className="offer-restaurant">{o.restaurant || 'Unknown Restaurant'}</div>
              <div className="offer-title">{o.title || 'Untitled offer'}</div>
              <div className="offer-detail">{o.detail || o.description || 'No details available.'}</div>
              <div className="offer-meta-row">
                <span className="offer-points-cost">{Number(o.pointsCost || DEFAULT_OFFER_POINTS_COST)} pts</span>
                {typeof o.remainingClaims === 'number' && (
                  <span className="offer-remaining">{o.remainingClaims} left</span>
                )}
              </div>
              <div className="offer-footer">
                <span className="offer-time">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {o.time || 'Limited time offer'}
                </span>
                <button
                  className="offer-claim-btn"
                  type="button"
                  onClick={() => handleClaim(o._id)}
                  disabled={
                    claimingOfferId === o._id ||
                    status !== 'authenticated' ||
                    isOfferExpired(o) ||
                    (typeof o.maxClaims === 'number' && o.currentClaims >= o.maxClaims) ||
                    userPoints < Number(o.pointsCost || DEFAULT_OFFER_POINTS_COST)
                  }
                >
                  {claimingOfferId === o._id
                    ? 'Claiming...'
                    : status !== 'authenticated'
                      ? 'Sign in'
                      : isOfferExpired(o)
                        ? 'Expired'
                        : typeof o.maxClaims === 'number' && o.currentClaims >= o.maxClaims
                          ? 'Sold out'
                          : userPoints < Number(o.pointsCost || DEFAULT_OFFER_POINTS_COST)
                            ? 'Need more'
                            : 'Claim'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="divider"></div>

      <div style={{ marginBottom: '12px' }}>
        <span className="wip-badge">Geo-fencing not implemented</span>
      </div>

      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <p>Location-based offer filtering is not built yet.</p>
      </div>
    </div>
  )
}
