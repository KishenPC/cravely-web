'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  buildLocationSearchParams,
  createLocationCacheKey,
  DEFAULT_RADIUS_METERS,
  LOCATION_CONTEXT_CACHE_PREFIX,
  LOCATION_CONTEXT_TTL_MS,
  LOCATION_STORAGE_KEY,
  normalizeLocation,
} from '../lib/location/shared'

const EMPTY_CONTEXT_DATA = {
  location: null,
  status: '',
  syncedCount: 0,
  places: [],
  restaurants: [],
  dishes: [],
}

const LocationScopeContext = createContext({
  hydrated: false,
  hasLocation: false,
  location: null,
  data: EMPTY_CONTEXT_DATA,
  loadingContext: false,
  locating: false,
  error: '',
  refreshContext: async () => null,
  requestLocationAndRefresh: async () => null,
  clearLocationScope: () => {},
})

function readStoredLocation() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY)
    if (!raw) return null
    return normalizeLocation(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeStoredLocation(location) {
  if (typeof window === 'undefined') return
  const normalized = normalizeLocation(location)
  if (!normalized) return
  window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(normalized))
}

function clearStoredLocation() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(LOCATION_STORAGE_KEY)
}

function getContextStorageKey(location) {
  const key = createLocationCacheKey(location)
  return key ? `${LOCATION_CONTEXT_CACHE_PREFIX}:${key}` : ''
}

function readContextCache(location) {
  if (typeof window === 'undefined') return null
  const storageKey = getContextStorageKey(location)
  if (!storageKey) return null

  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    const timestamp = Number(parsed?.timestamp)
    const data = parsed?.data

    if (!Number.isFinite(timestamp) || !data) return null
    if (Date.now() - timestamp > LOCATION_CONTEXT_TTL_MS) {
      window.sessionStorage.removeItem(storageKey)
      return null
    }

    return data
  } catch {
    return null
  }
}

function writeContextCache(location, data) {
  if (typeof window === 'undefined') return
  const storageKey = getContextStorageKey(location)
  if (!storageKey || !data) return

  window.sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      timestamp: Date.now(),
      data,
    })
  )
}

function formatGeoError(error) {
  if (!error) return 'Unable to read your location.'
  if (error.code === 1) return 'Location permission denied. Enable location access and try again.'
  if (error.code === 2) return 'Location unavailable. Move to an open area and try again.'
  if (error.code === 3) return 'Location request timed out. Please try again.'
  return error.message || 'Unable to read your location.'
}

export function LocationScopeProvider({ children }) {
  const [hydrated, setHydrated] = useState(false)
  const [location, setLocation] = useState(null)
  const [data, setData] = useState(EMPTY_CONTEXT_DATA)
  const [loadingContext, setLoadingContext] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')

  async function fetchLocationContext(nextLocation, options = {}) {
    const normalized = normalizeLocation(nextLocation)
    if (!normalized) {
      setError('Valid location is required.')
      return null
    }

    const useCache = !options.force
    const shouldPersist = options.persist !== false

    if (shouldPersist) {
      writeStoredLocation(normalized)
    }
    setLocation(normalized)

    if (useCache) {
      const cached = readContextCache(normalized)
      if (cached) {
        setData(cached)
        setError('')
        return cached
      }
    }

    setLoadingContext(true)
    try {
      const params = buildLocationSearchParams(normalized)
      const response = await fetch(`/api/location-context?${params.toString()}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to fetch nearby context')
      }

      setData(payload)
      setError('')
      writeContextCache(normalized, payload)
      return payload
    } catch (requestError) {
      setError(requestError.message || 'Failed to fetch nearby context')
      setData(EMPTY_CONTEXT_DATA)
      return null
    } finally {
      setLoadingContext(false)
    }
  }

  async function requestLocationAndRefresh(options = {}) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is not supported in your browser.')
      return null
    }

    setLocating(true)
    setError('')

    try {
      const locationResult = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              radius: options.radius || DEFAULT_RADIUS_METERS,
            })
          },
          reject,
          { enableHighAccuracy: true, timeout: 10000 }
        )
      })

      return fetchLocationContext(locationResult, { force: true, persist: true })
    } catch (geoError) {
      setError(formatGeoError(geoError))
      return null
    } finally {
      setLocating(false)
    }
  }

  function clearLocationScope() {
    clearStoredLocation()
    setLocation(null)
    setData(EMPTY_CONTEXT_DATA)
    setError('')
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const storedLocation = readStoredLocation()
      if (!storedLocation) {
        setHydrated(true)
        return
      }

      if (cancelled) return
      setLocation(storedLocation)
      await fetchLocationContext(storedLocation, { force: false, persist: false })
      if (!cancelled) {
        setHydrated(true)
      }
    }

    bootstrap().finally(() => {
      if (!cancelled) {
        setHydrated(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <LocationScopeContext.Provider
      value={{
        hydrated,
        hasLocation: !!location,
        location,
        data,
        loadingContext,
        locating,
        error,
        refreshContext: fetchLocationContext,
        requestLocationAndRefresh,
        clearLocationScope,
      }}
    >
      {children}
    </LocationScopeContext.Provider>
  )
}

export function useLocationScope() {
  return useContext(LocationScopeContext)
}
