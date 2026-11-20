// Schema registry: canonical entity types, their fields and header aliases.
// The import wizard, validation and the data quality panel read from here.
// Modules register more entity types through their manifest.
import {
  ASSUMPTION_STATUSES,
  EFFORT_OPP_TYPES,
  PERSON_STATUSES,
  PRACTICE_TYPES,
  PRICING_MODELS,
  ROLE_FAMILIES,
  SERVICE_CATEGORIES,
} from './types';

export type FieldType = 'string' | 'number' | 'money' | 'percent' | 'integer' | 'boolean' | 'enum' | 'list' | 'month' | 'date';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  enum?: readonly string[];
  /** Lowercased header names that auto-map to this field. */
  aliases?: string[];
  /** Reference to another entity type, for the data quality panel. */
  ref?: string;
  sensitive?: boolean;
}

export interface EntitySchema {
  type: string;
  label: string;
  /** Where rows land: an entities collection, or 'assumptions'. */
  collection: string;
  idField: string;
  fields: FieldDef[];
  /** Generates an id when the source has none. */
  idPrefix: string;
  ownerModule?: string;
}

const registry = new Map<string, EntitySchema>();

export function registerEntity(s: EntitySchema) {
  registry.set(s.type, s);
}
export function getEntitySchema(type: string): EntitySchema | undefined {
  return registry.get(type);
}
export function entitySchemas(): EntitySchema[] {
  return [...registry.values()];
}

registerEntity({
  type: 'assumption',
  label: 'Assumptions register',
  collection: 'assumptions',
  idField: 'id',
  idPrefix: 'R',
  fields: [
    { key: 'id', label: 'ID', type: 'string', required: true, aliases: ['id', 'ref', 'r#', 'assumption id', 'register id'] },
    { key: 'label', label: 'Label', type: 'string', required: true, aliases: ['label', 'assumption', 'name', 'description', 'item'] },
    { key: 'value', label: 'Value', type: 'number', aliases: ['value', 'base', 'base value', 'number', 'amount'] },
    { key: 'low', label: 'Low', type: 'number', aliases: ['low', 'min', 'low value'] },
    { key: 'high', label: 'High', type: 'number', aliases: ['high', 'max', 'high value'] },
    { key: 'unit', label: 'Unit', type: 'string', aliases: ['unit', 'units', 'uom'] },
    { key: 'status', label: 'Status', type: 'enum', enum: ASSUMPTION_STATUSES, aliases: ['status', 'confidence', 'state'] },
    { key: 'source', label: 'Source', type: 'string', aliases: ['source', 'sources', 'reference', 'citation'] },
    { key: 'asOf', label: 'As of', type: 'string', aliases: ['as of', 'as-of', 'asof', 'date', 'as of date'] },
    { key: 'usedIn', label: 'Used in', type: 'string', aliases: ['used in', 'usedin', 'used', 'where used'] },
    { key: 'notes', label: 'Notes', type: 'string', aliases: ['notes', 'note', 'comments', 'comment'] },
    { key: 'formula', label: 'Formula', type: 'string', aliases: ['formula', 'calc', 'calculation', 'derived'] },
  ],
});

registerEntity({
  type: 'person',
  label: 'People (roster and comp)',
  collection: 'people',
  idField: 'id',
  idPrefix: 'p',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id', 'employee id', 'emp id', 'person id', 'worker id'] },
    { key: 'name', label: 'Name', type: 'string', required: true, aliases: ['name', 'employee', 'employee name', 'full name', 'person'] },
    { key: 'title', label: 'Title', type: 'string', aliases: ['title', 'job title', 'position', 'role'] },
    { key: 'roleFamily', label: 'Role family', type: 'enum', enum: ROLE_FAMILIES, required: true, aliases: ['role family', 'rolefamily', 'family', 'job family', 'role type'] },
    { key: 'territory', label: 'Territory', type: 'string', ref: 'territory', aliases: ['territory', 'region', 'area'] },
    { key: 'team', label: 'Team', type: 'string', aliases: ['team', 'pod', 'group'] },
    { key: 'practices', label: 'Practices', type: 'list', aliases: ['practices', 'practice', 'lines', 'line', 'focus'] },
    { key: 'managerId', label: 'Manager ID', type: 'string', ref: 'person', aliases: ['manager id', 'managerid', 'manager', 'reports to', 'supervisor'] },
    { key: 'location', label: 'Location', type: 'string', aliases: ['location', 'city', 'office', 'state'] },
    { key: 'base', label: 'Base salary', type: 'money', sensitive: true, aliases: ['base', 'base salary', 'salary', 'annual base'] },
    { key: 'variableTarget', label: 'Variable target', type: 'money', sensitive: true, aliases: ['variable', 'variable target', 'commission target', 'bonus target', 'target incentive', 'tic'] },
    { key: 'burdenPct', label: 'Burden %', type: 'percent', sensitive: true, aliases: ['burden', 'burden %', 'burden pct', 'benefits load'] },
    { key: 'fte', label: 'FTE', type: 'number', aliases: ['fte', 'allocation'] },
    { key: 'status', label: 'Status', type: 'enum', enum: PERSON_STATUSES, aliases: ['status', 'employment status', 'seat status'] },
    { key: 'startMonth', label: 'Start month (0 = approval)', type: 'month', aliases: ['start month', 'start'] },
    { key: 'endMonth', label: 'End month', type: 'month', aliases: ['end month', 'end'] },
  ],
});

