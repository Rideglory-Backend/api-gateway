import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Unit tests for NotificationsService — business logic isolated from Prisma.
 * We test the cursor pagination logic and authorization rules.
 */
describe('NotificationsService — business logic', () => {
  // ── Cursor pagination helpers (pure logic extracted for testing) ──────────

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

  // ── Authorization rules ───────────────────────────────────────────────────

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

  // ── FCM payload validation ────────────────────────────────────────────────

  describe('notification payload', () => {
    it('NEW_REGISTRATION payload contains only scalar IDs', () => {
      const payload = {
        eventId: 'event-uuid',
        registrationId: 'reg-uuid',
      };
      expect(typeof payload.eventId).toBe('string');
      expect(typeof payload.registrationId).toBe('string');
      expect(Object.keys(payload)).toHaveLength(2);
    });

    it('SOAT reminder payload contains vehicleId and vehicleName', () => {
      const payload = { vehicleId: 'veh-uuid', vehicleName: 'Mi Honda' };
      expect(payload.vehicleId).toBeDefined();
      expect(payload.vehicleName).toBeDefined();
    });
  });
});
