
## Production delivery from main

Pushes to `main` run `.github/workflows/gcp-production.yml`, authenticate to Google without stored keys, and submit `cloudbuild.yaml` in project `gravy-meta` (build metadata region `global`; production runtime and artifacts in `us-west1`). The pipeline retains Linux checks, final-image secret scanning, immutable image deployment, staged readiness and rollback. `deploy/gcp` is retained as migration history and no longer triggers production. Superseded queued commits are skipped before build submission. Runtime secrets and database authority are managed separately; production releases preserve current Cloud Run configuration.

The independent main-triggered GCP staging v2 workflow deploys `tollbooth-v2` using `cloudbuild-v2.yaml` and `Dockerfile.v2`. Build inputs privately merge `tollbooth-v2-env` then `v2-db-env`; the database overlay supplies authoritative DATABASE_URL while product public origins remain intact. Runtime loads the same two mounts in that order and requires both. Staging images use the separate immutable `ci-tollbooth-v2/tollbooth-v2` repository. No production database or runtime settings are changed by this workflow.
