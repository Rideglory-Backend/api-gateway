/**
 * Unit tests for UsersController.acceptMedicalConsent().
 *
 * `users.controller.ts` imports `auth/decorators/public.decorator` and
 * `config` via non-relative paths that tsconfig `paths` resolves to
 * `./src/*`. ts-jest does not consult tsconfig paths, so we mock these as
 * virtual modules (preexisting limitation, unrelated to this change).
 */
jest.mock(
  'auth/decorators/public.decorator',
  () => ({
    Public: () => () => undefined,
  }),
  { virtual: true },
);

jest.mock(
  'config',
  () => ({
    USERS_SERVICE: 'USERS_SERVICE',
  }),
  { virtual: true },
);

import { UnauthorizedException } from '@nestjs/common';
import { UsersController } from './users.controller';

describe('UsersController — acceptMedicalConsent()', () => {
  const mockUsersService = { send: jest.fn() };
  let controller: UsersController;

  beforeEach(() => {
    mockUsersService.send.mockReset();
    controller = new UsersController(mockUsersService as any);
  });

  it('forwards the authenticated email and the body consentVersion to the users microservice', () => {
    const request = { user: { email: 'jane@example.com' } } as any;

    controller.acceptMedicalConsent(request, { consentVersion: 'v1' });

    expect(mockUsersService.send).toHaveBeenCalledWith(
      'acceptMedicalConsent',
      { email: 'jane@example.com', consentVersion: 'v1' },
    );
  });

  it('throws UnauthorizedException when the request has no authenticated email', () => {
    const request = { user: undefined } as any;

    expect(() =>
      controller.acceptMedicalConsent(request, { consentVersion: 'v1' }),
    ).toThrow(UnauthorizedException);
    expect(mockUsersService.send).not.toHaveBeenCalled();
  });
});
