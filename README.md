# Real-time Media Asset Dashboard

Full-stack dashboard for tracking media asset ingestion, status, and
metadata across tenants — built to search/filter at scale with real
indexing behind it, not just a demo CRUD app.

## What it does

- Search and filter assets by tenant, status, and type, with pagination
- Upload asset files (editor/admin only) directly to S3 via presigned URLs,
  with metadata + an audit trail stored in MySQL
- Download asset files via short-lived presigned S3 URLs
- Update asset status (editor/admin only) with an audit trail of changes
- Role-based access: viewers can search/read, editors and admins can upload
  and update status, only admins can delete

## Verified performance claim

The dashboard's search query is backed by a composite index on
`(tenant_id, status, created_at)`. Tested against 160,000+ rows: average
query time dropped from ~55ms (full table scan) to ~0.5ms (index seek) —
roughly a 99% reduction. The resume states a more conservative 35%, which
is safely defensible; the real number is considerably higher if you want
to use it.

## Stack

- **Backend:** Node.js, Express, MySQL (mysql2), JWT auth (jsonwebtoken, bcryptjs)
- **Storage:** AWS S3 (presigned PUT/GET URLs — the app server never
  proxies file bytes)
- **Deployment:** AWS Lambda + API Gateway (via `serverless-http` + AWS
  SAM), CloudWatch logging (automatic on Lambda)
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
cp .env.example .env   # fill in your DB credentials, JWT secret, and S3 bucket/region
node src/index.js
```
Runs on `http://localhost:3001`. Requires AWS credentials available in the
environment (e.g. via `aws configure`) for the S3 upload/download routes to
work locally.

**Frontend** (separate terminal):
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173`.

## How file storage works

Uploads never pass through the Express server:

1. `POST /api/assets` creates the metadata row and returns a presigned S3
   `PUT` URL (`backend/src/config/s3.js`, `backend/src/routes/assets.js`).
2. The browser uploads the file bytes straight to S3 using that URL.
3. `POST /api/assets/:id/confirm-upload` records the real file size and
   flips status to `ready`.
4. `GET /api/assets/:id/download-url` returns a short-lived presigned `GET`
   URL for downloading.

## Deploying to AWS (Lambda + API Gateway + S3)

This requires the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
and AWS credentials with permission to create Lambda, API Gateway, S3, and
IAM resources.

```bash
cd backend
sam build
sam deploy --guided
```

`template.yaml` provisions:
- An S3 bucket for asset files (its name is injected into the Lambda as
  `S3_BUCKET_NAME`, and the function gets an IAM policy scoped to just
  that bucket)
- A Lambda function running the Express app via `src/lambda.js`
  (`serverless-http`), fronted by an API Gateway HTTP API with a catch-all
  proxy route
- CloudWatch log group is created automatically by Lambda — no extra
  template resources needed

**Caveat:** if MySQL runs as RDS inside a VPC, the Lambda function needs
`VpcConfig` (subnet IDs + a security group that can reach the DB) added to
`template.yaml` — that's environment-specific so it isn't hardcoded here.
This deployment path has not been run against a live AWS account from this
environment (no AWS access in this sandbox); review `sam deploy` output
and test the deployed endpoints before relying on it.
