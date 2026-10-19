import { type SelectOption, withCurrentOption } from './select-option';

describe('withCurrentOption', () => {
  const options: SelectOption[] = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  it('leaves the options alone when the value in force is one of them', () => {
    expect(withCurrentOption(options, 'b', true, 'Unknown location')).toBe(options);
  });

  it('leaves the options alone when no filter is in force', () => {
    expect(withCurrentOption(options, undefined, true, 'Unknown location')).toBe(options);
    expect(withCurrentOption(options, '', true, 'Unknown location')).toBe(options);
  });

  it('puts a value the options do not list first, under the label given', () => {
    expect(withCurrentOption(options, 'gone', true, 'Unknown location')).toEqual([
      { value: 'gone', label: 'Unknown location' },
      ...options,
    ]);
  });

  it('waits for the options before judging that a value is missing', () => {
    expect(withCurrentOption([], 'a', false, 'Unknown location')).toEqual([]);
  });
});
