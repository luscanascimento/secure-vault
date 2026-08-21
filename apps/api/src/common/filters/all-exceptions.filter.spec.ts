import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface CapturedResponse {
  status: number;
  body: Record<string, unknown>;
}

function capture(exception: unknown): CapturedResponse {
  const captured: CapturedResponse = { status: 0, body: {} };
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/api/v1/auth/register' }),
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return captured;
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    // The filter logs by design; keep the test output readable.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => jest.restoreAllMocks());

  describe('error label', () => {
    it.each([
      [new BadRequestException('nope'), 400, 'BadRequest'],
      [new UnauthorizedException('nope'), 401, 'Unauthorized'],
      [new ForbiddenException('nope'), 403, 'Forbidden'],
      [new NotFoundException('nope'), 404, 'NotFound'],
      [new ConflictException('nope'), 409, 'Conflict'],
    ])(
      'names the concrete exception, not the base class (%#)',
      (exception: unknown, status: number, error: string) => {
        const result = capture(exception);

        expect(result.status).toBe(status);
        expect(result.body.error).toBe(error);
        // Regression: the filter used to read the STATIC `HttpException.name`,
        // labelling every 4xx as "Http".
        expect(result.body.error).not.toBe('Http');
      },
    );
  });

  describe('suggestions passthrough', () => {
    it('forwards password-strength suggestions to the client', () => {
      const result = capture(
        new BadRequestException({
          message: 'This password is too easy to guess.',
          suggestions: ['Add another word or two.', 'Avoid keyboard walks.'],
        }),
      );

      expect(result.status).toBe(400);
      expect(result.body.message).toBe('This password is too easy to guess.');
      expect(result.body.suggestions).toEqual([
        'Add another word or two.',
        'Avoid keyboard walks.',
      ]);
    });

    it('omits the key entirely when the thrower supplied none', () => {
      const result = capture(new BadRequestException('plain message'));
      expect(result.body).not.toHaveProperty('suggestions');
    });

    it('drops a non-string-array `suggestions` instead of echoing it', () => {
      const result = capture(
        new BadRequestException({
          message: 'bad',
          suggestions: { internal: 'detail' },
        }),
      );
      expect(result.body).not.toHaveProperty('suggestions');
    });

    it('drops an array containing non-strings', () => {
      const result = capture(
        new BadRequestException({ message: 'bad', suggestions: ['ok', 42] }),
      );
      expect(result.body).not.toHaveProperty('suggestions');
    });
  });

  describe('validation-pipe arrays', () => {
    it('joins class-validator messages into one string', () => {
      const result = capture(
        new BadRequestException({
          message: ['email must be an email', 'password is too short'],
          error: 'Bad Request',
          statusCode: 400,
        }),
      );

      expect(result.body.message).toBe(
        'email must be an email; password is too short',
      );
    });
  });

  describe('non-HTTP exceptions', () => {
    it('never leaks internals from an unexpected error', () => {
      const result = capture(
        new Error('connect ECONNREFUSED 10.0.0.5:5432 — prisma pool'),
      );

      expect(result.status).toBe(500);
      expect(result.body.error).toBe('InternalServerError');
      expect(result.body.message).toBe('An unexpected error occurred.');
      expect(JSON.stringify(result.body)).not.toContain('ECONNREFUSED');
      expect(result.body).not.toHaveProperty('stack');
    });

    it('handles a thrown non-Error value', () => {
      const result = capture('something odd');
      expect(result.status).toBe(500);
      expect(result.body.message).toBe('An unexpected error occurred.');
    });
  });

  it('always includes the request path and a timestamp', () => {
    const result = capture(new NotFoundException('missing'));

    expect(result.body.path).toBe('/api/v1/auth/register');
    expect(typeof result.body.timestamp).toBe('string');
    expect(new Date(result.body.timestamp as string).getTime()).not.toBeNaN();
  });
});
