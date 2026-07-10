import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { AccountDeletionService } from './account-deletion.service';

const mockUsersService = { send: jest.fn() };
const mockVehiclesService = { send: jest.fn() };
const mockMaintenancesService = { send: jest.fn() };
const mockStorageCleanupService = { deleteFilesByUrls: jest.fn() };
const mockFirebaseAuthService = { deleteUser: jest.fn() };

describe('AccountDeletionService.deleteAccount', () => {
  let service: AccountDeletionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccountDeletionService(
      mockUsersService as any,
      mockVehiclesService as any,
      mockMaintenancesService as any,
      mockStorageCleanupService as any,
      mockFirebaseAuthService as any,
    );
  });

  function mockHappyPath(imageUrls: string[] = ['https://img/v1.jpg']) {
    mockUsersService.send.mockImplementation((pattern: string) => {
      if (pattern === 'findUserByEmail') return of({ id: 'user-1' });
      if (pattern === 'hardDeleteUser') return of(undefined);
      throw new Error(`Unexpected users-ms pattern: ${pattern}`);
    });
    mockVehiclesService.send.mockImplementation((pattern: string) => {
      if (pattern === 'hardDeleteAllByOwner') {
        return of({ deletedVehicleCount: 2, imageUrls });
      }
      throw new Error(`Unexpected vehicles-ms pattern: ${pattern}`);
    });
    mockMaintenancesService.send.mockImplementation((pattern: string) => {
      if (pattern === 'softDeleteMaintenancesByUserId') return of({ count: 3 });
      throw new Error(`Unexpected maintenances-ms pattern: ${pattern}`);
    });
    mockStorageCleanupService.deleteFilesByUrls.mockResolvedValue(undefined);
    mockFirebaseAuthService.deleteUser.mockResolvedValue(undefined);
  }

  it('calls the 6 steps in order: findUserByEmail → hardDeleteAllByOwner → deleteFilesByUrls → softDeleteMaintenancesByUserId → hardDeleteUser → firebaseDeleteUser', async () => {
    const callOrder: string[] = [];

    mockUsersService.send.mockImplementation((pattern: string) => {
      callOrder.push(pattern);
      if (pattern === 'findUserByEmail') return of({ id: 'user-1' });
      if (pattern === 'hardDeleteUser') return of(undefined);
      throw new Error(`Unexpected pattern: ${pattern}`);
    });
    mockVehiclesService.send.mockImplementation((pattern: string) => {
      callOrder.push(pattern);
      return of({ deletedVehicleCount: 1, imageUrls: ['https://img/v1.jpg'] });
    });
    mockStorageCleanupService.deleteFilesByUrls.mockImplementation(async () => {
      callOrder.push('deleteFilesByUrls');
    });
    mockMaintenancesService.send.mockImplementation((pattern: string) => {
      callOrder.push(pattern);
      return of({ count: 0 });
    });
    mockFirebaseAuthService.deleteUser.mockImplementation(async () => {
      callOrder.push('firebaseDeleteUser');
    });

    await service.deleteAccount('uid-123', 'rider@example.com');

    expect(callOrder).toEqual([
      'findUserByEmail',
      'hardDeleteAllByOwner',
      'deleteFilesByUrls',
      'softDeleteMaintenancesByUserId',
      'hardDeleteUser',
      'firebaseDeleteUser',
    ]);
    expect(mockVehiclesService.send).toHaveBeenCalledWith('hardDeleteAllByOwner', {
      ownerId: 'user-1',
    });
    expect(mockStorageCleanupService.deleteFilesByUrls).toHaveBeenCalledWith([
      'https://img/v1.jpg',
    ]);
    expect(mockMaintenancesService.send).toHaveBeenCalledWith('softDeleteMaintenancesByUserId', {
      userId: 'user-1',
    });
    expect(mockUsersService.send).toHaveBeenCalledWith('hardDeleteUser', { id: 'user-1' });
    expect(mockFirebaseAuthService.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('empty garage: hardDeleteAllByOwner returns imageUrls:[] and deleteFilesByUrls is still called with an empty array', async () => {
    mockHappyPath([]);

    await service.deleteAccount('uid-123', 'rider@example.com');

    expect(mockStorageCleanupService.deleteFilesByUrls).toHaveBeenCalledWith([]);
    expect(mockUsersService.send).toHaveBeenCalledWith('hardDeleteUser', { id: 'user-1' });
    expect(mockFirebaseAuthService.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('storage cleanup failure does NOT abort the flow — steps 4-6 still run', async () => {
    mockHappyPath();
    mockStorageCleanupService.deleteFilesByUrls.mockRejectedValue(new Error('storage down'));

    await service.deleteAccount('uid-123', 'rider@example.com');

    expect(mockMaintenancesService.send).toHaveBeenCalledWith('softDeleteMaintenancesByUserId', {
      userId: 'user-1',
    });
    expect(mockUsersService.send).toHaveBeenCalledWith('hardDeleteUser', { id: 'user-1' });
    expect(mockFirebaseAuthService.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('propagates the 404 from findUserByEmail and never calls any other step', async () => {
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
    expect(mockVehiclesService.send).not.toHaveBeenCalled();
    expect(mockMaintenancesService.send).not.toHaveBeenCalled();
    expect(mockStorageCleanupService.deleteFilesByUrls).not.toHaveBeenCalled();
    expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
  });

  it('when hardDeleteAllByOwner (vehicles-ms) fails, it propagates and aborts before storage/maintenances/hardDeleteUser/Firebase', async () => {
    mockUsersService.send.mockImplementation((pattern: string) => {
      if (pattern === 'findUserByEmail') return of({ id: 'user-1' });
      throw new Error(`Unexpected pattern: ${pattern}`);
    });
    mockVehiclesService.send.mockImplementation((pattern: string) => {
      if (pattern === 'hardDeleteAllByOwner') return throwError(() => new Error('vehicles-ms down'));
      throw new Error(`Unexpected pattern: ${pattern}`);
    });

    await expect(
      service.deleteAccount('uid-123', 'rider@example.com'),
    ).rejects.toThrow();

    expect(mockStorageCleanupService.deleteFilesByUrls).not.toHaveBeenCalled();
    expect(mockMaintenancesService.send).not.toHaveBeenCalled();
    expect(mockUsersService.send).not.toHaveBeenCalledWith('hardDeleteUser', expect.anything());
    expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
  });

  it('when softDeleteMaintenancesByUserId (maintenances-ms) fails, it propagates and aborts before hardDeleteUser/Firebase', async () => {
    mockHappyPath();
    mockMaintenancesService.send.mockImplementation((pattern: string) => {
      if (pattern === 'softDeleteMaintenancesByUserId') {
        return throwError(() => new Error('maintenances-ms down'));
      }
      throw new Error(`Unexpected pattern: ${pattern}`);
    });

    await expect(
      service.deleteAccount('uid-123', 'rider@example.com'),
    ).rejects.toThrow();

    expect(mockUsersService.send).not.toHaveBeenCalledWith('hardDeleteUser', expect.anything());
    expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
  });

  it('when step 5 (hardDeleteUser) throws, step 6 (Firebase deleteUser) is never invoked', async () => {
    mockHappyPath();
    mockUsersService.send.mockImplementation((pattern: string) => {
      if (pattern === 'findUserByEmail') return of({ id: 'user-1' });
      if (pattern === 'hardDeleteUser') return throwError(() => new Error('hard delete failed'));
      throw new Error(`Unexpected pattern: ${pattern}`);
    });

    await expect(
      service.deleteAccount('uid-123', 'rider@example.com'),
    ).rejects.toThrow('hard delete failed');

    expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
  });
});
