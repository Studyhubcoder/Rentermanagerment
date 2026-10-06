# Rent Manager v10 — MongoDB edition

This version keeps the existing mobile UI but adds a real Node.js + Express + MongoDB backend.

## What changed
- MongoDB is the shared database for landlord/renter data.
- Server-side JWT authentication for landlord and renter logins.
- Landlord can control all rental pages from one admin panel.
- Renter API responses are restricted to that renter's own record/bills/payments.
- The browser keeps a small local cache so refreshes remain fast; the server is the source of truth when connected.
- Existing rent, partial-payment, electricity-unit, payment timestamp, renter-details, photo and PDF features remain in the UI.

## Run locally
1. Install Node.js 20+.
2. Create a MongoDB Atlas database (or local MongoDB).
3. Copy `.env.example` to `.env` and fill in `MONGODB_URI` and `JWT_SECRET`.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

## Important
For real multi-device use, deploy this Node server over HTTPS. Do not put the MongoDB connection string in the HTML or expose MongoDB directly to renters.
