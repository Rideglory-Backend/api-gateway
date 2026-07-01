/**
 * Unit tests for TrackingNotificationsService.sendEventEndedNotifications()
 *
 * AC4: registrants APPROVED with fcmToken receive FCM with type='TRACKING_ENDED'
 *      and deeplink 'rideglory://events/detail-by-id?id=<eventId>'.
 *      Registrants without fcmToken do NOT receive FCM.
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
import { TrackingNotificationsService } from './tracking-notifications.service';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeClientProxy(responses?: unknown[]) {
  const proxy = {
    send: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnValue('__observable__'),
    }),
  };
  if (responses) {
    mockFirstValueFrom.mockReset();
    let idx = 0;
    mockFirstValueFrom.mockImplementation(() =>
      Promise.resolve(responses[idx++]),
    );
  }
  return proxy;
}

function makeNotificationsService() {
  return {
    sendFcm: jest.fn().mockResolvedValue(undefined),
  };
}

function buildSvc(firstValueFromResponses: unknown[]) {
  const eventsService = makeClientProxy(firstValueFromResponses);
  const usersService = makeClientProxy();
  const notificationsService = makeNotificationsService();

  const svc = new TrackingNotificationsService(
    eventsService as never,
    usersService as never,
    notificationsService as never,
  );

  return { svc, eventsService, usersService, notificationsService };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFirstValueFrom.mockReset();
});

// ── AC4: FCM sent with correct type and deeplink ──────────────────────────────

describe('TrackingNotificationsService.sendEventEndedNotifications', () => {
  const eventId = 'event-abc-123';

  it('sends FCM with type=TRACKING_ENDED and correct deeplink to APPROVED registrant with fcmToken', async () => {
    const { svc, notificationsService } = buildSvc([
      /* getApprovedRegistrantUserIds */ ['user-1'],
      /* findOneUser for user-1 */ { id: 'user-1', fcmToken: 'fcm-token-xyz' },
    ]);

    await svc.sendEventEndedNotifications(eventId);

    expect(notificationsService.sendFcm).toHaveBeenCalledTimes(1);
    expect(notificationsService.sendFcm).toHaveBeenCalledWith(
      'fcm-token-xyz',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        type: 'TRACKING_ENDED',
        route: `rideglory://events/detail-by-id?id=${eventId}`,
      }),
    );
  });

  it('does NOT call sendFcm when the registrant has no fcmToken (null)', async () => {
    const { svc, notificationsService } = buildSvc([
      /* getApprovedRegistrantUserIds */ ['user-2'],
      /* findOneUser for user-2 */ { id: 'user-2', fcmToken: null },
    ]);

    await svc.sendEventEndedNotifications(eventId);

    expect(notificationsService.sendFcm).not.toHaveBeenCalled();
  });

  it('does NOT call sendFcm when there are no approved registrants', async () => {
    const { svc, notificationsService } = buildSvc([
      /* getApprovedRegistrantUserIds */ [],
    ]);

    await svc.sendEventEndedNotifications(eventId);

    expect(notificationsService.sendFcm).not.toHaveBeenCalled();
  });

  it('sends FCM only to registrants with fcmToken when the list is mixed', async () => {
    const { svc, notificationsService } = buildSvc([
      /* getApprovedRegistrantUserIds */ ['user-1', 'user-2'],
      /* findOneUser for user-1 */ {
        id: 'user-1',
        fcmToken: 'token-for-user-1',
      },
      /* findOneUser for user-2 */ { id: 'user-2', fcmToken: null },
    ]);

    await svc.sendEventEndedNotifications(eventId);

    expect(notificationsService.sendFcm).toHaveBeenCalledTimes(1);
    expect(notificationsService.sendFcm).toHaveBeenCalledWith(
      'token-for-user-1',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        type: 'TRACKING_ENDED',
        route: `rideglory://events/detail-by-id?id=${eventId}`,
      }),
    );
  });

  it('embeds the correct eventId in the deeplink route', async () => {
    const specificEventId = 'specific-event-456';
    const { svc, notificationsService } = buildSvc([
      ['user-1'],
      { id: 'user-1', fcmToken: 'some-token' },
    ]);

    await svc.sendEventEndedNotifications(specificEventId);

    const [, , , data] = notificationsService.sendFcm.mock.calls[0] as [
      string,
      string,
      string,
      { type: string; route: string },
    ];
    expect(data.route).toBe(
      `rideglory://events/detail-by-id?id=${specificEventId}`,
    );
  });
});
