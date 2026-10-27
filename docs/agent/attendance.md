# Attendance Check-in

## Entry points

- Shared rules/messages: `src/lib/attendance.js`
- Entrance screen (signed out): `src/pages/AttendanceKiosk.jsx`, route `/checkin-screen` (public host redirects to admin, keeping the hash)
- Owner UI: `src/pages/Employees.jsx` (screen link dialog, Present/Not checked in, Work starts)
- Drawer QR: `src/pages/CheckinQr.jsx` (`/checkin-qr`), tab in `src/components/UnifiedSidebar.jsx`, access hook `src/lib/attendanceQrAccess.js`; shared loop and wake lock `src/lib/useRotatingCheckinQr.js`
- Settings: `src/components/AttendanceQrAccessSettings.jsx` in `src/pages/AdminSettings.jsx`
- Bot: `api/telegram/webhook.js` (`checkInEmployee`)
- Schema: `migrations/243_employee_attendance_checkins.sql`, `migrations/245_attendance_kiosk_rotating_qr.sql`, `migrations/247_attendance_qr_drawer_access.sql` (245 is live; change it only through new migrations)
- Test: `tests/employeeAttendance.test.js`

## Flow

- A manager with Accounting write creates one screen link (`create_attendance_kiosk`); a new link or `revoke_attendance_kiosks` disables the previous screen. Only one screen is active.
- The dialog shows the one-time link with a QR of it (rendered locally with `qrcode` via `buildAttendanceKioskQrDataUrl`; never a hosted QR service) so the entrance device can scan it open.
- The key lives only in the URL hash; the screen stores it in localStorage and strips it from the address bar. Keys are stored as SHA-256 hashes.
- The screen calls `get_attendance_kiosk_token` (anon) every 15 s slot (`247`) and shows `t.me/<bot>?start=ci_<code>_<slot>_<sig>`. The signature secret never leaves the database. The call doubles as a heartbeat (`last_seen_at`, shown as Screen online within 90 s).
- If refreshes fail for 60 s the screen hides the QR (offline state) instead of showing a code that may be rejected. It holds a Wake Lock while active.
- The webhook verifies with `verify_attendance_checkin_payload` (service role) using Telegram's `message.date`, not receipt time: valid from two 15 s slots before to eight after the code's slot (about 2 to 2.25 minutes). Saved/forwarded links expire; tampered, forged or revoked codes are invalid. The retired printed `/start checkin` gets a "scan the screen" reply.
- Drawer: Settings writers pick accounts with a daily Tashkent window (`attendance_qr_access`; start = end is all day, end < start wraps midnight). The tab shows only for selected active accounts inside their window (the page shows the hours if opened directly outside it); `get_attendance_qr_token` refuses codes and signs with a shared `staff` row created on first use. Screen links never revoke it. `247` removed the 245 Dashboard card and revoked its `dashboard` signer.
- Start date (`249`): `ATTENDANCE_START_DATE` = 2026-10-15 (Tashkent), mirrored in the migration's insert/update trigger. Before it the bot replies "starts 15 October" without verifying, the screen and drawer show that instead of a QR (they switch at Tashkent midnight without reload), and Employees hides Checked in, Not checked in and checked-in Active daily; the screen link and Work starts stay editable.
- Remote (`252`, `employee_salary_profiles.works_remotely`, editor switch): the employee drops out of Checked in today, never shows Not checked in or Work starts, and their daily pay always counts in checked-in Active daily. The page only sends the column when loaded rows have it, so it keeps saving before the migration.
- Identity is the linked salary Telegram (`employee_salary_telegram_links`); inactive or deleted employees are refused.

## Records

- One row per employee per Tashkent date; the first scan wins (`ignoreDuplicates`), later scans echo the stored time.
- Rows snapshot `work_start_time` and arrival status (`early`, `on_time`, `late`, `no_schedule`) in whole minutes; editing the start time never rewrites history.
- No fines or bonuses. From 2026-10-15 (`269`, backfilled once on 2026-10-27, `MISSING_CHECKIN_ABSENCE_START_DATE`) the daily-salary cron records an on-site employee's closed day (after 04:00) without a check-in as a silent `No QR check-in` absence before meals/KPI/summaries, so every salary reader drops that day's pay. Remote employees are skipped. Test: `tests/missingCheckinAbsences.test.js`. From 2026-10-16 the check-in starts the employee's KPI window (`254`, see payroll.md); no check-in means no KPI that day. Staff read via `expenses` RLS; only the service role writes.
- Deploy migrations before the frontend/webhook: the old webhook ignores rotating payloads.
