/**
 * Unit tests for NotificationSchedulerService.autoEndStalledEvents()
 *
 * Strategy: instantiate the service via Object.create (bypassing NestJS DI),
 * inject mocked dependencies directly, and mock firstValueFrom at module level.
 */

// ── Mock rxjs firstValueFrom BEFORE importing the service ────────────────────
const mockFirstValueFrom = jest.fn();

jest.mock('rxjs', () => {
  const actual = jest.requireActual<typeof import('rxjs')>('rxjs');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    firstValueFrom: (...args: unknown[]) => mockFirstValueFrom(...args),
  };
});

// ── Import after mocking ─────────────────────────────────────────────────────
import { NotificationSchedulerService } from './notification-scheduler.service';
import { TrackingNotificationsService } from '../tracking/tracking-notifications.service';
import { TrackingBroadcaster } from '../tracking/tracking-broadcaster.service';

// ── Typed mock helpers ────────────────────────────────────────────────────────

type MockClientProxy = { send: jest.Mock };
type MockTrackingNotifications = { sendEventEndedNotifications: jest.Mock };
type MockTrackingBroadcaster = { broadcastEventEnded: jest.Mock };
type MockLogger = { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

// ── Factories ─────────────────────────────────────────────────────────────────

function makeClientProxy(): MockClientProxy {
  return {
    send: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnValue('__observable__'),
    }),
  };
}

function makeTrackingNotificationsService(): MockTrackingNotifications &
  TrackingNotificationsService {
  return {
    sendEventEndedNotifications: jest.fn().mockResolvedValue(undefined),
  } as unknown as MockTrackingNotifications & TrackingNotificationsService;
}

function makeTrackingBroadcaster(): MockTrackingBroadcaster &
  TrackingBroadcaster {
  return {
    broadcastEventEnded: jest.fn(),
  } as unknown as MockTrackingBroadcaster & TrackingBroadcaster;
}

