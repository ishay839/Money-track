# Balance Connections

Local experimental readers, not official open-banking integrations. No live
account has been authenticated as part of implementation. Provider changes can
break a reader; successful authentication alone is not proof of data coverage.

## Supported Paths

- Excellence, Meitav Trade and IBI: **Spark accounts only**, not IBI Smart,
  ViewTrade, foreign brokerage platforms or managed portfolios.
- Meitav savings: pension plus the provident/study accounts exposed by its
  member portal. Conflicting periods are rejected, never resolved by taking
  the largest balance.
- Menora: product-group totals from its customer summary. These are deliberately
  labelled aggregates, not individual policy balances. Forecast monthly pensions
  and insurance coverage amounts are excluded.
- Other pension providers are not connected yet. The UI only offers implemented
  readers; it does not advertise unimplemented providers as connected.

## Authentication and Data

The scraper restores saved login data into a fresh isolated browser. Credentials,
first-party cookies and the Spark bearer token are stored per connection using
the same local AES-256-GCM encryption helper as bank credentials. Secrets are never
returned by the metadata API. Browser profiles and diagnostic dumps are not saved.
On an expired session, Spark tries its own website login once with saved
credentials. Pension portals have ID/phone prefilling; CAPTCHA and new OTP
challenges remain user actions. Successful sessions are saved for the next run.
Replacing credentials clears the old session. The UI can forget all saved login
data without deleting balance history. Deleting the connection deletes its secrets.
Provider authentication may grant broader account permissions, but our reader only
calls login and the allowlisted account/balance endpoints, never trades or transfers.

The existing application scheduler also refreshes saved balance connections when
their last attempt was at least 14 days ago. This requires global automatic sync
to be enabled and the local application to be running. Unattended attempts are
headless, bounded to 90 seconds and stop if fresh authentication is required.
Manual attempts open a browser and allow six minutes for verification. Both can
be cancelled. Only one balance connection runs at a time. Closing the provider
window stops a manual attempt. Provider session lifetime is not under app control.

Successful complete batches are appended atomically to SQLite. Failure or an
empty response preserves prior balances and reports an error. Missing accounts
in a successful nonempty batch leave the current snapshot but remain in history.
Manual product classifications persist across refreshes. Account identity is
scoped by connection; duplicate keys for the same provider and owner are rejected.
Joint holdings under different owner names cannot be deduplicated reliably.

Balances do not create transactions or alter expense/investment cash-flow reports.
Currencies are never added together. Spark's `a.o` field is its shekel-denominated
portfolio total, not a per-security foreign-currency amount. Observation timestamps
are not provider valuation dates; the latter are not supplied by these readers.

## Protocol References

- https://github.com/assafmo/OrdernetAPI (Spark endpoint reference)
- https://github.com/MotionPeak/israeli-pension-scrapers (portal/field reference;
  dependency NOT installed, heuristic balance readers and shared profiles rejected)
- https://www.ibi.co.il/en/solutions/trading/ (official Spark platform link)

## Verification

`node scripts/test-balances.cjs` uses synthetic data and an in-memory database.
It covers strict numeric parsing, zero/missing balances, conflicting periods,
duplicate product rows, product-group totals, forecast exclusion, workspace
isolation, multiple owners, atomic failure, history, classification overrides,
duplicate connections and cascading local deletion.

`node scripts/test-balance-auth.cjs` exercises the real encryption helper with an
in-memory key file and database. `node scripts/test-balance-sync.cjs` uses a fake
browser to test session restoration, cookie tenant isolation, one-shot login,
cancellation, cleanup and unattended authentication failure.

Live verification requires the account holder to sign in and compare each
reported balance and product count with the provider. Do not describe these
connections as live-verified until that check is complete.