registerEntity({
  type: 'territory',
  label: 'Territories',
  collection: 'territories',
  idField: 'id',
  idPrefix: 't',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id', 'territory id', 'code'] },
    { key: 'name', label: 'Name', type: 'string', required: true, aliases: ['name', 'territory', 'territory name', 'region'] },
    { key: 'rvp', label: 'RVP', type: 'string', aliases: ['rvp', 'regional vice president', 'vp'] },
    { key: 'regionalDirectors', label: 'Regional directors', type: 'list', aliases: ['regional directors', 'regional director', 'rd', 'rds', 'directors'] },
  ],
});

registerEntity({
  type: 'practice',
  label: 'Practices and lines',
  collection: 'practices',
  idField: 'id',
  idPrefix: 'pr',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id', 'code'] },
    { key: 'name', label: 'Name', type: 'string', required: true, aliases: ['name', 'practice', 'line'] },
    { key: 'type', label: 'Type', type: 'enum', enum: PRACTICE_TYPES, aliases: ['type', 'kind'] },
  ],
});

registerEntity({
  type: 'account',
  label: 'Accounts',
  collection: 'accounts',
  idField: 'id',
  idPrefix: 'a',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id', 'account id', 'customer id'] },
    { key: 'name', label: 'Name', type: 'string', required: true, aliases: ['name', 'account', 'account name', 'customer', 'customer name'] },
    { key: 'territory', label: 'Territory', type: 'string', ref: 'territory', aliases: ['territory', 'region'] },
    { key: 'owner', label: 'Owner', type: 'string', aliases: ['owner', 'account owner', 'rep', 'seller'] },
    { key: 'tier', label: 'Tier (1 to 3)', type: 'integer', aliases: ['tier', 'account tier'] },
    { key: 'segment', label: 'Segment', type: 'string', aliases: ['segment', 'vertical'] },
  ],
});

registerEntity({
  type: 'revenueFact',
  label: 'Revenue and GP by line',
  collection: 'revenueFacts',
  idField: 'id',
  idPrefix: 'rv',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id'] },
    { key: 'account', label: 'Account', type: 'string', ref: 'account', aliases: ['account', 'customer', 'account name'] },
    { key: 'line', label: 'Practice or line', type: 'string', required: true, aliases: ['line', 'practice', 'product line', 'oem', 'category'] },
    { key: 'period', label: 'Period', type: 'string', required: true, aliases: ['period', 'quarter', 'month', 'fiscal period'] },
    { key: 'revenue', label: 'Revenue', type: 'money', aliases: ['revenue', 'rev', 'sales', 'bookings'] },
    { key: 'gp', label: 'GP', type: 'money', aliases: ['gp', 'gross profit', 'margin $', 'gross margin'] },
    { key: 'specialistTouched', label: 'Specialist touched', type: 'boolean', aliases: ['specialist touched', 'touched', 'specialist'] },
    { key: 'source', label: 'Source', type: 'string', aliases: ['source'] },
  ],
});

registerEntity({
  type: 'opportunity',
  label: 'Opportunities',
  collection: 'opportunities',
  idField: 'id',
  idPrefix: 'o',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id', 'opportunity id', 'opp id'] },
    { key: 'account', label: 'Account', type: 'string', ref: 'account', aliases: ['account', 'account name'] },
    { key: 'line', label: 'Line', type: 'string', aliases: ['line', 'product line', 'practice'] },
    { key: 'stage', label: 'Stage', type: 'string', aliases: ['stage', 'sales stage'] },
    { key: 'amount', label: 'Amount', type: 'money', aliases: ['amount', 'total amount', 'revenue'] },
    { key: 'gp', label: 'GP', type: 'money', aliases: ['gp', 'gross profit', 'expected gp'] },
    { key: 'closeDate', label: 'Close date', type: 'date', aliases: ['close date', 'closedate', 'close'] },
    { key: 'specialist', label: 'Specialist', type: 'string', aliases: ['specialist'] },
    { key: 'sa', label: 'Solutions architect', type: 'string', aliases: ['sa', 'solutions architect', 'architect'] },
  ],
});

