import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PasswordStrengthService, type StrengthVerdict } from './password-strength.service';

const URL = 'http://guardsvc:8080';

function buildService(url = URL): PasswordStrengthService {
  return new PasswordStrengthService({
    getOrThrow: () => ({ url, timeoutMs: 400 }),
  } as unknown as ConfigService);
}

/** A `fetch` stub that resolves to a 200 carrying `body`. */
function ok(body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

const VALID: StrengthVerdict = {
  score: 1,
  acceptable: false,
  warning: 'This is a top-10 common password.',
  suggestions: ['Add another word or two.'],
};

describe('PasswordStrengthService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function stubFetch(mock: jest.Mock): void {
    fetchMock = mock;
    global.fetch = mock as unknown as typeof fetch;
  }

  it('returns the verdict when guardsvc answers with a well-formed body', async () => {
    stubFetch(ok(VALID));
    await expect(buildService().score('hunter2', ['a@b.dev'])).resolves.toEqual(VALID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never calls guardsvc when the URL is unset', async () => {
    stubFetch(ok(VALID));
    await expect(buildService('').score('hunter2')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Regression: the body used to be cast straight to StrengthVerdict, so a 200
  // carrying anything else produced `acceptable === undefined` — falsy — and
  // AuthService.register turned that into a 400. A broken scorer must not be
  // able to block a signup.
  it.each([
    ['an unrelated JSON object', { error: 'upstream unavailable' }],
    ['a verdict missing `acceptable`', { score: 0, suggestions: [] }],
    ['`acceptable` as a string', { score: 0, acceptable: 'false', suggestions: [] }],
    ['`suggestions` holding non-strings', { score: 0, acceptable: true, suggestions: [7] }],
    ['null', null],
    ['a bare string', 'nope'],
  ])('fails open on a 200 carrying %s', async (_label, body) => {
    stubFetch(ok(body));
    await expect(buildService().score('hunter2')).resolves.toBeNull();
  });

  it('fails open on a 5xx and on a transport error', async () => {
    stubFetch(jest.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(buildService().score('hunter2')).resolves.toBeNull();

    stubFetch(jest.fn().mockRejectedValue(new Error('The operation was aborted')));
    await expect(buildService().score('hunter2')).resolves.toBeNull();
  });

  it('opens the breaker after three consecutive failures and stops calling', async () => {
    stubFetch(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const service = buildService();

    for (let i = 0; i < 3; i += 1) {
      await expect(service.score('hunter2')).resolves.toBeNull();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await expect(service.score('hunter2')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('resets the failure count after a good answer', async () => {
    const service = buildService();

    stubFetch(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await service.score('hunter2');
    await service.score('hunter2');

    stubFetch(ok(VALID));
    await expect(service.score('hunter2')).resolves.toEqual(VALID);

    stubFetch(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await service.score('hunter2');
    await service.score('hunter2');
    await expect(service.score('hunter2')).resolves.toBeNull();
    // Three failures again — the breaker only opens now, not earlier.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
