# DECISIONS.md

## SAP Choice

I chose a flat CSV export modeled on SAP material/goods movement data rather than live IDoc, BAPI, or OData integration.

Why:

- sustainability teams often receive extracts from SAP rather than credentials to SAP APIs
- a flat export is realistic for a four-day prototype
- the hard part is mapping fields like plant, material group, quantity, entry unit, and posting date into emissions activity

Handled subset:

- fuel-like material groups: diesel, petrol, LPG
- SAP-style technical headers: `WERKS`, `MATKL`, `MENGE`, `MEINS`, `BUDAT`
- unit conversion for liters and gallons
- plant-code lookup for known facilities
- date formats including ISO, German-style dates, and SAP compact `YYYYMMDD`

Ignored:

- real IDoc segment parsing
- purchase order line hierarchies
- cost allocation across departments
- multilingual schemas beyond a few common field aliases
- material master joins beyond a small mapping table

Question for PM:

Which SAP extract can the client actually provide in week one: material document export, purchasing report, custom BW extract, OData endpoint, or IDoc drop?

## Utility Electricity Choice

I chose portal CSV exports rather than PDF OCR or live utility APIs.

Why:

- facilities teams commonly download bills or usage CSVs from utility portals
- PDF OCR is a separate extraction problem and would dominate the prototype
- utility APIs are fragmented by geography and authorization flow

Handled subset:

- meter/facility identifier
- billing start and end dates
- kWh and MWh usage
- utility provider and tariff metadata
- billing periods that do not align to calendar months

Ignored:

- interval readings
- demand charges
- time-of-use allocation
- renewable energy certificates
- market-based vs location-based Scope 2
- meter-to-building allocation

Question for PM:

Do auditors need monthly allocation by calendar month, or is billing-period reporting acceptable for this first workflow?

## Corporate Travel Choice

I chose a CSV export shaped like travel/expense platform data rather than live Concur/Navan OAuth.

Why:

- real corporate travel integrations require tenant-specific OAuth, scopes, and data sharing agreements
- travel exports often contain expense category, itinerary, airport codes, class, vendor, and cost center
- the prototype can show the important normalization problem without pretending to integrate with a live platform

Handled subset:

- flights with origin and destination airport codes
- distance inference for a small known airport-pair lookup
- economy vs business class factors
- hotels by room nights
- taxis and rail by kilometers

Ignored:

- multi-leg itineraries
- radiative forcing uplift choices
- employee privacy controls
- booking cancellations/refunds
- exact geospatial distance calculation

Question for PM:

Should travel emissions be based on booked trips, expensed trips, or completed trips? Those can differ materially.

## Review UX Choice

I built one analyst dashboard instead of many CRUD pages.

Why:

- the core workflow is triage, not record administration
- the analyst needs to see source, normalized activity, flags, CO2e, status, and actions in one place
- the API responses and JSON data file provide enough back-office inspection for a prototype

## Synchronous Processing Choice

Uploads process synchronously.

Why:

- sample files are small
- the prototype is easier to deploy
- the scoring focus is model and normalization judgment, not queue operations

Production would use Celery/RQ for large client files and retries.
