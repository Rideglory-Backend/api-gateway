/**
 * Unit tests for NotificationSchedulerService — real service instantiation.
 *
 * Strategy: instantiate NotificationSchedulerService with all dependencies
 * mocked (vehiclesService ClientProxy, usersService ClientProxy,
 * notificationsService, logger). Mock firstValueFrom at module level so that
 * RPC calls resolve with controlled fixtures. Call the real public cron
 * methods and assert on what the real service actually calls.
 */

import { Logger } from '@nestjs/common';

// ── Mock rxjs firstValueFrom BEFORE importing the service ────────────────────
// This lets us control what every RPC call resolves to per-test.

const mockFirstValueFrom = jest.fn();

jest.mock('rxjs', () => {
  const actual = jest.requireActual<typeof import('rxjs')>('rxjs');
  return {
    ...actual,
    firstValueFrom: (...args: unknown[]) => mockFirstValueFrom(...args),
  };
});

// ── Import after mocking ─────────────────────────────────────────────────────

import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationsService } from '../notifications/notifications.service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VEHICLE = { id: 'veh-1', name: 'Mi Honda', ownerId: 'user-1' };
const USER_WITH_FCM = { id: 'user-1', fcmToken: 'fcm-token-abc' };
const USER_NO_FCM = { id: 'user-1', fcmToken: null };

const makeSoatRecord = (id = 'soat-1', vehicleId = 'veh-1') => ({
  id,
  vehicleId,
  expiryDate: new Date().toISOString(),
});

const makeRtmRecord = (id = 'rtm-1', vehicleId = 'veh-1') => ({
  id,
  vehicleId,
  expiryDate: new Date().toISOString(),
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makeClientProxy() {
  return {
    send: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnValue('__observable__'),
    }),
  };
}

