import { z } from 'zod';
import { numberField } from './number-schema';

describe('numberField', () => {
  const schema = numberField('Enter a number', z.number().int({ error: 'Whole numbers only' }));

  it('passes a number that satisfies the rule', () => {
    expect(schema.parse(3)).toBe(3);
  });

  it('words an empty field with its own message', () => {
    const result = schema.safeParse(null);

    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['Enter a number']);
  });

  it('leaves a number that breaks the rule to the rule’s message', () => {
    const result = schema.safeParse(2.5);

    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['Whole numbers only']);
  });

  it('refuses what is not a number at all', () => {
    expect(schema.safeParse('3').success).toBe(false);
  });

  it('passes on what the rule makes of the number', () => {
    const cents = numberField(
      'Enter a rate',
      z.number().transform((euros) => euros * 100),
    );

    expect(cents.parse(1.5)).toBe(150);
  });
});
