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
  { key: 'gp_per_specialist', label: 'Specialty GP per specialist', unit: '$/yr', help: 'Annual specialty GP a fully ramped specialist produces.' },
  { key: 'gp_uplift', label: 'Share of specialty GP credited to specialists', unit: '%', help: 'Multiplies specialty GP; 100% credits all of it to the specialty team.' },
  { key: 'company_gp', label: 'Company GP this year', unit: '$/yr', help: 'Plan GP for the whole company; the context for every scenario.' },
  { key: 'specialty_gp', label: 'Specialty GP this year', unit: '$/yr', help: 'Plan GP from the specialty team.' },
  { key: 'gp_growth_after', label: 'Annual GP growth after this year', unit: '%', help: 'Grows company and specialty GP for each later model year.' },
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
  { key: 'office_lift', label: 'Specialist effectiveness lift from the office', unit: '%', help: 'Multiplies specialist GP uplift once the office has run past the delay.' },
  { key: 'office_lift_delay_months', label: 'Months before the office lift starts', unit: 'months', help: 'Office lift applies from this many months after launch.' },
  { key: 'campaign_lift', label: 'Campaign artifact lift per year', unit: '%', help: 'Compounds on specialist effectiveness for each full year the office has run.' },
  { key: 'pursuits_deals_per_year', label: 'Large deals the pursuits team touches per year', unit: 'deals', help: 'Volume for the large pursuits program.' },
  { key: 'pursuits_win_lift', label: 'Win rate lift on large deals with a focused team', unit: '%', help: 'Relative: focused win rate = base x (1 + lift).' },
  { key: 'pursuits_deal_growth', label: 'Growth on won large deals the team touches', unit: '%', help: 'Won deal GP grows by this share.' },
  { key: 'large_deal_win_rate', label: 'Win rate on large deals today', unit: '%', help: 'Base win rate before the pursuits team.' },
  { key: 'large_deal_gp', label: 'GP per large deal won', unit: '$', help: 'Average GP of a won large deal today.' },
  { key: 'pursuits_time_share', label: 'Share of office time spent on large pursuits', unit: '%', help: 'Allocates office cost to pursuits for its payback.' },
  { key: 'pursuits_cycle_months', label: 'Months until pursued deals start closing', unit: 'months', help: 'No pursuits GP before this many months after launch.' },
  { key: 'revenue_monthly', label: 'Monthly revenue for % of revenue pricing', unit: '$/mo', help: 'Used by services priced as a share of revenue.' },
];

export const DRIVER_KEYS = ['win_rate', 'attach_rate', 'gp_uplift', 'utilization'] as const;
