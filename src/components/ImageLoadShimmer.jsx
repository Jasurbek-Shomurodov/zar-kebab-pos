import React, { useEffect, useRef, useState } from 'react'

export default function ImageLoadShimmer({
  src,
  alt = '',
  className = '',
  containerClassName = 'h-full w-full',
  fallback = null,
  loading = 'lazy',
  fetchPriority,
  timeoutMs = 12000,
}) {
  const imageRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
    setTimedOut(false)
    if (!src || !timeoutMs) return undefined
    const image = imageRef.current
    if (image?.complete && image.naturalWidth > 0) {
      setLoaded(true)
      return undefined
    }
    const timer = window.setTimeout(() => setTimedOut(true), timeoutMs)
    return () => window.clearTimeout(timer)
  }, [src, timeoutMs])

  if (!src || failed) {
    return fallback
  }

  return (
    <div className={`relative overflow-hidden bg-orange-50 ${containerClassName}`}>
      {!loaded && !timedOut && (
        <div className="zk-shimmer absolute inset-0 !rounded-none" />
      )}
      {timedOut && !loaded && fallback && (
        <div className="absolute inset-0 z-10">
          {fallback}
        </div>
      )}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className={`block ${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading={loading}
        decoding="async"
        fetchpriority={fetchPriority}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
