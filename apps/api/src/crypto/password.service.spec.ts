import type { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';

function build(passwordPepper: string): PasswordService {
  return new PasswordService({
    getOrThrow: () => ({ passwordPepper }),
  } as unknown as ConfigService);
}

const PEPPER = 'pepper-for-tests-at-least-32-characters';

describe('PasswordService', () => {
  const service = build(PEPPER);
  const password = 'Correct-Horse-Battery-9!';

  it('produces an argon2id hash (not argon2i/argon2d, not plaintext)', async () => {
    const hash = await service.hash(password);

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain(password);
    expect(hash).not.toContain(PEPPER);
  });

  it('encodes the OWASP parameters used by the service', async () => {
    const hash = await service.hash(password);
    expect(hash).toContain('$m=19456,t=2,p=1$');
  });

  it('verifies the password it hashed', async () => {
    const hash = await service.hash(password);
    await expect(service.verify(hash, password)).resolves.toBe(true);
  });

  it.each([
    ['a wrong password', 'Correct-Horse-Battery-9'],
    ['a case variation', 'correct-horse-battery-9!'],
    ['an empty password', ''],
    ['the password with trailing whitespace', 'Correct-Horse-Battery-9! '],
  ])('rejects %s', async (_label: string, wrong: string) => {
    const hash = await service.hash(password);
    await expect(service.verify(hash, wrong)).resolves.toBe(false);
  });

  it('salts automatically — the same password hashes differently twice', async () => {
    const [a, b] = await Promise.all([
      service.hash(password),
      service.hash(password),
    ]);

    expect(a).not.toBe(b);
    await expect(service.verify(a, password)).resolves.toBe(true);
    await expect(service.verify(b, password)).resolves.toBe(true);
  });

  it('makes the pepper load-bearing: a hash does not verify under another pepper', async () => {
    const hash = await service.hash(password);
    const otherPepper = build('a-completely-different-application-pepper');

    await expect(otherPepper.verify(hash, password)).resolves.toBe(false);
  });

  it('returns false (never throws) for a malformed stored hash', async () => {
    await expect(service.verify('not-a-hash', password)).resolves.toBe(false);
    await expect(service.verify('', password)).resolves.toBe(false);
  });
});
