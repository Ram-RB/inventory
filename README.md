# Inventory Control

A mobile-friendly inventory web app for shared inventory tracking.

## Features

- Email/password sign in.
- Request-access flow for new users.
- Admin approval for pending users.
- Inventory entries with timestamp, SKU, name, quantity, photo, stored location, and updated-by user.
- Admin audit history showing who added inventory and when.
- Phone camera/gallery photo selection using `accept="image/*"` and `capture="environment"`.
- Vercel serverless API routes with Vercel Postgres storage.

## Demo Admin

- Email: `admin@inventory.local`
- Password: `admin123`

Change this seed account before using the app for real operations.

## Run Locally

Install dependencies:

```bash
npm install
```

Run with Vercel's local runtime:

```bash
npm run dev
```

The app expects a Vercel Postgres connection. Locally, add the Postgres environment variables Vercel provides after you create the database.

## Deploy To Vercel

1. Push this `inventory-app` folder to a GitHub repository.
2. In Vercel, import the GitHub repository.
3. Set the project root to this folder if the repository contains other files.
4. Add a Vercel Postgres database from the Vercel dashboard.
5. Connect the database to the project so `POSTGRES_URL` and related variables are added.
6. Deploy.

The database tables are created automatically on first API request. The default admin account is also seeded automatically if it does not exist.

## Production Notes

This version stores item photos as database text for simplicity. For heavier production use, move photos to Vercel Blob or another object-storage service and store only the image URL in Postgres.

For stronger production security, replace the simple client-held user ID flow with real sessions, JWTs, or an auth provider.
