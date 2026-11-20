// Semantic keys the engine reads. Each key binds to an assumption ID in the
// register (Settings > Bindings), so an imported register can drive the
// engine without code changes. No business numbers live in code.

export interface BindingDef {
  key: string;
  label: string;
  unit: string;
  help: string;
}

export const BINDINGS: BindingDef[] = [
  { key: 'sellers_baseline', label: 'Core sellers today', unit: 'people', help: 'Anchors the seller count used in coverage ratios.' },
  { key: 'wage_share', label: 'Wage share of loaded cost', unit: 'ratio', help: 'Loaded cost = cash comp / wage share.' },
  { key: 'burden_pct', label: 'Default burden', unit: '%', help: 'Applied when a person has no burden of their own.' },
  { key: 'coverage_reference', label: 'Reference coverage (sellers per specialist)', unit: 'ratio', help: 'Alexander Group average, drawn as a reference band.' },
  { key: 'coverage_strain', label: 'Field strain line (sellers per specialist)', unit: 'ratio', help: 'Above this the field reports strain.' },
  { key: 'hire_lag_months', label: 'Hiring lag', unit: 'months', help: 'Months from req release to start when a hire has no lag of its own.' },
  { key: 'ramp_months', label: 'Specialist ramp', unit: 'months', help: 'Months for a new specialist to reach full productivity.' },
  { key: 'gp_per_specialist', label: 'Specialist-touched GP per specialist', unit: '$/yr', help: 'Annual GP on deals a fully ramped specialist touches.' },
  { key: 'gp_uplift', label: 'GP uplift on specialist-touched deals', unit: '%', help: 'Share of touched GP attributable to the specialist.' },
  { key: 'win_rate', label: 'Win rate', unit: '%', help: 'Driver. Scales touched GP relative to today.' },
  { key: 'attach_rate', label: 'Services attach rate', unit: '%', help: 'Driver. Scales touched GP relative to today.' },
  { key: 'utilization', label: 'Specialist utilization', unit: '%', help: 'Driver. Scales touched GP relative to today.' },
  { key: 'director_comp', label: 'Director cash comp', unit: '$/yr', help: 'Used by build vs buy and director hires.' },
  { key: 'hours_per_fte_month', label: 'Productive hours per FTE month', unit: 'hours', help: 'Converts freed hours to FTE.' },
  { key: 'tier1_requests', label: 'Tier 1 requests per month', unit: 'requests', help: 'Self-service tier volume.' },
  { key: 'tier2_requests', label: 'Tier 2 requests per month', unit: 'requests', help: 'Specialist-assisted tier volume.' },
  { key: 'tier3_requests', label: 'Tier 3 requests per month', unit: 'requests', help: 'Pursuit tier volume.' },
  { key: 'tier1_hours', label: 'Hours per Tier 1 request', unit: 'hours', help: 'Effort per self-service request.' },
  { key: 'tier2_hours', label: 'Hours per Tier 2 request', unit: 'hours', help: 'Effort per Tier 2 request.' },
  { key: 'tier3_hours', label: 'Hours per Tier 3 request', unit: 'hours', help: 'Effort per Tier 3 request.' },
  { key: 'specialist_comp', label: 'Specialist cash comp', unit: '$/yr', help: 'Used by specialist hires in the seed scenarios.' },
  { key: 'avant_desk_comp', label: 'Avant desk seller cash comp', unit: '$/yr', help: 'Used by the Avant pod or desk hire.' },
  { key: 'revenue_monthly', label: 'Monthly revenue for % of revenue pricing', unit: '$/mo', help: 'Used by services priced as a share of revenue.' },
];

export const DRIVER_KEYS = ['win_rate', 'attach_rate', 'gp_uplift', 'utilization'] as const;
