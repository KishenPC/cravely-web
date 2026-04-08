'use client'
import { usePathname ,useRouter } from 'next/navigation'
// const tabs = [
//   { id: 'home', label: 'Home', path: '/' },
//   { id: 'search', label: 'Search', path: '/search' },
//   { id: 'reviews', label: 'Reviews', path: '/reviews' },
//   { id: 'offers', label: 'Offers', path: '/offers' },
//   { id: 'profile', label: 'Profile', path: '/profile' },
// ]

export default function HomePage() {
  const router = useRouter();
  const handleRouting = function(path){
    router.push(path);
  }
  return (
    <div className="page-content" key="home">
      <h2 className="section-title">
        Find the best dishes near your college.
      </h2>
      <p className="section-desc">
        Search by dish, compare prices, read student reviews, and earn points.
        Built for college students who care about what they eat and what they spend.
      </p>

      <div className="divider"></div>

      <div className="section-label">What You Can Do</div>
      <div className="feature-list">
        <div className="feature-card" onClick={() => handleRouting("/search")}>
          <div className="feature-icon search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="gold" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <div>
            <h3>Dish-Level Search</h3>
            <p>Search by dish name, not restaurant. Compare price, rating, and distance.</p>
          </div>
        </div>

        <div className="feature-card" onClick={() => handleRouting("/reviews")}>
          <div className="feature-icon review">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="gold" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <div>
            <h3>Student-Only Reviews</h3>
            <p>Verified college students only. Dish-specific, with tags and photos.</p>
          </div>
        </div>

        <div className="feature-card" onClick={() => handleRouting("/offers")}>
          <div className="feature-icon offer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="gold" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
          </div>
          <div>
            <h3>Live Offers</h3>
            <p>Time-bound, geo-fenced deals funded by restaurants near you.</p>
          </div>
        </div>

        <div className="feature-card" onClick={() => handleRouting("/profile")}>
          <div className="feature-icon points">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="gold" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8"/>
              <path d="M12 18V6"/>
            </svg>
          </div>
          <div>
            <h3>Profile</h3>
            <p>Check your profile, points, your reviews</p>
          </div>
        </div>
      </div>

      <div className="divider"></div>

      <div className="section-label">How It Works</div>
      <div className="step-list">
        <div className="step-item">
          <div className="step-number">1</div>
          <div>
            <h4>Search for a dish</h4>
            <p>Type what you are craving today</p>
          </div>
        </div>
        <div className="step-item">
          <div className="step-number">2</div>
          <div>
            <h4>Compare nearby options</h4>
            <p>Price, rating, distance side by side</p>
          </div>
        </div>
        <div className="step-item">
          <div className="step-number">3</div>
          <div>
            <h4>Visit and review</h4>
            <p>Go eat, then share your honest opinion</p>
          </div>
        </div>
        <div className="step-item">
          <div className="step-number">4</div>
          <div>
            <h4>Earn and redeem</h4>
            <p>Stack points, unlock rewards</p>
          </div>
        </div>
      </div>
    </div>
  )
}
