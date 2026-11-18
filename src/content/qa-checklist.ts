/**
 * Quality-assurance checklist.
 * 12 mandatory sections. Items with an `auto` key are evaluated automatically by
 * the QA worker (src/harness/workers/qa-reviewer.ts); the rest are analyst sign-off.
 */

export interface QaItem {
  key: string;
  label: string;
  /** Identifier of an automated check the QA worker can evaluate. */
  auto?: string;
}

export interface QaSection {
  key: string;
  title: string;
  items: QaItem[];
}

export const QA_CHECKLIST: QaSection[] = [
  {
    key: "source_citation",
    title: "Source and citation QA",
    items: [
      { key: "claims_have_sources", label: "Every material factual claim has a source", auto: "claims_have_sources" },
      { key: "sources_classified", label: "Sources are classified by reliability", auto: "sources_classified" },
      { key: "primary_used", label: "Primary sources are used wherever available" },
      { key: "secondary_not_overstated", label: "Secondary sources are not overstated as proof" },
      { key: "community_labelled", label: "Community/social sources are labelled as weak evidence" },
      { key: "urls_in_appendix", label: "All source URLs are included in the appendix", auto: "urls_in_appendix" },
      { key: "retrieval_dates", label: "Retrieval dates are included for unstable/current data" },
      { key: "not_all_weak", label: "Evidence is not exclusively weak/community sources", auto: "not_all_weak" },
      { key: "no_contradiction", label: "No cited source contradicts the report text" },
    ],
  },
  {
    key: "identity",
    title: "Identity QA",
    items: [
      { key: "ticker_verified", label: "Token ticker verified" },
      { key: "contract_from_official", label: "Contract address verified from official source" },
      { key: "chain_verified", label: "Chain verified" },
      { key: "listings_native", label: "Exchange listings verified from exchange-native pages/API" },
      { key: "confusion_addressed", label: "Similar-name/ticker confusion addressed", auto: "identity_resolved" },
      { key: "private_vs_public", label: "Private offer identity addressed separately from public token" },
      { key: "listing_not_offer", label: "Exchange listing does not automatically validate the private offer", auto: "listing_not_offer" },
      { key: "seller_authority", label: "Seller/counterparty authority addressed" },
    ],
  },
  {
    key: "tokenomics",
    title: "Tokenomics QA",
    items: [
      { key: "supply_crosschecked", label: "Supply figures cross-checked" },
      { key: "fdv_mcap_checked", label: "FDV and market cap calculations checked" },
      { key: "allocation_or_flag", label: "Allocation table included or missing data flagged", auto: "allocation_or_flag" },
      { key: "unlock_or_flag", label: "Unlock schedule included or missing data flagged", auto: "unlock_or_flag" },
      { key: "insider_reviewed", label: "Insider/team/private investor allocations reviewed" },
      { key: "mm_reviewed", label: "Market maker allocation reviewed or missing data flagged" },
      { key: "emissions_reviewed", label: "Future emissions/dilution analysed" },
      { key: "rights_stated", label: "Token rights/value capture accurately stated" },
    ],
  },
  {
    key: "market_liquidity",
    title: "Market/liquidity QA",
    items: [
      { key: "price_timestamp", label: "Current price included with timestamp" },
      { key: "volume_multi_source", label: "24h volume from multiple sources compared" },
      { key: "venue_breakdown", label: "Exchange/venue breakdown included" },
      { key: "depth_reviewed", label: "Order book/depth reviewed where available" },
      { key: "dex_reviewed", label: "DEX liquidity reviewed where relevant" },
      { key: "slippage_or_limit", label: "Slippage estimates included or limitation explained" },
      { key: "conclusion_fits", label: "Liquidity conclusion fits the data" },
      { key: "exit_risk", label: "Private/locked exit risk addressed" },
    ],
  },
  {
    key: "onchain",
    title: "On-chain QA",
    items: [
      { key: "verification_checked", label: "Contract verification status checked" },
      { key: "proxy_checked", label: "Proxy/upgradeability checked" },
      { key: "admin_checked", label: "Owner/admin roles checked" },
      { key: "powers_checked", label: "Mint/pause/freeze/blacklist powers checked" },
      { key: "audit_or_flag", label: "Audit reports reviewed or absence flagged" },
      { key: "concentration_checked", label: "Top holder concentration checked" },
    ],
  },
  {
    key: "stablecoin_rwa",
    title: "Stablecoin/RWA QA",
    items: [
      { key: "issuer_or_flag", label: "Stablecoin issuer identified or missing flagged" },
      { key: "redemption_or_flag", label: "Redemption terms reviewed or missing flagged" },
      { key: "reserve_or_flag", label: "Reserve composition/attestations reviewed or missing flagged" },
      { key: "rwa_instrument_or_flag", label: "RWA legal instrument identified or missing flagged" },
      { key: "title_or_flag", label: "Title/lien/SPV/collateral structure reviewed or missing flagged" },
      { key: "rights_or_flag", label: "Investor rights and default/insolvency waterfall reviewed or flagged" },
      { key: "not_assumed", label: "Stablecoin/RWA structure not assumed without documents", auto: "structure_not_assumed" },
    ],
  },
  {
    key: "entity_team",
    title: "Entity/team QA",
    items: [
      { key: "entities_identified", label: "Legal entities identified" },
      { key: "jurisdictions", label: "Jurisdictions included" },
      { key: "licenses_verified", label: "Regulatory licenses verified where claimed" },
      { key: "founders_reviewed", label: "Founders/executives and prior track record reviewed" },
      { key: "litigation_reviewed", label: "Litigation/regulatory issues reviewed where possible" },
      { key: "partnerships_labelled", label: "Partnership claims verified or labelled" },
    ],
  },
  {
    key: "red_flag",
    title: "Red-flag QA",
    items: [
      { key: "table_included", label: "Red-flag table included", auto: "redflag_table" },
      { key: "severity_assigned", label: "Severity levels assigned" },
      { key: "critical_mitigation", label: "Critical/high items have mitigation/document request", auto: "critical_has_mitigation" },
      { key: "missing_as_risk", label: "Missing evidence treated as risk where material" },
      { key: "fraud_addressed", label: "Fraud/impersonation case addressed" },
      { key: "rec_reflects_flags", label: "Recommendation reflects critical red flags", auto: "rec_reflects_flags" },
    ],
  },
  {
    key: "scoring",
    title: "Scoring QA",
    items: [
      { key: "scores_included", label: "Category scores included", auto: "scores_included" },
      { key: "weights_included", label: "Weights included" },
      { key: "overall_checked", label: "Overall score calculation checked", auto: "overall_checked" },
      { key: "gating_considered", label: "Gating issues considered" },
      { key: "rationale_included", label: "Score rationale included" },
      { key: "rec_aligns", label: "Recommendation aligns with scores and blockers" },
    ],
  },
  {
    key: "legal_language",
    title: "Legal language QA",
    items: [
      { key: "not_advice", label: "Report states it is not legal/tax/investment advice", auto: "disclaimer_present" },
      { key: "issue_spotting", label: "Legal conclusions are phrased as issue spotting" },
      { key: "counsel_recommended", label: "Counsel review recommended for legal/regulatory matters" },
      { key: "no_definitive", label: "No definitive legal conclusion without counsel source" },
      { key: "listing_not_approval", label: "No statement implies exchange listing equals regulatory approval" },
    ],
  },
  {
    key: "formatting",
    title: "Formatting QA",
    items: [
      { key: "cover_correct", label: "Cover page correct (client/project/date)" },
      { key: "brand_correct", label: "Brand name correct" },
      { key: "page_numbers", label: "Page numbers correct" },
      { key: "tables_readable", label: "Tables readable" },
      { key: "no_broken_layout", label: "No broken page layout" },
      { key: "appendix_included", label: "Appendix included", auto: "appendix_included" },
      { key: "file_name_correct", label: "File name correct" },
    ],
  },
  {
    key: "final_release",
    title: "Final release QA",
    items: [
      { key: "analyst_reviewed", label: "Analyst reviewed final PDF" },
      { key: "unresolved_intentional", label: "All unresolved items intentionally left unresolved" },
      { key: "no_placeholder", label: "No placeholder text remains", auto: "no_placeholder" },
      { key: "no_internal_notes", label: "No internal notes remain" },
      { key: "manifest_saved", label: "Evidence manifest saved", auto: "manifest_saved" },
      { key: "formats_saved", label: "Markdown/HTML/PDF versions saved" },
    ],
  },
];

export function totalAutoChecks(): number {
  return QA_CHECKLIST.reduce((n, s) => n + s.items.filter((i) => i.auto).length, 0);
}
