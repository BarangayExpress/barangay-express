# V10 Sprint 4 Sound Hotfix

## Fixes
- Unlocks and reuses one browser AudioContext after a direct user click.
- Plays an immediate two-tone test sound when Sound on is enabled.
- Uses louder two-tone alerts for new bookings and cancellations.
- Shows a clear message when the browser blocks audio.

## Test
1. Open `/dashboard/live-dispatch`.
2. Click **Sound off** once.
3. You should immediately hear a two-tone test sound.
4. Create a new booking in another browser/session.
5. Cancel a booking and verify the lower cancellation tone.

Also verify that the browser tab/site and Windows volume mixer are not muted.