function makeNotificationsService() {
  return {
    createNotification: jest.fn().mockResolvedValue(undefined),
    sendFcm: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;
}

function makeLogger() {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

// ── Build service instance ────────────────────────────────────────────────────

function buildService(overrides?: {
  vehiclesService?: ReturnType<typeof makeClientProxy>;
  usersService?: ReturnType<typeof makeClientProxy>;
  notificationsService?: NotificationsService;
}) {
  const vehiclesService = overrides?.vehiclesService ?? makeClientProxy();
  const usersService = overrides?.usersService ?? makeClientProxy();
  const notificationsService =
    overrides?.notificationsService ?? makeNotificationsService();

  // NotificationSchedulerService also injects eventsService and maintenancesService
  // but those aren't used by the document-expiry reminders; stub them.
  const eventsService = makeClientProxy();
  const maintenancesService = makeClientProxy();

  // Use Object.create to bypass constructor DI (NestJS decorators)
  const service = Object.create(
    NotificationSchedulerService.prototype,
  ) as NotificationSchedulerService;

  // Inject private fields directly
  (service as unknown as Record<string, unknown>)['notificationsService'] =
    notificationsService;
  (service as unknown as Record<string, unknown>)['vehiclesService'] =
    vehiclesService;
  (service as unknown as Record<string, unknown>)['usersService'] =
    usersService;
  (service as unknown as Record<string, unknown>)['eventsService'] =
    eventsService;
  (service as unknown as Record<string, unknown>)['maintenancesService'] =
    maintenancesService;
  (service as unknown as Record<string, unknown>)['logger'] = makeLogger();

  return { service, vehiclesService, usersService, notificationsService };
}

// ── Helper: set up firstValueFrom resolution sequence ────────────────────────
//
// The service calls firstValueFrom three times per happy-path record:
//   1. RPC to vehiclesService (findSoatsExpiringIn / findTecnomecanicasExpiringIn)
//   2. RPC to vehiclesService (getVehicleById)
//   3. RPC to usersService (findOneUser)
// Each call receives the result of `.pipe(timeout(...))` which we stubbed as
// the string '__observable__'. We use mockFirstValueFrom to return values in
// call order.

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

// ── RTM crons — 30/7/0 days ───────────────────────────────────────────────────

describe('NotificationSchedulerService — RTM crons', () => {
  const rtmCases: Array<{
    method: keyof NotificationSchedulerService;
    days: number;
    type: string;
    titleFragment: string;
    bodyFragment: string;
  }> = [
    {
      method: 'tecnomecanicaReminder30Days',
      days: 30,
      type: 'TECNOMECANICA_30D',
      titleFragment: '30 días',
      bodyFragment: '30 días',
    },
    {
      method: 'tecnomecanicaReminder7Days',
      days: 7,
      type: 'TECNOMECANICA_7D',
      titleFragment: '7 días',
      bodyFragment: '7 días',
    },
    {
      method: 'tecnomecanicaReminderDayOf',
      days: 0,
      type: 'TECNOMECANICA_DAY_OF',
      titleFragment: 'hoy',
      bodyFragment: 'hoy',
    },
  ];

  for (const { method, days, type, titleFragment, bodyFragment } of rtmCases) {
    describe(`${String(method)}`, () => {
      it(`sends RPC findTecnomecanicasExpiringIn with daysUntilExpiry=${days}`, async () => {
        const { service, vehiclesService } = buildService();
        const record = makeRtmRecord();

        setFirstValueFromSequence([record], VEHICLE, USER_WITH_FCM);

        await (service[method] as () => Promise<void>)();

        expect(vehiclesService.send).toHaveBeenCalledWith(
          'findTecnomecanicasExpiringIn',
          { daysUntilExpiry: days },
        );
      });

      it(`calls createNotification with type=${type} and route=rideglory://garage`, async () => {
        const notificationsService = makeNotificationsService();
        const { service } = buildService({ notificationsService });
        const record = makeRtmRecord();

        setFirstValueFromSequence([record], VEHICLE, USER_WITH_FCM);

        await (service[method] as () => Promise<void>)();

        expect(notificationsService.createNotification).toHaveBeenCalledWith(
          USER_WITH_FCM.id,
          type,
          expect.objectContaining({
            vehicleId: VEHICLE.id,
            vehicleName: VEHICLE.name,
            route: 'rideglory://garage',
          }),
        );
      });

      it(`sends FCM with title containing "${titleFragment}" and body containing "${bodyFragment}"`, async () => {
        const notificationsService = makeNotificationsService();
        const { service } = buildService({ notificationsService });
        const record = makeRtmRecord();

        setFirstValueFromSequence([record], VEHICLE, USER_WITH_FCM);

        await (service[method] as () => Promise<void>)();

        expect(notificationsService.sendFcm).toHaveBeenCalledWith(
          USER_WITH_FCM.fcmToken,
          expect.stringContaining(titleFragment),
          expect.stringContaining(bodyFragment),
          expect.objectContaining({ type, route: 'rideglory://garage' }),
        );
      });

      it('does not call sendFcm when user has no FCM token', async () => {
        const notificationsService = makeNotificationsService();
        const { service } = buildService({ notificationsService });
        const record = makeRtmRecord();

        setFirstValueFromSequence([record], VEHICLE, USER_NO_FCM);

        await (service[method] as () => Promise<void>)();

        expect(notificationsService.createNotification).toHaveBeenCalled();
        expect(notificationsService.sendFcm).not.toHaveBeenCalled();
      });
    });
  }

  // ── Empty-list guard ─────────────────────────────────────────────────────────

  describe('empty-list guard', () => {
    it('does not call createNotification when findTecnomecanicasExpiringIn returns []', async () => {
      const notificationsService = makeNotificationsService();
      const { service } = buildService({ notificationsService });

      // RPC returns empty list
      setFirstValueFromSequence([]);

      await service.tecnomecanicaReminder30Days();

      expect(notificationsService.createNotification).not.toHaveBeenCalled();
    });

    it('does not call sendFcm when findTecnomecanicasExpiringIn returns []', async () => {
      const notificationsService = makeNotificationsService();
      const { service } = buildService({ notificationsService });

      setFirstValueFromSequence([]);

      await service.tecnomecanicaReminder7Days();

      expect(notificationsService.sendFcm).not.toHaveBeenCalled();
    });
  });
});

// ── SOAT regression suite ─────────────────────────────────────────────────────

describe('NotificationSchedulerService — SOAT regression', () => {
  const soatCases: Array<{
    method: keyof NotificationSchedulerService;
    days: number;
    type: string;
    titleFragment: string;
    bodyFragment: string;
  }> = [
    {
      method: 'soatReminder30Days',
      days: 30,
      type: 'SOAT_30D',
      titleFragment: '30 días',
      bodyFragment: '30 días',
    },
    {
      method: 'soatReminder7Days',
      days: 7,
      type: 'SOAT_7D',
      titleFragment: '7 días',
      bodyFragment: '7 días',
    },
    {
      method: 'soatReminderDayOf',
      days: 0,
      type: 'SOAT_DAY_OF',
      titleFragment: 'hoy',
      bodyFragment: 'hoy',
    },
  ];

  for (const { method, days, type, titleFragment, bodyFragment } of soatCases) {
    describe(`${String(method)}`, () => {
      it(`sends RPC findSoatsExpiringIn with daysUntilExpiry=${days}`, async () => {
        const { service, vehiclesService } = buildService();
        const record = makeSoatRecord();

        setFirstValueFromSequence([record], VEHICLE, USER_WITH_FCM);

        await (service[method] as () => Promise<void>)();

        expect(vehiclesService.send).toHaveBeenCalledWith(
          'findSoatsExpiringIn',
          { daysUntilExpiry: days },
        );
      });

      it(`calls createNotification with type=${type} and route=rideglory://garage`, async () => {
        const notificationsService = makeNotificationsService();
        const { service } = buildService({ notificationsService });
        const record = makeSoatRecord();

        setFirstValueFromSequence([record], VEHICLE, USER_WITH_FCM);

        await (service[method] as () => Promise<void>)();

        expect(notificationsService.createNotification).toHaveBeenCalledWith(
          USER_WITH_FCM.id,
          type,
          expect.objectContaining({
            vehicleId: VEHICLE.id,
            vehicleName: VEHICLE.name,
            route: 'rideglory://garage',
          }),
        );
      });

      it(`sends FCM with title containing "${titleFragment}" and body containing vehicle name`, async () => {
        const notificationsService = makeNotificationsService();
        const { service } = buildService({ notificationsService });
        const record = makeSoatRecord();

        setFirstValueFromSequence([record], VEHICLE, USER_WITH_FCM);

        await (service[method] as () => Promise<void>)();

        expect(notificationsService.sendFcm).toHaveBeenCalledWith(
          USER_WITH_FCM.fcmToken,
          expect.stringContaining(titleFragment),
          expect.stringContaining(VEHICLE.name),
          expect.objectContaining({ type, route: 'rideglory://garage' }),
        );
      });

      it(`FCM body for ${type} does NOT mention RTM/técnico-mecánica`, async () => {
        const notificationsService = makeNotificationsService();
        const { service } = buildService({ notificationsService });
        const record = makeSoatRecord();

        setFirstValueFromSequence([record], VEHICLE, USER_WITH_FCM);

        await (service[method] as () => Promise<void>)();

        const sendFcmCall = (
          notificationsService.sendFcm as jest.Mock
        ).mock.calls[0];
        const body: string = sendFcmCall[2];
        expect(body).not.toContain('técnico-mecánica');
        expect(body).not.toContain('RTM');
      });
    });
  }

  // ── Empty-list guard (SOAT) ──────────────────────────────────────────────────

  describe('empty-list guard', () => {
    it('does not call createNotification when findSoatsExpiringIn returns []', async () => {
      const notificationsService = makeNotificationsService();
      const { service } = buildService({ notificationsService });

      setFirstValueFromSequence([]);

      await service.soatReminder30Days();

      expect(notificationsService.createNotification).not.toHaveBeenCalled();
    });

    it('does not call sendFcm when findSoatsExpiringIn returns []', async () => {
      const notificationsService = makeNotificationsService();
      const { service } = buildService({ notificationsService });

      setFirstValueFromSequence([]);

      await service.soatReminderDayOf();

      expect(notificationsService.sendFcm).not.toHaveBeenCalled();
    });
  });
});

// ── Cron method existence (smoke test) ────────────────────────────────────────

describe('NotificationSchedulerService — method existence', () => {
  const proto = NotificationSchedulerService.prototype;

  it('soatReminder30Days exists', () => {
    expect(typeof proto.soatReminder30Days).toBe('function');
  });
  it('soatReminder7Days exists', () => {
    expect(typeof proto.soatReminder7Days).toBe('function');
  });
  it('soatReminderDayOf exists', () => {
    expect(typeof proto.soatReminderDayOf).toBe('function');
  });
  it('tecnomecanicaReminder30Days exists', () => {
    expect(typeof proto.tecnomecanicaReminder30Days).toBe('function');
  });
  it('tecnomecanicaReminder7Days exists', () => {
    expect(typeof proto.tecnomecanicaReminder7Days).toBe('function');
  });
  it('tecnomecanicaReminderDayOf exists', () => {
    expect(typeof proto.tecnomecanicaReminderDayOf).toBe('function');
  });
});
