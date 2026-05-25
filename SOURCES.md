# SOURCES.md

## SAP Fuel and Procurement

Researched format:

- SAP S/4HANA material/goods movement data, especially fields exposed by material document APIs and sustainability goods movement extraction views.
- SAP Help describes material document fields such as `PostingDate`, `QuantityInEntryUnit`, `EntryUnit`, and plant-related fields in material document APIs and sustainability extraction views.

Sources:

- [SAP Help: Create Material Documents](https://help.sap.com/docs/SAP_S4HANA-ON-PREMISE/eb2a39dd0c124fed8252f684002d55e1/8bb0d08295044ee3af444b4f2a6e4457.html)
- [SAP Help: Sustainability Goods Movement Document](https://help.sap.com/docs/SAP_S4HANA_CLOUD/c0c54048d35849128be8e872df5bea6d/db7150f291e24e2195a14df61d3e6fd0.html)
- [SAP Help: Material Document extraction field list](https://help.sap.com/docs/SAP_SUS_SDI/b15a1be1941c44d4be60ba206536283d/4330561ee32b46e8b2f45a0acd6d4570.html)

What I learned:

- SAP exports often carry terse technical field names instead of analyst-friendly labels.
- Plant, material, quantity, unit, and posting date are central to fuel/procurement normalization.
- Unit and plant metadata often require lookup tables outside the export itself.

Sample data shape:

`samples/sap_fuel_export.csv` uses:

- `WERKS` for plant
- `MATKL` for material group
- `MENGE` for quantity
- `MEINS` for entry unit
- `BUDAT` for posting date

It includes liters, gallons, German date format, compact SAP-style date format, a negative reversal-like row, an unknown plant, and an unsupported material group.

What would break in a real deployment:

- unknown or client-specific material codes
- SAP exports where fuel is represented through purchase orders rather than goods movements
- multiple plants mapped to one reporting facility
- unit conversions requiring density, not simple volume conversion
- cancellation/reversal documents that should net against previous postings

## Utility Electricity

Researched format:

- Utility portal exports and Green Button-style usage/bill data.
- Green Button usage summaries map bill concepts to structured fields like meter/read information, billing-period cost, and usage summary data.

Sources:

- [Green Button Alliance: Utility-Bill Data Mapping](https://www.greenbuttonalliance.org/utility-bill-data)
- [UtilityAPI: Interval and Green Button data documentation](https://utilityapi.com/docs/api/intervals)

What I learned:

- Utility data is often organized by meter or usage point.
- Billing periods do not necessarily match calendar months.
- Usage units and tariff metadata matter, but tariff charges are not the same as energy consumption.

Sample data shape:

`samples/utility_electricity_export.csv` uses:

- `meter_id`
- `billing_start`
- `billing_end`
- `kwh`
- `unit`
- `utility`
- `tariff`

It includes kWh, MWh, non-calendar billing periods, invalid billing dates, and an unusually high usage row.

What would break in a real deployment:

- time-of-use intervals requiring allocation by tariff bucket
- demand charges that do not translate directly to kWh
- net metering, exported energy, and on-site solar
- missing meter-to-facility mapping
- location-based vs market-based Scope 2 method selection

## Corporate Travel

Researched format:

- SAP Concur travel allowance and expense report documentation, plus common corporate travel export fields.
- Concur documentation shows itinerary concepts such as start location, destination/arrival location, expense reports, and travel allowance contexts.

Sources:

- [SAP Help: Creating an Expense Report](https://help.sap.com/docs/CONCUR_EXPENSE/bb83754b1c5541808d50c09901e11475/160d8ccbf30a4c0c93fdf7ddfcf5869a.html)
- [SAP Concur Developer Center: Travel Allowance v4 Calculation Results](https://preview.developer.concur.com/api-reference/travelallowance/v4.travelallowance-calculationresults-endpoints.html)

What I learned:

- Travel platforms expose a mixture of expense categories, itinerary locations, dates, employee/cost center metadata, and sometimes calculated travel allowance details.
- Distance is not guaranteed. Flights may need airport-code distance inference.
- Category matters because flights, hotels, taxis, and rail use different activity units and factors.

Sample data shape:

`samples/travel_platform_export.csv` uses:

- `employee_id`
- `category`
- `transaction_date`
- `from_airport`
- `to_airport`
- `class`
- `distance_km`
- `nights`
- `vendor`
- `cost_center`

It includes flights inferred from airport codes, business vs economy class, hotels by room nights, taxi distance, and an unknown airport pair that fails normalization.

What would break in a real deployment:

- multi-leg trips
- rail and car rentals without distance
- canceled or refunded bookings
- missing cabin class
- airport aliases and city names instead of IATA codes
- privacy constraints around employee-level travel data

