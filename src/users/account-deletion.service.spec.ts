import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { AccountDeletionService } from './account-deletion.service';

const mockUsersService = { send: jest.fn() };
const mockVehiclesService = { send: jest.fn() };
const mockMaintenancesService = { send: jest.fn() };
const mockEventsService = { send: jest.fn() };
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
      mockEventsService as any,
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
    mockEventsService.send.mockImplementation((pattern: string) => {
      if (pattern === 'findEventsByOwnerId') return of([]);
      if (pattern === 'anonymizeRegistrationsByUserId') return of({ count: 4 });
      throw new Error(`Unexpected events-ms pattern: ${pattern}`);
    });
    mockStorageCleanupService.deleteFilesByUrls.mockResolvedValue(undefined);
    mockFirebaseAuthService.deleteUser.mockResolvedValue(undefined);
  }

  it('calls the 8 steps in order: findUserByEmail → findEventsByOwnerId → hardDeleteAllByOwner → deleteFilesByUrls → softDeleteMaintenancesByUserId → anonymizeRegistrationsByUserId → hardDeleteUser → firebaseDeleteUser', async () => {
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
    mockEventsService.send.mockImplementation((pattern: string) => {
      callOrder.push(pattern);
      if (pattern === 'findEventsByOwnerId') return of([]);
      return of({ count: 2 });
    });
    mockFirebaseAuthService.deleteUser.mockImplementation(async () => {
      callOrder.push('firebaseDeleteUser');
    });

    await service.deleteAccount('uid-123', 'rider@example.com');

    expect(callOrder).toEqual([
      'findUserByEmail',
      'findEventsByOwnerId',
      'hardDeleteAllByOwner',
      'deleteFilesByUrls',
      'softDeleteMaintenancesByUserId',
      'anonymizeRegistrationsByUserId',
      'hardDeleteUser',
      'firebaseDeleteUser',
    ]);
    expect(mockEventsService.send).toHaveBeenCalledWith('findEventsByOwnerId', {
      ownerId: 'user-1',
    });
    expect(mockVehiclesService.send).toHaveBeenCalledWith('hardDeleteAllByOwner', {
      ownerId: 'user-1',
    });
    expect(mockStorageCleanupService.deleteFilesByUrls).toHaveBeenCalledWith([
      'https://img/v1.jpg',
    ]);
    expect(mockMaintenancesService.send).toHaveBeenCalledWith('softDeleteMaintenancesByUserId', {
      userId: 'user-1',
    });
    expect(mockEventsService.send).toHaveBeenCalledWith('anonymizeRegistrationsByUserId', {
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

  it('storage cleanup failure does NOT abort the flow — later steps still run', async () => {
    mockHappyPath();
    mockStorageCleanupService.deleteFilesByUrls.mockRejectedValue(new Error('storage down'));

    await service.deleteAccount('uid-123', 'rider@example.com');

    expect(mockMaintenancesService.send).toHaveBeenCalledWith('softDeleteMaintenancesByUserId', {
      userId: 'user-1',
    });
    expect(mockEventsService.send).toHaveBeenCalledWith('anonymizeRegistrationsByUserId', {
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
    expect(mockEventsService.send).not.toHaveBeenCalled();
    expect(mockVehiclesService.send).not.toHaveBeenCalled();
    expect(mockMaintenancesService.send).not.toHaveBeenCalled();
    expect(mockStorageCleanupService.deleteFilesByUrls).not.toHaveBeenCalled();
    expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
  });

  it('when hardDeleteAllByOwner (vehicles-ms) fails, it propagates and aborts before storage/maintenances/events/hardDeleteUser/Firebase', async () => {
    mockUsersService.send.mockImplementation((pattern: string) => {
      if (pattern === 'findUserByEmail') return of({ id: 'user-1' });
      throw new Error(`Unexpected pattern: ${pattern}`);
    });
    mockEventsService.send.mockImplementation((pattern: string) => {
      if (pattern === 'findEventsByOwnerId') return of([]);
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
    expect(mockEventsService.send).not.toHaveBeenCalledWith(
      'anonymizeRegistrationsByUserId',
      expect.anything(),
    );
    expect(mockUsersService.send).not.toHaveBeenCalledWith('hardDeleteUser', expect.anything());
    expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
  });

  it('when softDeleteMaintenancesByUserId (maintenances-ms) fails, it propagates and aborts before anonymize/hardDeleteUser/Firebase', async () => {
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

    expect(mockEventsService.send).not.toHaveBeenCalledWith(
      'anonymizeRegistrationsByUserId',
      expect.anything(),
    );
    expect(mockUsersService.send).not.toHaveBeenCalledWith('hardDeleteUser', expect.anything());
    expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
  });

  it('when anonymizeRegistrationsByUserId (events-ms) fails, it propagates and aborts before hardDeleteUser/Firebase', async () => {
    mockHappyPath();
    mockEventsService.send.mockImplementation((pattern: string) => {
      if (pattern === 'findEventsByOwnerId') return of([]);
      if (pattern === 'anonymizeRegistrationsByUserId') {
        return throwError(() => new Error('events-ms down'));
      }
      throw new Error(`Unexpected pattern: ${pattern}`);
    });

    await expect(
      service.deleteAccount('uid-123', 'rider@example.com'),
    ).rejects.toThrow();

    expect(mockUsersService.send).not.toHaveBeenCalledWith('hardDeleteUser', expect.anything());
    expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
  });

  it('when step 7 (hardDeleteUser) throws, step 8 (Firebase deleteUser) is never invoked', async () => {
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

  describe('ACTIVE_EVENTS_AS_ORGANIZER precondition', () => {
    it('throws 409 ACTIVE_EVENTS_AS_ORGANIZER with non-empty activeEvents when the user has a DRAFT/SCHEDULED/IN_PROGRESS event as owner, and no deletion step runs', async () => {
      mockUsersService.send.mockImplementation((pattern: string) => {
        if (pattern === 'findUserByEmail') return of({ id: 'user-1' });
        throw new Error(`Unexpected pattern: ${pattern}`);
      });
      mockEventsService.send.mockImplementation((pattern: string) => {
        if (pattern === 'findEventsByOwnerId') {
          return of([
            { id: 'evt-1', name: 'Rodada de verano', state: 'SCHEDULED' },
            { id: 'evt-2', name: 'Evento pasado', state: 'FINISHED' },
          ]);
        }
        throw new Error(`Unexpected pattern: ${pattern}`);
      });

      await expect(
        service.deleteAccount('uid-123', 'organizer@example.com'),
      ).rejects.toMatchObject({
        error: {
          status: 409,
          error: 'ACTIVE_EVENTS_AS_ORGANIZER',
          activeEvents: [{ id: 'evt-1', name: 'Rodada de verano', state: 'SCHEDULED' }],
        },
      });

      expect(mockVehiclesService.send).not.toHaveBeenCalled();
      expect(mockStorageCleanupService.deleteFilesByUrls).not.toHaveBeenCalled();
      expect(mockMaintenancesService.send).not.toHaveBeenCalled();
      expect(mockEventsService.send).not.toHaveBeenCalledWith(
        'anonymizeRegistrationsByUserId',
        expect.anything(),
      );
      expect(mockUsersService.send).not.toHaveBeenCalledWith('hardDeleteUser', expect.anything());
      expect(mockFirebaseAuthService.deleteUser).not.toHaveBeenCalled();
    });

    it('does not block when the user only has CANCELLED/FINISHED events as owner', async () => {
      mockHappyPath();
      mockEventsService.send.mockImplementation((pattern: string) => {
        if (pattern === 'findEventsByOwnerId') {
          return of([
            { id: 'evt-1', name: 'Evento cancelado', state: 'CANCELLED' },
            { id: 'evt-2', name: 'Evento finalizado', state: 'FINISHED' },
          ]);
        }
        if (pattern === 'anonymizeRegistrationsByUserId') return of({ count: 1 });
        throw new Error(`Unexpected pattern: ${pattern}`);
      });

      await service.deleteAccount('uid-123', 'organizer@example.com');

      expect(mockUsersService.send).toHaveBeenCalledWith('hardDeleteUser', { id: 'user-1' });
      expect(mockFirebaseAuthService.deleteUser).toHaveBeenCalledWith('uid-123');
    });

    it('does not block a rider with no owned events (findEventsByOwnerId returns [])', async () => {
      mockHappyPath();

      await service.deleteAccount('uid-123', 'rider@example.com');

      expect(mockUsersService.send).toHaveBeenCalledWith('hardDeleteUser', { id: 'user-1' });
      expect(mockFirebaseAuthService.deleteUser).toHaveBeenCalledWith('uid-123');
    });
  });
});
