# Storefront API

This step connects the frontend catalog to Postgres through Express.
Postgres stores the 38 sample products, including their prices and availability.
Search, filters, sorting, pagination, and product details use the API.
The browser still stores the cart, saved items, demo profile, and demo orders.
The next step will move the cart and demo orders into Postgres.
Checkout does not charge money.

## Run locally

Use Node 22.9 or newer and Docker or Podman.
The Compose file starts Postgres on the local interface with a persistent volume.
The password in `.env.example` is for local use.
Copy the example before you start the API.
If port 5432 is occupied, change the mapped port and `DATABASE_URL`.

```sh
docker compose up -d --wait
cp .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm start
```

For Podman, use this command instead of the Docker command.
Podman must have a Compose provider installed.
The other commands remain the same.

```sh
podman compose up -d
```

From the frontend directory, run `npm run dev`.
Vite forwards `/api` requests to `http://127.0.0.1:3001`.
Leave `VITE_API_URL` empty for this local proxy.
For a deployed frontend, set `VITE_API_URL` to the API origin before the build.
The existing frontend workflow already sets `https://api.playground.hienvuong.com`.

## API routes

All prices use USD.
The search response contains `products`, `total`, `limit`, and `offset`.
Product images remain relative paths to assets in the frontend.
The catalog snapshot loads all sample products for the home page and browser cart.
For a larger catalog, replace the snapshot with separate home and cart queries.

| Request                 | Response                                      |
| ----------------------- | --------------------------------------------- |
| `GET /api/catalog`      | Products and departments                      |
| `GET /api/products`     | Search results, default 24 items, maximum 100 |
| `GET /api/products/:id` | One product, or HTTP 404                      |
| `GET /livez`            | Process health                                |
| `GET /readyz`           | Database and schema health, or HTTP 503       |

Search accepts `k`, `department`, `rating`, `price`, `deals`, `sort`, `limit`, and `offset`.
`price` is the maximum price and `deals=1` selects discounted products.
`sort` accepts `featured`, `price-asc`, `price-desc`, or `rating`.
Invalid parameters return HTTP 400.
Database failures return HTTP 503 without credentials or database error details.
The telemetry routes `/api/hello` and `/api/error` remain available.

## Test with Postgres

Set `TEST_DATABASE_URL` to a separate database before you run the tests.
The tests create an isolated schema and remove that schema afterward.
They exercise HTTP requests against a real database.
They include filters, paging, invalid inputs, repeated migrations, database changes, CORS, and outages.
For local Postgres, use `PGSSLMODE=disable`.

```sh
TEST_DATABASE_URL=postgresql://storefront:storefront@127.0.0.1:5432/storefront_test PGSSLMODE=disable LOG_LEVEL=silent npm test
```

Create `storefront_test` first with `createdb` or a command inside the Postgres container.
The test suite does not use the application database by default.
Do not use production credentials for tests.

## Azure proposal and deployment order

Add one Azure Database for PostgreSQL Flexible Server in `westeurope`, beside the existing AKS cluster.
For this playground, start with the Burstable `Standard_B1ms` SKU, 32 GiB storage, and seven days of backup retention.
Use PostgreSQL 17 and one `storefront` database.
High availability is optional for this playground.
Azure charges for this server, storage, and backups beyond the included allowance.
Confirm the current regional price and quota before creation.

Use the existing AKS cluster to run the API.
The server is created by Terraform in `infra/cloud/postgres.tf` with Entra authentication only, so there is no password and no connection secret.
The backend workload identity is the server's Entra administrator and logs in with an access token as the password.
The deployment sets `PGHOST`, `PGUSER`, and `PGDATABASE`; `src/db/pool.js` fetches the token with `@azure/identity`.
Public access is allowed for Azure services (firewall rule `0.0.0.0`); a private endpoint can replace it later.
Keep verified TLS enabled with `PGSSLMODE=verify-full`.
The API verifies the server certificate with the Node trust store.
If Azure requires another root certificate, mount it and set `PGSSLROOTCERT` to its path.

Apply the Terraform in `infra/cloud` and `infra/k8s/terraform` before you deploy these code changes.
The [deployment](deploy/deployment.yaml) runs migration and seed commands in an init container before it starts the API.
A migration applies each SQL file once and locks concurrent runs.
The seed inserts missing sample IDs and keeps existing values.
For this playground, the database role needs schema creation and product read/write access.
For production, separate the migration role from the API read role.

The backend workflow builds an image and updates its tag through a deployment PR.
Kustomize applies that same tag to the init container and API container.
The readiness probe waits for database access and the product table.
The CORS list includes the current Static Web Apps host and the planned custom domain.
If the frontend host changes, update `CORS_ORIGINS` in the deployment.
Deploy the backend before the frontend, then test `/readyz`, search, and a product page.

No new Storage Account is needed for the existing product images.
Add Blob Storage when the app needs uploaded product images.
This step does not create cloud resources, apply Terraform, or deploy changes.
