# Barangay Express V8 — Live Dispatch Center

## What changed

- Added a dedicated **Live Dispatch** workspace in the admin sidebar.
- Pending bookings remain compatible with the stable **first rider to accept wins** workflow.
- Shows waiting time with amber/red urgency indicators.
- Shows active trips, online/available/busy riders, GPS-live count, and recent activity.
- Clicking a booking opens the existing Orders workspace with that booking searched.
- No sequential countdown or automatic rider rotation was added.

## Install

1. Stop the development server with `Ctrl + C`.
2. Replace the project with this version.
3. Restore `.env.local` and `node_modules`.
4. Run `npm run dev`.
5. Open `/dashboard` and choose **Live Dispatch** in the sidebar.

No new SQL migration or npm package is required.
