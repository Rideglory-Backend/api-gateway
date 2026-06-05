import { ForbiddenException, NotFoundException } from '@nestjs/common';

// ── Mock rxjs firstValueFrom ─────────────────────────────────────────────────

const mockFirstValueFrom = jest.fn().mockResolvedValue(undefined);

jest.mock('rxjs', () => {
  const actual = jest.requireActual<typeof import('rxjs')>('rxjs');
  return {
    ...actual,
    firstValueFrom: (...args: unknown[]) => mockFirstValueFrom(...args),
  };
});

// ── Import after mocking ─────────────────────────────────────────────────────

import { NotificationsService } from './notifications.service';

// ── ClientProxy factory ──────────────────────────────────────────────────────

function makeNotificationsClient() {
  return {
    send: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnValue('__observable__'),
    }),
  };
}

// ── Build real NotificationsService instance with mocked client ───────────────

function buildService() {
  const client = makeNotificationsClient();
  const service = Object.create(
    NotificationsService.prototype,
  ) as NotificationsService;
  (service as unknown as Record<string, unknown>)['notificationsClient'] =
    client;
  return { service, client };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFirstValueFrom.mockReset();
  mockFirstValueFrom.mockResolvedValue(undefined);
});

/**
 * Tests for NotificationsService — business logic isolated from external deps.
 *
 * Three sections:
 *  1. Cursor pagination logic (pure function extracted to match service impl)
 *  2. markRead authorization rules (pure function matching service impl)
 *  3. createNotification / sendFcm — RTM + SOAT type/payload flow tests that
 *     call the REAL service methods and assert on what the RPC client receives.
 */
