ALTER TABLE "Scorecard" ADD COLUMN "manualGating" TEXT NOT NULL DEFAULT '{}';

-- Earlier versions stored combined blocker labels without their origin.
-- Retain recognized blockers until a reviewer deliberately clears a choice.
UPDATE "Scorecard"
SET "manualGating" = (
  WITH blockers(flag, label) AS (
  VALUES
    ('legalInstrumentUnknown', 'Actual legal instrument unknown'),
    ('tokenomicsUnlocksMissing', 'Tokenomics / unlocks missing'),
    ('stablecoinReserveUnclear', 'Stablecoin reserve/redemption unclear and central to thesis'),
    ('rwaOwnershipUnclear', 'RWA ownership/collateral unclear and central to thesis'),
    ('marketCannotSupportExit', 'Market cannot support intended exit size'),
    ('sellerAuthorityUnproven', 'Seller authority unproven for private sale'),
    ('contractConflictsOfficial', 'Contract address conflicts with official source'),
    ('criticalAdminUndisclosed', 'Critical admin controls undisclosed'),
    ('majorPartnershipUnverified', 'Major partnership central to thesis but unverified'),
    ('privateOfferOverpriced', 'Private offer materially overpriced vs market/liquidity'),
    ('officialEntityDeniesOffer', 'Official entity denies the offer'),
    ('paymentUnauthenticated', 'Payment instructions unauthenticated'),
    ('impostorDomainOrWallet', 'Impostor domain/wallet confirmed'),
    ('forgedDocuments', 'Forged documents detected'),
    ('guaranteedReturnsUnverified', 'Guaranteed returns paired with unverified offer')
  )
  SELECT json_group_object(blockers.flag, json('true'))
  FROM blockers
  WHERE EXISTS (
    SELECT 1
    FROM json_each(
      CASE WHEN json_valid("Scorecard"."gatingApplied") THEN
        CASE WHEN json_type("Scorecard"."gatingApplied") = 'array' THEN "Scorecard"."gatingApplied" ELSE '[]' END
      ELSE '[]' END
    ) AS applied
    WHERE applied.type = 'text' AND applied.value = blockers.label
  )
);
