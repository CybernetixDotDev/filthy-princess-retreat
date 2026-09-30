# PayFast Sandbox

Pass 2A/2B use PayFast's hosted custom integration at `https://sandbox.payfast.co.za/eng/process` when `PAYFAST_MODE=sandbox`. Production mode uses the live PayFast endpoint and separate production credentials.

Required server environment variables:

- `PAYFAST_MODE=sandbox` enables this integration. No live mode is supported in Pass 2A.
- `PAYFAST_SANDBOX_MERCHANT_ID` is the Sandbox merchant ID.
- `PAYFAST_SANDBOX_MERCHANT_KEY` is the Sandbox merchant key sent only to the hosted PayFast form.
- `PAYFAST_SANDBOX_PASSPHRASE` is the server-only signature passphrase and must never be exposed to browser JavaScript or logs.
- `PAYFAST_PRODUCTION_MERCHANT_ID`, `PAYFAST_PRODUCTION_MERCHANT_KEY`, and `PAYFAST_PRODUCTION_PASSPHRASE` are required only when `PAYFAST_MODE=production`.
- `PAYFAST_RETURN_BASE_URL` is the HTTPS application origin used for return, cancel, and ITN URLs. Production is `https://filthyprincesss.com`.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and is required by the ITN route to call the settlement RPC. It must never be exposed to browser code or logs.

PayFast hosted checkout amounts are ZAR. The initiation RPC therefore rejects Store orders whose authoritative currency is not `ZAR`; no exchange rate is applied.

Initiation creates a payment attempt for the existing Store order and posts authoritative amount, order reference, and attempt reference to PayFast. The public `https://filthyprincesss.com/api/payfast/itn` endpoint verifies the ordered signed body, merchant, PayFast source, server confirmation, amount, and attempt before calling the service-role settlement RPC. It records failed/cancelled and reconciliation states, settles inventory once, and does not attach membership.

Admins can inspect attempt status, provider transaction ID, verification time, and reconciliation notes on the existing Admin Store order page. No customer-facing payment mutation is exposed.