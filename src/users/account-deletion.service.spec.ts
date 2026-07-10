import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { AccountDeletionService } from './account-deletion.service';

const mockUsersService = { send: jest.fn() };
const mockFirebaseAuthService = { deleteUser: jest.fn() };

describe('AccountDeletionService.deleteAccount', () => {
  let service: AccountDeletionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccountDeletionService(
      mockUsersService as any,
      mockFirebaseAuthService as any,
    );
  });

  it('calls the 5 steps in order: findUserByEmail → hardDeleteUser → firebase deleteUser', async () => {
    const callOrder: string[] = [];

    mockUsersService.send.mockImplementation((pattern: string) => {
      callOrder.push(pattern);
      if (pattern === 'findUserByEmail') {
        return of({ id: 'user-1' });
      }
      if (pattern === 'hardDeleteUser') {
        return of(undefined);
      }
      throw new Error(`Unexpected pattern: ${pattern}`);
    });
    mockFirebaseAuthService.deleteUser.mockImplementation(async () => {
      callOrder.push('firebaseDeleteUser');
    });

    await service.deleteAccount('uid-123', 'rider@example.com');

    expect(callOrder).toEqual(['findUserByEmail', 'hardDeleteUser', 'firebaseDeleteUser']);
    expect(mockUsersService.send).toHaveBeenNthCalledWith(1, 'findUserByEmail', {
      email: 'rider@example.com',
    });
    expect(mockUsersService.send).toHaveBeenNthCalledWith(2, 'hardDeleteUser', {
      id: 'user-1',
    });
    expect(mockFirebaseAuthService.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('propagates the 404 from findUserByEmail and never calls hardDeleteUser or Firebase deleteUser', async () => {
    const notFound = new RpcException({ status: 404, message: 'not found' });
    mockUsersService.send.mockImplementation((pattern: string) => {
      if (pattern === 'findUserByEmail') {
        return throwError(() => notFound);
      }
      throw new Error(`Unexpected pattern: ${pattern}`);
    });

    await expect(
      service.deleteAccount('uid-123', 'missing@example.com'),
    ).rejects.toThrow(notFound);

    expect(mockUsersService.send).toHaveBeenCalledTimes(1);
    expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
  });

  it('when step 4 (hardDeleteUser) throws, step 5 (Firebase deleteUser) is never invoked', async () => {
    const hardDeleteError = new Error('hard delete failed');
    mockUsersService.send.mockImplementation((pattern: string) => {
      if (pattern === 'findUserByEmail') {
        return of({ id: 'user-1' });
      }
      if (pattern === 'hardDeleteUser') {
        return throwError(() => hardDeleteError);
      }
      throw new Error(`Unexpected pattern: ${pattern}`);
    });

    await expect(
      service.deleteAccount('uid-123', 'rider@example.com'),
    ).rejects.toThrow(hardDeleteError);

    expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
  });
});
