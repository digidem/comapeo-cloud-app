import { describe, expect, it } from 'vitest';

import { convertArea, formatAreaNumber } from '@/lib/area-format';

describe('formatAreaNumber', () => {
  it('with integer value uses toLocaleString', () => {
    const result = formatAreaNumber(50000);
    // toLocaleString in en locale produces "50,000"
    expect(result).toContain('50');
    expect(result).toContain('000');
  });

  it('with decimal value uses toPrecision(4)', () => {
    const result = formatAreaNumber(0.05);
    expect(result).toBe('0.05');
  });
});

describe('convertArea', () => {
  it('converts to hectares', () => {
    expect(convertArea(50000, 'ha')).toBe('5 ha');
  });

  it('converts to square meters', () => {
    const result = convertArea(50000, 'm2');
    // toLocaleString output varies by locale (50,000 or 50.000)
    expect(result).toMatch(/50[.,]000 m²/);
  });

  it('converts to square kilometers', () => {
    expect(convertArea(50000, 'km2')).toBe('0.05 km²');
  });

  it('handles 0 value', () => {
    expect(convertArea(0, 'ha')).toBe('0 ha');
  });

  it('handles large value', () => {
    expect(convertArea(1000000, 'km2')).toBe('1 km²');
  });
});
