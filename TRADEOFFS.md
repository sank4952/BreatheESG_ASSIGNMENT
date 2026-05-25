# TRADEOFFS.md

## 1. No Live Enterprise Integrations

I did not build real SAP, utility, Concur, or Navan integrations.

Reason: live integrations require credentials, client-specific configuration, OAuth/security review, and retry/error handling. For a four-day prototype, static exports better test whether the ingestion and normalization model is sound.

## 2. No PDF OCR for Utility Bills

I did not parse utility bill PDFs.

Reason: PDF extraction would become its own product surface with template detection, OCR quality checks, and human correction. I chose portal CSV exports so the prototype could focus on billing periods, meters, kWh/MWh normalization, and review.

## 3. No Asynchronous Processing Queue

I did not add Celery, Redis, or background jobs.

Reason: synchronous uploads are enough for small prototype files and keep deployment simpler. In production, file processing should be backgrounded so large uploads do not block HTTP requests and failed jobs can be retried safely.

## 4. No Authentication System

I did not build full login, RBAC, or tenant membership management.

Reason: authentication is important, but it is not the assignment's hardest question. The schema includes tenant ownership and actor fields so auth can be added without remodelling the ingestion pipeline.

## 5. No Emission Factor Versioning Service

I store the factor used on each record, but I did not create a full versioned factor catalog.

Reason: a production ESG platform needs jurisdiction, year, source, version, and methodology metadata for factors. The prototype demonstrates reproducibility by storing the applied factor on the record, while keeping factor governance out of scope.

