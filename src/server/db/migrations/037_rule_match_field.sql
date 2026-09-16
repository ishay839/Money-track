-- Rules can target the transfer counterparty, not just the description.
--
-- A bank transfer's description names the channel ("העברה בBIT", "PAYBOX"),
-- while the person who sent or received the money sits in the memo. Matching
-- on the description alone means every BIT transfer looks identical, so a rule
-- can now say "whenever the counterparty is X" instead.
--
-- 'description' keeps the existing behaviour and stays the default, so every
-- rule already written continues to match exactly as before.

ALTER TABLE category_rules
  ADD COLUMN match_field TEXT NOT NULL DEFAULT 'description'
    CHECK(match_field IN ('description', 'counterparty'));
