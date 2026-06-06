import { HttpException, HttpStatus } from '@nestjs/common';
import { AiErrorCode } from '@rideglory/contracts';
import { AiQuotaService } from './ai-quota.service';

// Mock firebase-admin modules
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockRunTransaction = jest.fn();
const mockDoc = jest.fn();
const mockCollection = jest.fn();
const mockGetTemplate = jest.fn();

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => [{}]),
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  })),
  FieldValue: {
    increment: (n: number) => ({ __increment: n }),
  },
  Timestamp: {
    now: () => ({ toMillis: () => Date.now(), seconds: 0, nanoseconds: 0 }),
    fromMillis: (ms: number) => ({ toMillis: () => ms, seconds: 0, nanoseconds: 0 }),
  },
}));

jest.mock('firebase-admin/remote-config', () => ({
  getRemoteConfig: jest.fn(() => ({
    getTemplate: mockGetTemplate,
  })),
}));

describe('AiQuotaService', () => {
  let service: AiQuotaService;

  const setupCollectionChain = () => {
    const mockDocRef = {};
    const mockSubCollection = { doc: jest.fn().mockReturnValue(mockDocRef) };
    const mockUserDoc = { collection: jest.fn().mockReturnValue(mockSubCollection) };
    mockCollection.mockReturnValue({ doc: jest.fn().mockReturnValue(mockUserDoc) });
    return mockDocRef;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiQuotaService();

    // Default: Remote Config returns limits
    mockGetTemplate.mockResolvedValue({
      parameters: {
        ai_description_daily_limit: { defaultValue: { value: '10' } },
        ai_cover_daily_limit: { defaultValue: { value: '5' } },
      },
    });
  });

  describe('checkAndIncrement — description', () => {
    it('sets expireAt = createdAt + 2 days in tx.set() call', async () => {
      const mockDocRef = setupCollectionChain();
      const fixedCreatedAtMs = 1_000_000_000_000; // fixed epoch ms
      const expectedExpireAtMs = fixedCreatedAtMs + 2 * 24 * 60 * 60 * 1000; // +172800000 ms

      let capturedTx: any;
      mockRunTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
        const tx = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              descriptionCount: 3,
              createdAt: { toMillis: () => fixedCreatedAtMs, seconds: 0, nanoseconds: 0 },
            }),
          }),
          set: jest.fn(),
        };
        capturedTx = tx;
        return fn(tx);
      });

      await service.checkAndIncrement('user-1', 'description');

      expect(capturedTx.set).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          expireAt: expect.objectContaining({ toMillis: expect.any(Function) }),
        }),
        { merge: true },
      );
      const writtenExpireAt = capturedTx.set.mock.calls[0][1].expireAt;
      expect(writtenExpireAt.toMillis()).toBe(expectedExpireAtMs);
    });

    it('returns remaining count when under the limit', async () => {
      setupCollectionChain();

      mockRunTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
        const tx = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ descriptionCount: 3 }),
          }),
          set: jest.fn(),
        };
        return fn(tx);
      });

      const remaining = await service.checkAndIncrement('user-1', 'description');
      // limit=10, count=3 → remaining = 10 - 4 = 6
      expect(remaining).toBe(6);
    });

    it('returns limit-1 when doc does not exist yet', async () => {
      setupCollectionChain();

      mockRunTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
        const tx = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
          set: jest.fn(),
        };
        return fn(tx);
      });

      const remaining = await service.checkAndIncrement('user-1', 'description');
      // limit=10, count=0 → remaining = 10 - 1 = 9
      expect(remaining).toBe(9);
    });

    it('throws HttpException(429) with quota_exceeded_user when count >= limit', async () => {
      setupCollectionChain();

      mockRunTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
        const tx = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ descriptionCount: 10 }),
          }),
          set: jest.fn(),
        };
        return fn(tx);
      });

      await expect(service.checkAndIncrement('user-1', 'description')).rejects.toThrow(
        HttpException,
      );

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
  });

  describe('checkAndIncrement — cover', () => {
    it('throws HttpException(429) when cover count >= limit', async () => {
      setupCollectionChain();

      mockRunTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
        const tx = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ coverCount: 5 }),
          }),
          set: jest.fn(),
        };
        return fn(tx);
      });

      await expect(service.checkAndIncrement('user-1', 'cover')).rejects.toThrow(
        HttpException,
      );
    });

    it('returns remaining count for cover under the limit', async () => {
      setupCollectionChain();

      mockRunTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
        const tx = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ coverCount: 2 }),
          }),
          set: jest.fn(),
        };
        return fn(tx);
      });

      const remaining = await service.checkAndIncrement('user-1', 'cover');
      // limit=5, count=2 → remaining = 5 - 3 = 2
      expect(remaining).toBe(2);
    });
  });

  describe('getLimits — Remote Config cache', () => {
    it('uses fallback limits when Remote Config throws', async () => {
      setupCollectionChain();
      mockGetTemplate.mockRejectedValue(new Error('RC unavailable'));

      mockRunTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
        const tx = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
          set: jest.fn(),
        };
        return fn(tx);
      });

      // With fallback description limit=10: remaining = 10-1 = 9
      const remaining = await service.checkAndIncrement('user-1', 'description');
      expect(remaining).toBe(9);
    });

    it('uses parsed Remote Config value when distinct from fallback', async () => {
      // AC9: RC returns '3' (distinct from fallback 10). With count=0, remaining should be 3-1=2, not 9.
      jest.clearAllMocks();
      service = new AiQuotaService();
      mockGetTemplate.mockResolvedValue({
        parameters: {
          ai_description_daily_limit: { defaultValue: { value: '3' } },
          ai_cover_daily_limit: { defaultValue: { value: '2' } },
        },
      });
      setupCollectionChain();

      mockRunTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
        const tx = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
          set: jest.fn(),
        };
        return fn(tx);
      });

      // limit=3 (from RC, not fallback 10), count=0 → remaining = 3 - 1 = 2
      const remaining = await service.checkAndIncrement('user-1', 'description');
      expect(remaining).toBe(2);
      expect(mockGetTemplate).toHaveBeenCalledTimes(1);
    });

    it('caches limits for 5 minutes', async () => {
      setupCollectionChain();

      mockRunTransaction.mockImplementation(async (fn: (tx: any) => Promise<number>) => {
        const tx = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
          set: jest.fn(),
        };
        return fn(tx);
      });

      // Call twice — getTemplate should be called only once
      await service.checkAndIncrement('user-1', 'description');
      await service.checkAndIncrement('user-2', 'description');

      expect(mockGetTemplate).toHaveBeenCalledTimes(1);
    });
  });
});
