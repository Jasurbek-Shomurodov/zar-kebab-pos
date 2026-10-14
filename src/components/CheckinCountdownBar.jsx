import React, { useState } from 'react'
import { CHECKIN_QR_SLOT_SECONDS } from '../lib/useRotatingCheckinQr'

// Time left on the shown check-in code. Mount it with key={slotEndsAt}: each
// new code starts its own bar at the real remaining time and only ever shrinks
// (one CSS animation, no per-second steps or regrowth).
export default function CheckinCountdownBar({ slotEndsAt }) {
  const slotMs = CHECKIN_QR_SLOT_SECONDS * 1000
  const [remainingMs] = useState(() => Math.max(0, Math.min(slotMs, slotEndsAt - Date.now())))
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#e8e4df]">
      <div className="zk-qr-countdown h-full w-full rounded-full bg-[#ff5a00]"
        style={{ '--zk-from': remainingMs / slotMs, animationDuration: `${remainingMs}ms` }} />
    </div>
  )
}
