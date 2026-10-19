import type { Member } from '@shared/api/contract';
import { type MemberFormValues, memberFormSchema, toMemberFormValues } from './member-form-values';

const MEMBER: Member = {
  id: 'mem_1',
  firstName: 'Ana',
  lastName: 'Pereira',
  email: 'ana.pereira@example.com',
  phone: '+351 21 555 01 99',
  company: 'Pereira & Co',
  plan: 'team',
  status: 'suspended',
  joinedAt: '2026-01-05',
};

const VALUES: MemberFormValues = {
  firstName: 'Ana',
  lastName: 'Pereira',
  email: 'ana.pereira@example.com',
  phone: '+351 21 555 01 99',
  company: 'Pereira & Co',
  plan: 'team',
  status: 'suspended',
};

const issues = (values: Partial<MemberFormValues>) => {
  const result = memberFormSchema.safeParse({ ...VALUES, ...values });
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('toMemberFormValues', () => {
  it('starts a new member on the flex plan, active, with the text fields empty', () => {
    expect(toMemberFormValues()).toEqual({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      company: '',
      plan: 'flex',
      status: 'active',
    });
  });

  it('gives each new form values of its own', () => {
    const [a, b] = [toMemberFormValues(), toMemberFormValues()];

    a.firstName = 'Ana';

    expect(b.firstName).toBe('');
  });

  it('shows the saved member, without the id and the join date the API keeps for itself', () => {
    expect(toMemberFormValues(MEMBER)).toEqual(VALUES);
  });

  it('shows a member without a company as an empty field', () => {
    expect(toMemberFormValues({ ...MEMBER, company: null }).company).toBe('');
  });
});

describe('memberFormSchema', () => {
  it('turns the form values into the API input', () => {
    expect(memberFormSchema.parse(VALUES)).toEqual({
      firstName: 'Ana',
      lastName: 'Pereira',
      email: 'ana.pereira@example.com',
      phone: '+351 21 555 01 99',
      company: 'Pereira & Co',
      plan: 'team',
      status: 'suspended',
    });
  });

  it('sends no company as null, whether the field is empty or blank', () => {
    expect(memberFormSchema.parse({ ...VALUES, company: '' }).company).toBeNull();
    expect(memberFormSchema.parse({ ...VALUES, company: '   ' }).company).toBeNull();
  });

  it('trims the text, the email included', () => {
    expect(
      memberFormSchema.parse({
        ...VALUES,
        firstName: ' Ana ',
        email: ' ana.pereira@example.com ',
        company: ' Pereira & Co ',
      }),
    ).toMatchObject({
      firstName: 'Ana',
      email: 'ana.pereira@example.com',
      company: 'Pereira & Co',
    });
  });

  it('accepts the values it starts from', () => {
    expect(issues({})).toEqual({});
  });

  it('asks for a first and a last name', () => {
    expect(issues({ firstName: '  ', lastName: '' })).toEqual({
      firstName: 'Required',
      lastName: 'Required',
    });
  });

  it('asks for a valid email', () => {
    expect(issues({ email: '' })).toEqual({ email: 'Enter a valid email' });
    expect(issues({ email: 'ana@' })).toEqual({ email: 'Enter a valid email' });
  });

  it('asks for a valid phone number', () => {
    expect(issues({ phone: 'call me' })).toEqual({ phone: 'Enter a valid phone number' });
    expect(issues({ phone: '123' })).toEqual({ phone: 'Enter a valid phone number' });
    expect(issues({ phone: '(044) 123-45-67' })).toEqual({});
  });

  it('allows a company of up to 80 characters', () => {
    expect(issues({ company: 'c'.repeat(80) })).toEqual({});
    expect(Object.keys(issues({ company: 'c'.repeat(81) }))).toEqual(['company']);
  });
});
