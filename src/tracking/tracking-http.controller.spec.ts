/**
 * Unit tests for TrackingHttpController.endTracking()
 *
 * AC9: POST /api/events/:eventId/tracking/end still works correctly:
 *   (a) returns the trackingEnd result from events-ms
 *   (b) calls trackingBroadcaster.broadcastEventEnded(eventId)
 *   (c) delegates FCM to trackingNotificationsService.sendEventEndedNotifications(eventId)
 * Owner resolution:
 *   - the event owner is stored with the DB user id, so the controller must
 *     resolve email → dbUser.id (via findUserByEmail) and pass THAT as
 *     authUserId, not the raw Firebase uid.
 * Auth guard:
 *   - email present → proceeds
 *   - missing email → UnauthorizedException thrown immediately
 */

// ── Mock rxjs firstValueFrom before imports ───────────────────────────────────
const mockFirstValueFrom = jest.fn();

jest.mock('rxjs', () => {
  const actual = jest.requireActual<typeof import('rxjs')>('rxjs');

  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    firstValueFrom: (...args: unknown[]) => mockFirstValueFrom(...args),
  };
});

// ── Import after mocking ──────────────────────────────────────────────────────
import { UnauthorizedException } from '@nestjs/common';
import { TrackingHttpController } from './tracking-http.controller';
import { Request } from 'express';

// ── Mock helpers ──────────────────────────────────────────────────────────────

type MockClientProxy = { send: jest.Mock };
type MockBroadcaster = {
  broadcastEventEnded: jest.Mock;
  broadcastEventStarted: jest.Mock;
};
type MockNotificationsSvc = { sendEventEndedNotifications: jest.Mock };

function makeClientProxy(): MockClientProxy {
  return {
    send: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnValue('__observable__'),
    }),
  };
}

function makeTrackingBroadcaster(): MockBroadcaster {
  return {
    broadcastEventEnded: jest.fn(),
    broadcastEventStarted: jest.fn(),
  };
}

function makeTrackingNotificationsService(): MockNotificationsSvc {
  return {
    sendEventEndedNotifications: jest.fn().mockResolvedValue(undefined),
  };
}

function makeRequest(overrides?: Partial<{ uid: string; email: string }>) {
  return {
    user: {
      uid: overrides?.uid ?? 'firebase-uid-1',
      email: 'email' in (overrides ?? {}) ? overrides?.email : 'organizer@test.com',
    },
  } as unknown as Request;
}

function buildController() {
  const eventsService = makeClientProxy();
  const usersService = makeClientProxy();
  const broadcaster = makeTrackingBroadcaster();
  const notificationsSvc = makeTrackingNotificationsService();

  const controller = new TrackingHttpController(
    eventsService as never,
    usersService as never,
    broadcaster as never,
    notificationsSvc as never,
  );

  return {
    controller,
    eventsService,
    usersService,
    broadcaster,
    notificationsSvc,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFirstValueFrom.mockReset();
});

// ── endTracking — happy path ──────────────────────────────────────────────────

describe('TrackingHttpController.endTracking — happy path', () => {
  const eventId = 'event-uuid-001';
  const dbUserId = 'db-user-organizer';
  const endResult = { id: eventId, state: 'FINISHED' };

  // firstValueFrom is called twice per request: (1) findUserByEmail → dbUser,
  // (2) trackingEnd → endResult.
  function primeRpcs() {
    mockFirstValueFrom
      .mockResolvedValueOnce({ id: dbUserId })
      .mockResolvedValueOnce(endResult);
  }

  it('(a) returns the result from the events-ms trackingEnd RPC', async () => {
    const { controller } = buildController();
    primeRpcs();

    const result = await controller.endTracking(eventId, makeRequest());

    expect(result).toEqual(endResult);
  });

  it('(b) calls trackingBroadcaster.broadcastEventEnded with eventId', async () => {
    const { controller, broadcaster } = buildController();
    primeRpcs();

    await controller.endTracking(eventId, makeRequest());

    expect(broadcaster.broadcastEventEnded).toHaveBeenCalledWith(eventId);
  });

  it('(c) delegates FCM to trackingNotificationsService.sendEventEndedNotifications', async () => {
    const { controller, notificationsSvc } = buildController();
    primeRpcs();

    await controller.endTracking(eventId, makeRequest());

    await Promise.resolve();

    expect(notificationsSvc.sendEventEndedNotifications).toHaveBeenCalledWith(
      eventId,
    );
  });

  it('resolves the DB user id from email and passes it as authUserId', async () => {
    const { controller, eventsService, usersService } = buildController();
    primeRpcs();

    await controller.endTracking(
      eventId,
      makeRequest({ email: 'organizer@test.com' }),
    );

    expect(usersService.send).toHaveBeenCalledWith('findUserByEmail', {
      email: 'organizer@test.com',
    });
    expect(eventsService.send).toHaveBeenCalledWith('trackingEnd', {
      eventId,
      authUserId: dbUserId,
    });
  });
});

// ── endTracking — auth guard ──────────────────────────────────────────────────

describe('TrackingHttpController.endTracking — auth guard', () => {
  const eventId = 'event-uuid-002';

  it('throws UnauthorizedException when email is missing from request.user', async () => {
    const { controller } = buildController();
    const request = makeRequest({ email: undefined });

    await expect(controller.endTracking(eventId, request)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when request.user is undefined', async () => {
    const { controller } = buildController();
    const request = { user: undefined } as unknown as Request;

    await expect(controller.endTracking(eventId, request)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
