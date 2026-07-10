const mockDeleteUser = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockGetAuth = jest.fn().mockReturnValue({
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
});
const mockGetApps = jest.fn().mockReturnValue([{}]);

jest.mock('firebase-admin/auth', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
}));

jest.mock('firebase-admin/app', () => ({
  getApps: () => mockGetApps(),
  cert: jest.fn(),
  initializeApp: jest.fn(),
}));

import { FirebaseAuthService } from './firebase-auth.service';

describe('FirebaseAuthService.deleteUser', () => {
  let service: FirebaseAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetApps.mockReturnValue([{}]);
    service = new FirebaseAuthService();
  });

  it('deletes the Firebase Auth user via Admin SDK', async () => {
    mockDeleteUser.mockResolvedValue(undefined);

    await service.deleteUser('uid-123');

    expect(mockDeleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('rethrows the original error when the Admin SDK call fails', async () => {
    const sdkError = new Error('auth/user-not-found');
    mockDeleteUser.mockRejectedValue(sdkError);

    await expect(service.deleteUser('uid-missing')).rejects.toThrow(sdkError);
  });
});
