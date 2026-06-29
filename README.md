# Red Raider Loyalty — Student Ticketing Platform

Texas Tech Athletics student engagement and spot-reservation system.

## Structure

```
├── css/
│   ├── variables.css       Design tokens (colors, spacing, fonts)
│   ├── components.css      Shared UI components (buttons, cards, badges, modals)
│   ├── student-layout.css  Mobile webview shell and student-specific styles
│   └── admin-layout.css    Admin sidebar layout and dashboard styles
│
├── js/
│   ├── data.js             Mock data — replace with TTU SSO + internal DB calls
│   ├── student.js          Student app interactions (drop, claim, reserve, toast)
│   └── admin.js            Admin interactions (modals, search, no-show, kiosk)
│
├── Pages/                  Student-facing mobile webview
│   ├── home.html           Home tab — greeting, points, upcoming events
│   ├── reservations.html   Reservations tab — event list with claim statuses
│   ├── rewards.html        Rewards tab — points balance + catalog
│   ├── activity.html       Activity tab — season stats + points history
│   ├── athleticfee.html    Fee not found — prompt to purchase athletic fee
│   ├── checkinresult.html  Post-scan result (confirmed / denied)
│   ├── error.html          Generic error page
│   ├── notenrolled.html    Student not enrolled in TTU
│   └── unauthorized.html   SSO login / access denied
│
└── Admin/                  Admin dashboard (browser)
    ├── dashboard.html      Event stats, game week timeline, selection buttons
    ├── events.html         Events table + new/edit event modal
    ├── activities.html     Class standing points + attendance tiers config
    ├── checkinwindows.html Window status per event + push notification log
    ├── rewards.html        Rewards catalog management
    ├── students.html       Student search + table
    ├── noshow.html         No-show dispute review (pending / resolved)
    └── kiosk.html          Gate check-in kiosk with auto-clear scan log
```

## Integration Notes

- **Auth:** TTU SSO — wire into `unauthorized.html` and `notenrolled.html`
- **DB:** All `data.js` constants replace with API calls to internal TTU database
- **SDK:** Sidearm SDK webview — student pages are mobile-first (max-width 480px)
- **Push notifications:** Segmented by window trigger (in `checkinwindows.html`); SDK integration is a future phase
- **Check-in:** Physical student ID scanned at gate — no digital copies accepted

## Key Terminology

| Old | New |
|-----|-----|
| Lottery | Reservations |
| Reservation System | Claims |
| Superfan | Student Victory Club |
| Ticket | Spot / Claim |
| Show at gate | Physical student ID required |
