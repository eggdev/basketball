const dollars = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

const decimal = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

export const formatPrice = (cents: number): string => dollars.format(cents / 100);

export const formatFantasyPoints = (points: number): string => decimal.format(points);

export const formatSignedPrice = (cents: number): string => {
  if (cents === 0) return formatPrice(0);
  const sign = cents > 0 ? '+' : '−';
  if (Math.abs(cents) < 100) return `${sign}<$1`;
  return `${sign}${formatPrice(Math.abs(cents))}`;
};
