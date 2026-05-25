import { SOURCE_TYPES } from "./constants.js";

const unitAliases = {
  L: ["liters", 1],
  LTR: ["liters", 1],
  LITER: ["liters", 1],
  LITERS: ["liters", 1],
  GAL: ["liters", 3.78541],
  GALLON: ["liters", 3.78541],
  KWH: ["kWh", 1],
  MWH: ["kWh", 1000],
};

const materialMap = {
  DIESEL: {
    activity_type: "diesel_stationary_combustion",
    category: "fuel_combustion",
    scope: "SCOPE_1",
    emission_factor: 2.68,
  },
  PETROL: {
    activity_type: "petrol_stationary_combustion",
    category: "fuel_combustion",
    scope: "SCOPE_1",
    emission_factor: 2.31,
  },
  LPG: {
    activity_type: "lpg_combustion",
    category: "fuel_combustion",
    scope: "SCOPE_1",
    emission_factor: 1.51,
  },
};

const plantLookup = {
  "1000": "BLR-MFG-01",
  "1100": "PUN-WH-02",
  DE01: "BER-OFF-01",
};

const airportDistancesKm = {
  "BLR:DEL": 1740,
  "DEL:BLR": 1740,
  "BLR:BOM": 840,
  "BOM:BLR": 840,
  "BOM:LHR": 7200,
  "LHR:BOM": 7200,
  "SFO:JFK": 4160,
  "JFK:SFO": 4160,
};

const travelFactors = {
  flight_economy: 0.115,
  flight_business: 0.23,
  hotel_room_night: 18,
  taxi_km: 0.18,
  rail_km: 0.041,
};

const gridElectricityFactor = 0.716;

function pick(row, ...names) {
  const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value]));
  for (const name of names) {
    const value = lower[name.toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function parseNumber(value, fieldName) {
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  if (!Number.isFinite(parsed)) throw new Error(`${fieldName} must be numeric`);
  return parsed;
}

function toIsoDate(value) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;

  const dot = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dot) return `${dot[3]}-${dot[2]}-${dot[1]}`;

  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;

  throw new Error(`unsupported date format: ${raw}`);
}

function dateValue(iso) {
  return new Date(`${iso}T00:00:00.000Z`).getTime();
}

function normalizeUnit(value, unit) {
  const spec = unitAliases[String(unit ?? "").trim().toUpperCase()];
  if (!spec) throw new Error(`unsupported unit ${unit}`);
  return [value * spec[1], spec[0]];
}

function flagLargeOrNegative(value, threshold, label) {
  if (value < 0) return [true, `Negative ${label}; likely reversal or bad export sign`];
  if (value > threshold) return [true, `Unusually high ${label} for prototype rule threshold`];
  return [false, ""];
}

export function normalizeRow(sourceType, row) {
  try {
    if (sourceType === SOURCE_TYPES.SAP) return { payload: normalizeSap(row), error: "" };
    if (sourceType === SOURCE_TYPES.UTILITY) return { payload: normalizeUtility(row), error: "" };
    if (sourceType === SOURCE_TYPES.TRAVEL) return { payload: normalizeTravel(row), error: "" };
    return { payload: null, error: `unsupported source type ${sourceType}` };
  } catch (error) {
    return { payload: null, error: error.message };
  }
}

function normalizeSap(row) {
  const material = String(pick(row, "MATKL", "MaterialGroup", "material_group", "Warengruppe") ?? "").trim().toUpperCase();
  const spec = materialMap[material];
  if (!spec) throw new Error(`unsupported material group ${material}`);

  const sourceValue = parseNumber(pick(row, "MENGE", "QuantityInEntryUnit", "quantity"), "quantity");
  const sourceUnit = pick(row, "MEINS", "EntryUnit", "unit");
  const [value, unit] = normalizeUnit(sourceValue, sourceUnit);
  const postingDate = toIsoDate(pick(row, "BUDAT", "PostingDate", "posting_date"));
  const plant = String(pick(row, "WERKS", "Plant", "plant") ?? "").trim();
  let [isFlagged, flagReason] = flagLargeOrNegative(value, 10000, "fuel quantity");

  if (plant && !plantLookup[plant]) {
    isFlagged = true;
    flagReason = `${flagReason ? `${flagReason}; ` : ""}Unknown SAP plant code`;
  }

  return {
    scope: spec.scope,
    category: spec.category,
    activity_type: spec.activity_type,
    activity_value: round(sourceValue),
    activity_unit: String(sourceUnit),
    normalized_value: round(value),
    normalized_unit: unit,
    emission_factor: spec.emission_factor,
    co2e_kg: round(value * spec.emission_factor),
    start_date: postingDate,
    end_date: postingDate,
    facility_code: plantLookup[plant] || plant,
    supplier: String(pick(row, "LIFNR", "Supplier", "vendor") ?? ""),
    is_flagged: isFlagged,
    flag_reason: flagReason,
  };
}

