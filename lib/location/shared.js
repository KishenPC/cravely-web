export const DEFAULT_RADIUS_METERS = 4000;
export const MIN_RADIUS_METERS = 500;
export const MAX_RADIUS_METERS = 12000;

export const LOCATION_STORAGE_KEY = 'cravely.location.scope.v1';
export const LOCATION_CONTEXT_CACHE_PREFIX = 'cravely.location.context.v1';
export const LOCATION_CONTEXT_TTL_MS = 5 * 60 * 1000;

export function stringifyId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;

  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') {
      return value.toHexString();
    }

    if (value._id && value._id !== value) {
      return stringifyId(value._id);
    }
  }

  return String(value);
}

export function clampRadius(value) {
  const numeric = Number(value || DEFAULT_RADIUS_METERS);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_RADIUS_METERS;
  }

  return Math.min(Math.max(numeric, MIN_RADIUS_METERS), MAX_RADIUS_METERS);
}

export function normalizeLocation(input) {
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    radius: clampRadius(input?.radius),
  };
}

export function parseLocationQuery(query) {
  const normalized = normalizeLocation({
    lat: query?.lat,
    lng: query?.lng,
    radius: query?.radius,
  });

  return {
    hasLocation: !!normalized,
    location: normalized,
  };
}

export function formatDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return '\u2014';
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function buildLocationSearchParams(location) {
  const normalized = normalizeLocation(location);
  if (!normalized) {
    return new URLSearchParams();
  }

  return new URLSearchParams({
    lat: normalized.lat.toString(),
    lng: normalized.lng.toString(),
    radius: String(normalized.radius),
  });
}

export function createLocationCacheKey(location) {
  const normalized = normalizeLocation(location);
  if (!normalized) return '';

  const lat = normalized.lat.toFixed(5);
  const lng = normalized.lng.toFixed(5);
  return `${lat}:${lng}:${normalized.radius}`;
}

export function parsePlaceIds(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 50);
}
