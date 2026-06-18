/**
 * Smoke test for instrument.ts gating logic.
 *
 * Verifies that Sentry.init is NOT called when NODE_ENV !== 'production'.
 *
 * This test exercises initSentry() directly to avoid side-effect import issues.
 */
import * as Sentry from '@sentry/node';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  logger: {
    warn: jest.fn(),
  },
}));

jest.mock('@rideglory/common-lib', () => ({
  ...jest.requireActual('@rideglory/common-lib'),
  initSentry: jest.fn(),
}));

describe('instrument.ts — Sentry gating', () => {
  const sentryInit = Sentry.init as jest.Mock;

  beforeEach(() => {
    sentryInit.mockClear();
  });

  it('does not call Sentry.init when NODE_ENV is not production', () => {
    const savedEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'development';

    const { initSentry } = jest.requireActual<typeof import('@rideglory/common-lib')>('@rideglory/common-lib');
    initSentry('api-gateway', 'https://fake@sentry.io/123');

    expect(sentryInit).not.toHaveBeenCalled();

    process.env.NODE_ENV = savedEnv;
  });

  it('does not call Sentry.init when dsn is undefined', () => {
    const savedEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const { initSentry } = jest.requireActual<typeof import('@rideglory/common-lib')>('@rideglory/common-lib');
    initSentry('api-gateway', undefined);

    expect(sentryInit).not.toHaveBeenCalled();

    process.env.NODE_ENV = savedEnv;
  });

  it('calls Sentry.init when NODE_ENV is production and dsn is provided', () => {
    const savedEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const { initSentry } = jest.requireActual<typeof import('@rideglory/common-lib')>('@rideglory/common-lib');
    initSentry('api-gateway', 'https://fake@sentry.io/123');

    expect(sentryInit).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://fake@sentry.io/123' }),
    );

    process.env.NODE_ENV = savedEnv;
  });

});
