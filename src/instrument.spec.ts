/**
 * Smoke test for instrument.ts gating logic.
 *
 * Verifies that Sentry.init is NOT called when:
 *   - NODE_ENV !== 'production'
 *   - SENTRY_DEV_VERIFY is not 'true'
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

  it('does not call Sentry.init when NODE_ENV is not production and SENTRY_DEV_VERIFY is absent', () => {
    const savedEnv = process.env.NODE_ENV;
    const savedVerify = process.env.SENTRY_DEV_VERIFY;

    process.env.NODE_ENV = 'development';
    delete process.env.SENTRY_DEV_VERIFY;

    // Import initSentry directly from the real module
    // (initSentry is already tested in common-lib; here we verify the gate)
    const { initSentry } = jest.requireActual<typeof import('@rideglory/common-lib')>('@rideglory/common-lib');
    initSentry('api-gateway', 'https://fake@sentry.io/123');

    expect(sentryInit).not.toHaveBeenCalled();

    process.env.NODE_ENV = savedEnv;
    if (savedVerify !== undefined) {
      process.env.SENTRY_DEV_VERIFY = savedVerify;
    }
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

  it('calls Sentry.init when SENTRY_DEV_VERIFY is true (dev override)', () => {
    const savedEnv = process.env.NODE_ENV;
    const savedVerify = process.env.SENTRY_DEV_VERIFY;

    process.env.NODE_ENV = 'development';
    process.env.SENTRY_DEV_VERIFY = 'true';

    const { initSentry } = jest.requireActual<typeof import('@rideglory/common-lib')>('@rideglory/common-lib');
    initSentry('api-gateway', 'https://fake@sentry.io/123');

    expect(sentryInit).toHaveBeenCalled();

    process.env.NODE_ENV = savedEnv;
    if (savedVerify !== undefined) {
      process.env.SENTRY_DEV_VERIFY = savedVerify;
    } else {
      delete process.env.SENTRY_DEV_VERIFY;
    }
  });
});