describe('NotificationsService — business logic', () => {
  // ── 1. Cursor pagination helpers (pure logic extracted for testing) ─────────

  const paginate = <T extends { id: string }>(
    items: T[],
    cursor: string | undefined,
    take: number,
  ): { data: T[]; nextCursor: string | null } => {
    let slice = [...items];

    if (cursor) {
      const idx = slice.findIndex((item) => item.id === cursor);
      if (idx !== -1) {
        slice = slice.slice(idx + 1);
      }
    }

    const hasMore = slice.length > take;
    const data = hasMore ? slice.slice(0, take) : slice;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor };
  };

  const makeNotification = (id: string) => ({ id, type: 'TEST', isRead: false });

  describe('cursor pagination', () => {
    it('returns all items when count <= take and nextCursor is null', () => {
      const items = ['a', 'b', 'c'].map(makeNotification);
      const result = paginate(items, undefined, 10);
      expect(result.data).toHaveLength(3);
      expect(result.nextCursor).toBeNull();
    });

    it('returns first N items and sets nextCursor when count > take', () => {
      const items = ['a', 'b', 'c', 'd', 'e'].map(makeNotification);
      const result = paginate(items, undefined, 3);
      expect(result.data).toHaveLength(3);
      expect(result.nextCursor).toBe('c');
    });

    it('resumes from cursor position correctly', () => {
      const items = ['a', 'b', 'c', 'd', 'e'].map(makeNotification);
      const page1 = paginate(items, undefined, 3);
      const page2 = paginate(items, page1.nextCursor ?? undefined, 3);
      expect(page2.data.map((x) => x.id)).toEqual(['d', 'e']);
      expect(page2.nextCursor).toBeNull();
    });

    it('returns empty data when cursor points to last item', () => {
      const items = ['a', 'b', 'c'].map(makeNotification);
      const result = paginate(items, 'c', 10);
      expect(result.data).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });
  });

  // ── 2. Authorization rules ─────────────────────────────────────────────────

  describe('markRead authorization', () => {
    const checkOwnership = (
      notification: { userId: string } | null,
      requestingUserId: string,
    ) => {
      if (!notification) {
        throw new NotFoundException('Notification not found');
      }
      if (notification.userId !== requestingUserId) {
        throw new ForbiddenException(
          "Cannot mark another user's notification as read",
        );
      }
    };

    it('allows owner to mark notification as read', () => {
      const notification = { id: '1', userId: 'user-1' };
      expect(() => checkOwnership(notification, 'user-1')).not.toThrow();
    });

    it('throws ForbiddenException when user is not owner', () => {
      const notification = { id: '1', userId: 'user-1' };
      expect(() => checkOwnership(notification, 'user-2')).toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when notification is null', () => {
      expect(() => checkOwnership(null, 'user-1')).toThrow(NotFoundException);
    });
  });

  // ── 3. createNotification — real service flow, RTM + SOAT types ────────────
  //
  // These tests call the REAL NotificationsService.createNotification() and
  // assert that the RPC proxy sends 'notification.create' with the correct
  // userId, type, and data fields. The payload is derived from what the
  // service actually sends — not from a local copy.

  describe('createNotification — SOAT reminder types', () => {
    it('SOAT_30D: sends notification.create RPC with correct type and vehicleId', async () => {
      const { service, client } = buildService();

      await service.createNotification('user-1', 'SOAT_30D', {
        vehicleId: 'veh-1',
        vehicleName: 'Mi Honda',
        route: 'rideglory://garage',
      });

      expect(client.send).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          userId: 'user-1',
          type: 'SOAT_30D',
          data: expect.objectContaining({
            vehicleId: 'veh-1',
            vehicleName: 'Mi Honda',
            route: 'rideglory://garage',
          }),
        }),
      );
    });

    it('SOAT_7D: sends notification.create RPC with correct type', async () => {
      const { service, client } = buildService();

      await service.createNotification('user-2', 'SOAT_7D', {
        vehicleId: 'veh-2',
        vehicleName: 'Mi Kawasaki',
        route: 'rideglory://garage',
      });

      expect(client.send).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({ userId: 'user-2', type: 'SOAT_7D' }),
      );
    });

    it('SOAT_DAY_OF: sends notification.create RPC with correct type', async () => {
      const { service, client } = buildService();

      await service.createNotification('user-3', 'SOAT_DAY_OF', {
        vehicleId: 'veh-3',
        vehicleName: 'Mi Suzuki',
        route: 'rideglory://garage',
      });

      expect(client.send).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({ userId: 'user-3', type: 'SOAT_DAY_OF' }),
      );
    });
  });

  describe('createNotification — RTM reminder types', () => {
    it('TECNOMECANICA_30D: sends notification.create RPC with correct type, vehicleId, vehicleName, route', async () => {
      const { service, client } = buildService();

      await service.createNotification('user-1', 'TECNOMECANICA_30D', {
        vehicleId: 'veh-1',
        vehicleName: 'Mi Honda',
        route: 'rideglory://garage',
      });

      expect(client.send).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          userId: 'user-1',
          type: 'TECNOMECANICA_30D',
          data: expect.objectContaining({
            vehicleId: 'veh-1',
            vehicleName: 'Mi Honda',
            route: 'rideglory://garage',
          }),
        }),
      );
    });

    it('TECNOMECANICA_7D: sends notification.create RPC with correct type and payload', async () => {
      const { service, client } = buildService();

      await service.createNotification('user-2', 'TECNOMECANICA_7D', {
        vehicleId: 'veh-2',
        vehicleName: 'Mi Kawasaki',
        route: 'rideglory://garage',
      });

      expect(client.send).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          userId: 'user-2',
          type: 'TECNOMECANICA_7D',
          data: expect.objectContaining({
            vehicleId: 'veh-2',
            vehicleName: 'Mi Kawasaki',
            route: 'rideglory://garage',
          }),
        }),
      );
    });

    it('TECNOMECANICA_DAY_OF: sends notification.create RPC with correct type and payload', async () => {
      const { service, client } = buildService();

      await service.createNotification('user-3', 'TECNOMECANICA_DAY_OF', {
        vehicleId: 'veh-3',
        vehicleName: 'Mi Suzuki',
        route: 'rideglory://garage',
      });

      expect(client.send).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          userId: 'user-3',
          type: 'TECNOMECANICA_DAY_OF',
          data: expect.objectContaining({
            vehicleId: 'veh-3',
            vehicleName: 'Mi Suzuki',
            route: 'rideglory://garage',
          }),
        }),
      );
    });

    it('RTM notification.create RPC is sent with pattern as first argument (not object)', async () => {
      const { service, client } = buildService();

      await service.createNotification('user-1', 'TECNOMECANICA_30D', {
        vehicleId: 'veh-1',
        vehicleName: 'Mi Honda',
        route: 'rideglory://garage',
      });

      // First argument to client.send must be the string pattern
      const firstSendCall = (client.send as jest.Mock).mock.calls[0];
      expect(firstSendCall[0]).toBe('notification.create');
    });
  });

  // ── NEW_REGISTRATION (existing type, regression) ──────────────────────────

  describe('createNotification — registration types', () => {
    it('NEW_REGISTRATION: sends notification.create with scalar IDs in data', async () => {
      const { service, client } = buildService();

      await service.createNotification('user-1', 'NEW_REGISTRATION', {
        eventId: 'event-uuid',
        registrationId: 'reg-uuid',
      });

      expect(client.send).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          userId: 'user-1',
          type: 'NEW_REGISTRATION',
          data: expect.objectContaining({
            eventId: 'event-uuid',
            registrationId: 'reg-uuid',
          }),
        }),
      );
      const sentData = (client.send as jest.Mock).mock.calls[0][1]
        .data as Record<string, unknown>;
      expect(typeof sentData['eventId']).toBe('string');
      expect(typeof sentData['registrationId']).toBe('string');
    });
  });
});
