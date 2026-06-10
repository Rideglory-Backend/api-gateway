import { HttpException, HttpStatus } from '@nestjs/common';
import { AiErrorCode } from '@rideglory/contracts';
import { AiQuotaService } from './ai-quota.service';

jest.mock('../config/envs', () => ({ envs: { databaseUrl: 'postgresql://test' } }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));

const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();
const mockTransaction = jest.fn();
const mockGetTemplate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $transaction: mockTransaction,
    aiUsageQuota: { findUnique: mockFindUnique, upsert: mockUpsert },
  })),
}));

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => [{}]),
}));

jest.mock('firebase-admin/remote-config', () => ({
  getRemoteConfig: jest.fn(() => ({ getTemplate: mockGetTemplate })),
}));

describe('AiQuotaService', () => {
  let service: AiQuotaService;

  const setupTransaction = (count: number, field: 'descriptionCount' = 'descriptionCount') => {
    mockTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
      const tx = {
        aiUsageQuota: {
          findUnique: jest.fn().mockResolvedValue(count > 0 ? { [field]: count } : null),
          upsert: jest.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiQuotaService();
    mockGetTemplate.mockResolvedValue({
      parameters: {
        ai_description_daily_limit: { defaultValue: { value: '10' } },
      },
    });
  });

  describe('checkAndIncrement — description', () => {
    it('returns remaining count when under the limit', async () => {
      setupTransaction(3);
      const remaining = await service.checkAndIncrement('user-1', 'description');
      // limit=10, count=3 → remaining = 10 - 4 = 6
      expect(remaining).toBe(6);
    });

    it('returns limit-1 when doc does not exist yet', async () => {
      setupTransaction(0);
      const remaining = await service.checkAndIncrement('user-1', 'description');
      // limit=10, count=0 → remaining = 10 - 1 = 9
      expect(remaining).toBe(9);
    });

    it('throws HttpException(429) with quota_exceeded_user when count >= limit', async () => {
      setupTransaction(10);

      await expect(service.checkAndIncrement('user-1', 'description')).rejects.toThrow(HttpException);

      try {
        await service.checkAndIncrement('user-1', 'description');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect((error as HttpException).getResponse()).toEqual({
          error: AiErrorCode.QUOTA_EXCEEDED_USER,
          remaining: 0,
        });
      }
    });

    it('calls upsert with increment when under limit', async () => {
      mockTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
        const mockUpsertTx = jest.fn().mockResolvedValue({});
        const tx = {
          aiUsageQuota: {
            findUnique: jest.fn().mockResolvedValue({ descriptionCount: 2 }),
            upsert: mockUpsertTx,
          },
        };
        const result = await fn(tx);
        expect(mockUpsertTx).toHaveBeenCalledWith(
          expect.objectContaining({
            update: { descriptionCount: { increment: 1 } },
          }),
        );
        return result;
      });

      await service.checkAndIncrement('user-1', 'description');
    });
  });

  describe('getLimits — Remote Config cache', () => {
    it('uses fallback limits when Remote Config throws', async () => {
      mockGetTemplate.mockRejectedValue(new Error('RC unavailable'));
      setupTransaction(0);
      // With fallback description limit=10: remaining = 10-1 = 9
      const remaining = await service.checkAndIncrement('user-1', 'description');
      expect(remaining).toBe(9);
    });

    it('uses parsed Remote Config value when distinct from fallback', async () => {
      jest.clearAllMocks();
      service = new AiQuotaService();
      mockGetTemplate.mockResolvedValue({
        parameters: {
          ai_description_daily_limit: { defaultValue: { value: '3' } },
        },
      });
      setupTransaction(0);
      // limit=3 (from RC, not fallback 10), count=0 → remaining = 3 - 1 = 2
      const remaining = await service.checkAndIncrement('user-1', 'description');
      expect(remaining).toBe(2);
      expect(mockGetTemplate).toHaveBeenCalledTimes(1);
    });

    it('caches limits for 5 minutes', async () => {
      setupTransaction(0);
      await service.checkAndIncrement('user-1', 'description');
      await service.checkAndIncrement('user-2', 'description');
      expect(mockGetTemplate).toHaveBeenCalledTimes(1);
    });
  });
});
