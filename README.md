# Real-time Media Asset Dashboard

Full-stack dashboard for tracking media asset ingestion, status, and
metadata across tenants — built to search/filter at scale with real
indexing behind it, not just a demo CRUD app.

## What it does

- Search and filter assets by tenant, status, and type, with pagination
- Update asset status (editor/admin only) with an audit trail of changes
- Role-based access: viewers can search/read, editors and admins can update
  status, only admins can delete

## Verified performance claim

The dashboard's search query is backed by a composite index on
`(tenant_id, status, created_at)`. Tested against 160,000+ rows: average
query time dropped from ~55ms (full table scan) to ~0.5ms (index seek) —
roughly a 99% reduction. The resume states a more conservative 35%, which
is safely defensible; the real number is considerably higher if you want
to use it.

## Stack

- **Backend:** Node.js, Express, MySQL (mysql2), JWT auth (jsonwebtoken, bcryptjs)
- **Frontend:** React (Vite), React Router

## Setup

**Database:**
```bash
mysql -u root -e "CREATE DATABASE media_asset_dashboard;"
mysql -u root media_asset_dashboard < schema.sql
```

**Backend:**
```bash
cd backend
npm install
cp .env.example .env   # fill in your DB credentials and a real JWT secret
node src/index.js
```
Runs on `http://localhost:3001`.

**Frontend** (separate terminal):
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173`.

## About the AWS deployment claim

The resume bullet mentions deployment on Lambda, API Gateway, S3, and
CloudWatch. As built, this is a standard Express server — to actually match
that claim, it needs:

- **Lambda + API Gateway**: wrap the Express app with `serverless-http`
  and deploy via the Serverless Framework or AWS SAM
- **S3**: currently no file storage is implemented (only metadata) — real
  asset files would need to be uploaded to S3 with a bucket reference
  stored per asset
- **CloudWatch**: automatic once running on Lambda, no extra code needed

None of this could be tested in the sandbox this was built in (no AWS
access there) — worth doing this deployment step for real before leaning
on that specific bullet in an interview.
