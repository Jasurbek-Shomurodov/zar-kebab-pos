import React, { isValidElement, useLayoutEffect, useRef, useState } from 'react'

// Odometer figures: each digit is a 0–9 strip that rolls into place, and rolls
// up or down when the figure changes. Custom tags keep page-wide span rules off
// the strips. Screen readers and reduced motion get the final text only.

// How long one roll takes; .roll-strip's transition in index.css uses the same duration.
const ROLL_MS = 900
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

// Characters keyed from the right, so a digit keeps its column when the figure grows or shrinks.
export function rollingColumns(text) {
  const chars = [...text]
  return chars.map((char, index) => ({ key: chars.length - index, char, digit: /[0-9]/.test(char) ? Number(char) : null }))
}

function RollingDigit({ digit, column }) {
  const [shown, setShown] = useState(0)
  const [settled, setSettled] = useState(false)
  const at = useRef(0)
  const strip = useRef(null)
  const delay = Math.min(column, 8) * 35

  useLayoutEffect(() => {
    setSettled(false)
    let timer
    // Two frames: the strip must be painted where it is before the move can animate.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const still = at.current === digit || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        at.current = digit
        setShown(digit)
        // A slide cut short before it began never reports an end, so rest once its time is up too.
        if (still) setSettled(true)
        else timer = setTimeout(() => setSettled(true), ROLL_MS + delay + 100)
      })
    })
    return () => { cancelAnimationFrame(frame); clearTimeout(timer) }
  }, [digit, delay])

  // React would listen for "TransitionEnd" on a custom element, so attach the listener directly.
  useLayoutEffect(() => {
    const node = strip.current
    const rest = () => setSettled(true)
    node?.addEventListener('transitionend', rest)
    return () => node?.removeEventListener('transitionend', rest)
  }, [settled])

  // A resting digit is plain text, so it lines up exactly with its neighbours.
  if (settled) return <roll-digit><roll-char>{digit}</roll-char></roll-digit>
  return (
    <roll-digit>
      <roll-strip ref={strip} style={{ transform: `translateY(-${shown * 10}%)`, '--roll-delay': `${delay}ms` }}>
        {DIGITS.map(item => <roll-char key={item}>{item}</roll-char>)}
      </roll-strip>
    </roll-digit>
  )
}

/** An already formatted figure (money, a percentage, a count) whose digits roll like an odometer. */
export function RollingText({ text }) {
  const value = String(text)
  return (
    <roll-text>
      <roll-chars aria-hidden="true">
        {rollingColumns(value).map(({ key, char, digit }) => digit === null
          ? <roll-char key={`c${key}`}>{char}</roll-char>
          : <RollingDigit key={`d${key}`} digit={digit} column={key} />)}
      </roll-chars>
      <span className="sr-only">{value}</span>
    </roll-text>
  )
}

/** Rolls a string or number figure; any other node (an icon, a composed label) renders unchanged. */
export function RollingValue({ value }) {
  if ((typeof value === 'string' || typeof value === 'number') && !isValidElement(value)) return <RollingText text={value} />
  return value ?? null
}

/** A word or name (not a figure) that rolls up out of view as its replacement rolls in, on the odometer's timing. */
export function RollingLabel({ text }) {
  const value = String(text)
  const [leaving, setLeaving] = useState(null)
  const shown = useRef(value)

  useLayoutEffect(() => {
    if (shown.current === value) return undefined
    const previous = shown.current
    shown.current = value
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    setLeaving(previous)
    const timer = setTimeout(() => setLeaving(null), ROLL_MS + 100)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <roll-label>
      {leaving !== null && <roll-out aria-hidden="true" key={`out-${leaving}`}>{leaving}</roll-out>}
      <roll-in key={value} data-rolling={leaving !== null ? '' : undefined}>{value}</roll-in>
    </roll-label>
  )
}
