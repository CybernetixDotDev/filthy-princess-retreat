export async function quoteEthForUsd(usd: number) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error("Alchemy pricing is not configured");
  const response = await fetch(`https://api.g.alchemy.com/prices/v1/${key}/tokens/by-symbol?symbols=ETH`, { cache: "no-store" });
  if (!response.ok) throw new Error("Alchemy pricing unavailable");
  const body = await response.json() as { data?: Array<{ prices?: Array<{ value?: string }> }> };
  const price = Number(body.data?.[0]?.prices?.[0]?.value);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(usd) || usd < 0) throw new Error("Invalid ETH price");
  return { ethAmount: (usd / price).toFixed(18), ethPriceUsd: price.toFixed(18) };
}
