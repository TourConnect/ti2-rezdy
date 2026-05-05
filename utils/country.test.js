const {
  getIso31661Alpha2Countries,
  toIso31661Alpha2Code,
} = require('./country');

describe('utils/country', () => {
  it('returns ISO 3166-1 alpha-2 countries list', () => {
    const countries = getIso31661Alpha2Countries();
    expect(Array.isArray(countries)).toBe(true);
    expect(countries).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Australia', value: 'AU' }),
    ]));
  });

  it('maps country names to ISO 3166-1 alpha-2 code', () => {
    expect(toIso31661Alpha2Code('Australia')).toBe('AU');
    expect(toIso31661Alpha2Code('australia')).toBe('AU');
  });
});