function makeLogger(): MockLogger {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function buildService(overrides?: {
  trackingNotificationsService?: TrackingNotificationsService;
  trackingBroadcaster?: TrackingBroadcaster;
}) {
  const eventsService = makeClientProxy();
  const trackingNotificationsService =
    overrides?.trackingNotificationsService ??
    makeTrackingNotificationsService();
  const trackingBroadcaster =
    overrides?.trackingBroadcaster ?? makeTrackingBroadcaster();

  const service = Object.create(
    NotificationSchedulerService.prototype,
  ) as NotificationSchedulerService;

  const svc = service as unknown as Record<string, unknown>;
  svc['notificationsService'] = {
    createNotification: jest.fn(),
    sendFcm: jest.fn(),
  };
  svc['vehiclesService'] = makeClientProxy();
  svc['usersService'] = makeClientProxy();
  svc['eventsService'] = eventsService;
  svc['maintenancesService'] = makeClientProxy();
  svc['trackingNotificationsService'] = trackingNotificationsService;
  svc['trackingBroadcaster'] = trackingBroadcaster;
  svc['logger'] = makeLogger();
  svc['_autoEndRunning'] = false;

  return {
    service,
    eventsService,
    trackingNotificationsService:
      trackingNotificationsService as unknown as MockTrackingNotifications,
    trackingBroadcaster:
      trackingBroadcaster as unknown as MockTrackingBroadcaster,
    logger: svc['logger'] as MockLogger,
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────

function setFirstValueFromSequence(...values: unknown[]) {
  mockFirstValueFrom.mockReset();
  let callIndex = 0;
  mockFirstValueFrom.mockImplementation(() => {
    const value = values[callIndex++];
    return Promise.resolve(value);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFirstValueFrom.mockReset();
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('autoEndStalledEvents — happy path', () => {
  it('calls forceEndTracking, broadcastEventEnded, and sendEventEndedNotifications for each stalled event', async () => {
    const {
      service,
      eventsService,
      trackingNotificationsService,
      trackingBroadcaster,
    } = buildService();

    // Sequence: findActiveEventsOlderThan → [evt-1], forceEndTracking → { id, state }
    setFirstValueFromSequence([{ id: 'evt-1' }], {
      id: 'evt-1',
      state: 'FINISHED',
    });

    await service.autoEndStalledEvents();

    expect(eventsService.send).toHaveBeenCalledWith(
      'findActiveEventsOlderThan',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect.objectContaining({ cutoffDate: expect.any(String) }),
    );
    expect(eventsService.send).toHaveBeenCalledWith('forceEndTracking', {
      eventId: 'evt-1',
    });
    expect(trackingBroadcaster.broadcastEventEnded).toHaveBeenCalledWith(
      'evt-1',
    );
    expect(
      trackingNotificationsService.sendEventEndedNotifications,
    ).toHaveBeenCalledWith('evt-1');
  });

  it('passes a cutoffDate approximately 24 hours in the past', async () => {
    const { service, eventsService } = buildService();

    setFirstValueFromSequence([], undefined);

    const before = Date.now();
    await service.autoEndStalledEvents();
    const after = Date.now();

    const sendCalls = eventsService.send.mock.calls as Array<[string, unknown]>;
    const sendCall = sendCalls.find(
      (call) => call[0] === 'findActiveEventsOlderThan',
    );
    const payload = sendCall![1] as { cutoffDate: string };
    const cutoffDate = new Date(payload.cutoffDate).getTime();
    const expected24hAgo = before - 24 * 60 * 60_000;

    expect(cutoffDate).toBeGreaterThanOrEqual(expected24hAgo - 1000);
    expect(cutoffDate).toBeLessThanOrEqual(after - 24 * 60 * 60_000 + 1000);
  });
});

// ── No events ─────────────────────────────────────────────────────────────────

describe('autoEndStalledEvents — no stalled events', () => {
  it('returns immediately without calling forceEndTracking when event list is empty', async () => {
    const {
      service,
      eventsService,
      trackingBroadcaster,
      trackingNotificationsService,
    } = buildService();

    setFirstValueFromSequence([]);

    await service.autoEndStalledEvents();

    const forceEndCalls = (
      eventsService.send.mock.calls as Array<[string, unknown]>
    ).filter((call) => call[0] === 'forceEndTracking');
    expect(forceEndCalls).toHaveLength(0);
    expect(trackingBroadcaster.broadcastEventEnded).not.toHaveBeenCalled();
    expect(
      trackingNotificationsService.sendEventEndedNotifications,
    ).not.toHaveBeenCalled();
  });
});

// ── Error isolation ───────────────────────────────────────────────────────────

describe('autoEndStalledEvents — error isolation', () => {
  it('continues processing event-2 even when forceEndTracking fails for event-1', async () => {
    const { service, eventsService, trackingBroadcaster } = buildService();

    // findActiveEventsOlderThan returns two events
    // forceEndTracking for evt-1 throws, forceEndTracking for evt-2 succeeds
    mockFirstValueFrom
      .mockReset()
      .mockResolvedValueOnce([{ id: 'evt-1' }, { id: 'evt-2' }])
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValueOnce({ id: 'evt-2', state: 'FINISHED' });

    await service.autoEndStalledEvents();

    expect(eventsService.send).toHaveBeenCalledWith('forceEndTracking', {
      eventId: 'evt-1',
    });
    expect(eventsService.send).toHaveBeenCalledWith('forceEndTracking', {
      eventId: 'evt-2',
    });
    // Only evt-2 gets broadcast (evt-1 failed before broadcast)
    expect(trackingBroadcaster.broadcastEventEnded).toHaveBeenCalledWith(
      'evt-2',
    );
    expect(trackingBroadcaster.broadcastEventEnded).not.toHaveBeenCalledWith(
      'evt-1',
    );
  });
});

// ── Guard: prevents concurrent execution ─────────────────────────────────────

describe('autoEndStalledEvents — concurrent execution guard', () => {
  it('skips the run and logs a warning when _autoEndRunning is already true', async () => {
    const { service, eventsService, logger } = buildService();

    // Simulate a previous run still in progress
    (service as unknown as Record<string, unknown>)['_autoEndRunning'] = true;

    await service.autoEndStalledEvents();

    // eventsService.send should never be called
    expect(eventsService.send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('previous run still in progress'),
    );
  });

  it('resets _autoEndRunning to false in the finally block after successful run', async () => {
    const { service } = buildService();

    setFirstValueFromSequence([]);

    await service.autoEndStalledEvents();

    expect(
      (service as unknown as Record<string, unknown>)['_autoEndRunning'],
    ).toBe(false);
  });

  it('resets _autoEndRunning to false even when an error occurs fetching events', async () => {
    const { service } = buildService();

    mockFirstValueFrom
      .mockReset()
      .mockRejectedValueOnce(new Error('network error'));

    await service.autoEndStalledEvents();

    expect(
      (service as unknown as Record<string, unknown>)['_autoEndRunning'],
    ).toBe(false);
  });
});

// ── Method existence smoke test ───────────────────────────────────────────────

describe('autoEndStalledEvents — method existence', () => {
  it('autoEndStalledEvents exists on prototype', () => {
    expect(
      typeof NotificationSchedulerService.prototype.autoEndStalledEvents,
    ).toBe('function');
  });
});