registerEntity({
  type: 'effortLog',
  label: 'Specialist effort review',
  collection: 'effortLogs',
  idField: 'id',
  idPrefix: 'e',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id'] },
    { key: 'person', label: 'Person', type: 'string', aliases: ['person', 'specialist', 'name'] },
    { key: 'period', label: 'Period', type: 'string', aliases: ['period', 'month', 'quarter'] },
    { key: 'account', label: 'Account', type: 'string', ref: 'account', aliases: ['account', 'account name', 'customer'] },
    { key: 'opportunityType', label: 'Opportunity type', type: 'enum', enum: EFFORT_OPP_TYPES, required: true, aliases: ['opportunity type', 'opp type', 'type'] },
    { key: 'effort', label: 'Effort (points or hours)', type: 'number', required: true, aliases: ['effort', 'effort points', 'points', 'hours'] },
    { key: 'revenue6mo', label: 'Revenue, 6 months', type: 'money', aliases: ['revenue_6mo', 'revenue 6mo', 'revenue6mo', 'revenue'] },
    { key: 'gp6mo', label: 'GP, 6 months', type: 'money', aliases: ['gross_profit_6mo', 'gp_6mo', 'gp 6mo', 'gross profit 6mo', 'gp'] },
    { key: 'source', label: 'Source', type: 'string', aliases: ['source'] },
  ],
});

registerEntity({
  type: 'externalService',
  label: 'External service quotes',
  collection: 'externalServices',
  idField: 'id',
  idPrefix: 's',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id', 'quote id'] },
    { key: 'vendor', label: 'Vendor', type: 'string', required: true, aliases: ['vendor', 'supplier', 'firm', 'provider'] },
    { key: 'name', label: 'Service', type: 'string', required: true, aliases: ['name', 'service', 'description', 'item'] },
    { key: 'category', label: 'Category', type: 'enum', enum: SERVICE_CATEGORIES, required: true, aliases: ['category', 'type'] },
    { key: 'pricingModel', label: 'Pricing model', type: 'enum', enum: PRICING_MODELS, required: true, aliases: ['pricing model', 'pricing', 'model', 'billing'] },
    { key: 'low', label: 'Low price', type: 'money', aliases: ['low', 'low price', 'min'] },
    { key: 'base', label: 'Base price', type: 'money', required: true, aliases: ['base', 'price', 'base price', 'quote', 'estimate'] },
    { key: 'high', label: 'High price', type: 'money', aliases: ['high', 'high price', 'max'] },
    { key: 'quantityPerMonth', label: 'Units or hours per month', type: 'number', aliases: ['quantity', 'units', 'hours per month', 'quantity per month'] },
    { key: 'termMonths', label: 'Term (months)', type: 'integer', aliases: ['term', 'term months', 'months'] },
    { key: 'startMonth', label: 'Baseline start month', type: 'month', aliases: ['start month', 'start'] },
    { key: 'priceRef', label: 'Price from assumption', type: 'string', aliases: ['price ref', 'assumption'] },
    { key: 'source', label: 'Source', type: 'string', aliases: ['source', 'quote source'] },
    { key: 'notes', label: 'Notes', type: 'string', aliases: ['notes', 'note'] },
  ],
});

registerEntity({
  type: 'kpi',
  label: 'KPIs',
  collection: 'kpis',
  idField: 'id',
  idPrefix: 'k',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id'] },
    { key: 'name', label: 'Name', type: 'string', required: true, aliases: ['name', 'kpi'] },
    { key: 'definition', label: 'Definition', type: 'string', aliases: ['definition', 'description'] },
    { key: 'formula', label: 'Formula', type: 'string', aliases: ['formula'] },
    { key: 'unit', label: 'Unit', type: 'string', aliases: ['unit'] },
    { key: 'target', label: 'Target', type: 'number', aliases: ['target'] },
    { key: 'cadence', label: 'Cadence', type: 'string', aliases: ['cadence', 'frequency'] },
    { key: 'owner', label: 'Owner', type: 'string', aliases: ['owner'] },
    { key: 'direction', label: 'Direction', type: 'enum', enum: ['higher', 'lower'], aliases: ['direction', 'better'] },
  ],
});

registerEntity({
  type: 'vendor',
  label: 'Vendors (OEM, distributor, TSD)',
  collection: 'vendors',
  idField: 'id',
  idPrefix: 'v',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id'] },
    { key: 'name', label: 'Name', type: 'string', required: true, aliases: ['name', 'vendor', 'oem'] },
    { key: 'kind', label: 'Kind', type: 'enum', enum: ['OEM', 'distributor', 'TSD'], aliases: ['kind', 'type'] },
    { key: 'programs', label: 'Programs', type: 'string', aliases: ['programs', 'program'] },
    { key: 'partnerTier', label: 'Partner tier', type: 'string', aliases: ['partner tier', 'tier', 'level'] },
    { key: 'contacts', label: 'Contacts', type: 'string', aliases: ['contacts', 'contact'] },
  ],
});
