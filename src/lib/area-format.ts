export type AreaUnit = 'ha' | 'm2' | 'km2';

export function formatAreaNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return parseFloat(value.toPrecision(4)).toString();
}

export function convertArea(areaM2: number, unit: AreaUnit): string {
  switch (unit) {
    case 'ha':
      return `${formatAreaNumber(areaM2 / 10000)} ha`;
    case 'm2':
      return `${formatAreaNumber(areaM2)} m²`;
    case 'km2':
      return `${formatAreaNumber(areaM2 / 1_000_000)} km²`;
  }
}
