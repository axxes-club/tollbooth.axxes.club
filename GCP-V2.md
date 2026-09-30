# GCP v2 deployment

Staging service: `tollbooth-v2` at https://tollbooth.v2.axxes.app.

This branch uses the isolated Cloud SQL instance `gravy-meta:us-west1:axxes-v2-db`. It has the v1 schema and no customer data. Production stays on its current database and deployments.

The image uses Node 24 on Linux, Next.js standalone output, and port 8080. Cloud Build reads `tollbooth-v2-env` for build-time configuration. At runtime, mount that secret at `/secrets/env` and `v2-db-env` at `/database/env`; attach the Cloud SQL instance. Use `axxes-v2-runtime@gravy-meta.iam.gserviceaccount.com` and max-instances 1.

Set `NEXT_PUBLIC_AXXES_ENV=v2`, v2 auth URLs, and `AUTH_COOKIE_DOMAIN=v2.axxes.app`. These are already configured in the staging secret. Email, payment, uploads, and realtime need separate staging provider credentials before those features can be tested.

Build from this checkout:

```sh
gcloud builds submit --project gravy-meta --region us-west1 --config cloudbuild.yaml \
  --substitutions=_APP=tollbooth-v2,_TAG=$(git rev-parse --short HEAD)
```

Deploy only the verified resulting image to `tollbooth-v2` with the runtime settings above. Do not run migrations, seed customer data, deploy v1, or merge into main as part of this staging deployment. The manual rollout record is `~/Developer/AXXES-GCP-MIGRATION-LOG.md`.