function normalizeUtility(row) {
  const sourceValue = parseNumber(pick(row, "kwh", "usage_kwh", "Usage", "total_usage"), "kWh");
  const sourceUnit = pick(row, "unit", "usage_unit") || "kWh";
  const [value, unit] = normalizeUnit(sourceValue, sourceUnit);
  const start = toIsoDate(pick(row, "billing_start", "from_date", "start_date", "Bill Start"));
  const end = toIsoDate(pick(row, "billing_end", "to_date", "end_date", "Bill End"));
  let [isFlagged, flagReason] = flagLargeOrNegative(value, 50000, "electricity usage");

  if (dateValue(end) <= dateValue(start)) {
    isFlagged = true;
    flagReason = `${flagReason ? `${flagReason}; ` : ""}Billing end is not after billing start`;
  }

  return {
    scope: "SCOPE_2",
    category: "purchased_electricity",
    activity_type: "grid_electricity",
    activity_value: round(sourceValue),
    activity_unit: String(sourceUnit),
    normalized_value: round(value),
    normalized_unit: unit,
    emission_factor: gridElectricityFactor,
    co2e_kg: round(value * gridElectricityFactor),
    start_date: start,
    end_date: end,
    facility_code: String(pick(row, "meter_id", "Meter", "usage_point") ?? ""),
    supplier: String(pick(row, "utility", "supplier", "provider") ?? ""),
    is_flagged: isFlagged,
    flag_reason: flagReason,
  };
}

function normalizeTravel(row) {
  const category = String(pick(row, "category", "expense_type", "type") ?? "").trim().toLowerCase();
  const start = toIsoDate(pick(row, "start_date", "transaction_date", "date"));
  const end = toIsoDate(pick(row, "end_date", "transaction_date", "date"));
  let value;
  let factor;
  let activityType;
  let isFlagged;
  let flagReason;

  if (category.includes("flight") || pick(row, "from_airport", "origin_airport")) {
    const origin = String(pick(row, "from_airport", "origin_airport", "origin") ?? "").trim().toUpperCase();
    const destination = String(pick(row, "to_airport", "destination_airport", "destination") ?? "").trim().toUpperCase();
    const distance = pick(row, "distance_km") || airportDistancesKm[`${origin}:${destination}`];
    if (!distance) throw new Error("missing distance and unknown airport pair");
    value = parseNumber(distance, "distance_km");
    const travelClass = String(pick(row, "class", "cabin_class") || "economy").toLowerCase();
    activityType = travelClass.includes("business") ? "flight_business" : "flight_economy";
    factor = travelFactors[activityType];
    [isFlagged, flagReason] = flagLargeOrNegative(value, 12000, "flight distance");
  } else if (category.includes("hotel")) {
    value = parseNumber(pick(row, "nights", "room_nights"), "room nights");
    activityType = "hotel_room_night";
    factor = travelFactors[activityType];
    [isFlagged, flagReason] = flagLargeOrNegative(value, 30, "hotel nights");
  } else {
    value = parseNumber(pick(row, "distance_km", "km"), "distance_km");
    const mode = category.includes("rail") || category.includes("train") ? "rail" : "taxi";
    activityType = `${mode}_km`;
    factor = travelFactors[activityType];
    [isFlagged, flagReason] = flagLargeOrNegative(value, mode === "rail" ? 2000 : 1000, `${mode} distance`);
  }

  const unit = activityType === "hotel_room_night" ? "night" : "km";
  return {
    scope: "SCOPE_3",
    category: "business_travel",
    activity_type: activityType,
    activity_value: round(value),
    activity_unit: unit,
    normalized_value: round(value),
    normalized_unit: unit,
    emission_factor: factor,
    co2e_kg: round(value * factor),
    start_date: start,
    end_date: end,
    facility_code: String(pick(row, "cost_center", "department") ?? ""),
    supplier: String(pick(row, "vendor", "supplier", "merchant") ?? ""),
    is_flagged: isFlagged,
    flag_reason: flagReason,
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

