import { StorageCleanupService } from './storage-cleanup.service';

// Mock firebase-admin/app and firebase-admin/storage
const mockGetApps = jest.fn().mockReturnValue([{}]);

jest.mock('firebase-admin/app', () => ({
  getApps: () => mockGetApps(),
}));

function makeFile(timeCreated: string, name = 'pending/user/file.png') {
  return {
    name,
    getMetadata: jest.fn().mockResolvedValue([{ timeCreated }]),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDeletableFile() {
  return { delete: jest.fn().mockResolvedValue(undefined) };
}

const mockBucket = {
  name: 'rideglory-test.appspot.com',
  getFiles: jest.fn(),
  file: jest.fn(),
};
const mockGetStorage = jest.fn().mockReturnValue({ bucket: () => mockBucket });

jest.mock('firebase-admin/storage', () => ({
  getStorage: (...args: unknown[]) => mockGetStorage(...args),
}));

describe('StorageCleanupService', () => {
  let service: StorageCleanupService;
  const NOW = new Date('2026-06-05T03:00:00Z').getTime();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    service = new StorageCleanupService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deletes files older than 7 days', async () => {
    const old = makeFile('2026-05-28T02:59:59Z'); // just before 7-day boundary → eligible
    mockBucket.getFiles.mockResolvedValue([[old]]);

    await service.cleanPendingCovers();

    expect(old.delete).toHaveBeenCalledTimes(1);
  });

  it('does NOT delete files newer than 7 days', async () => {
    const recent = makeFile('2026-06-04T12:00:00Z'); // 23h ago → safe
    mockBucket.getFiles.mockResolvedValue([[recent]]);

    await service.cleanPendingCovers();

    expect(recent.delete).not.toHaveBeenCalled();
  });

  it('does NOT delete a file whose timeCreated equals exactly sevenDaysAgo', async () => {
    const sevenDaysAgoMs = NOW - 7 * 24 * 60 * 60 * 1000;
    const exact = makeFile(new Date(sevenDaysAgoMs).toISOString());
    mockBucket.getFiles.mockResolvedValue([[exact]]);

    await service.cleanPendingCovers();

    // new Date(timeCreated) < sevenDaysAgo is false when equal
    expect(exact.delete).not.toHaveBeenCalled();
  });

  it('deletes only eligible files when mix of old and new', async () => {
    const old1 = makeFile('2026-05-20T00:00:00Z');
    const old2 = makeFile('2026-05-15T00:00:00Z');
    const recent = makeFile('2026-06-03T00:00:00Z');
    mockBucket.getFiles.mockResolvedValue([[old1, recent, old2]]);

    await service.cleanPendingCovers();

    expect(old1.delete).toHaveBeenCalledTimes(1);
    expect(old2.delete).toHaveBeenCalledTimes(1);
    expect(recent.delete).not.toHaveBeenCalled();
  });

  it('queries bucket with prefix "pending/"', async () => {
    mockBucket.getFiles.mockResolvedValue([[]]);

    await service.cleanPendingCovers();

    expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: 'pending/' });
  });

  it('handles an empty pending/ folder gracefully', async () => {
    mockBucket.getFiles.mockResolvedValue([[]]);

    await expect(service.cleanPendingCovers()).resolves.toBeUndefined();
  });

  describe('deleteFilesByUrls', () => {
    it('deletes the file at the path parsed from a Firebase SDK download URL', async () => {
      const file = makeDeletableFile();
      mockBucket.file.mockReturnValue(file);
      const url =
        'https://firebasestorage.googleapis.com/v0/b/rideglory-test.appspot.com/o/vehicles%2Fabc.jpg?alt=media&token=xyz';

      await service.deleteFilesByUrls([url]);

      expect(mockBucket.file).toHaveBeenCalledWith('vehicles/abc.jpg');
      expect(file.delete).toHaveBeenCalledTimes(1);
    });

    it('deletes the file at the path parsed from the public storage.googleapis.com URL format', async () => {
      const file = makeDeletableFile();
      mockBucket.file.mockReturnValue(file);
      const url = 'https://storage.googleapis.com/rideglory-test.appspot.com/pending/user-1/draft.png';

      await service.deleteFilesByUrls([url]);

      expect(mockBucket.file).toHaveBeenCalledWith('pending/user-1/draft.png');
      expect(file.delete).toHaveBeenCalledTimes(1);
    });

    it('does nothing on an empty list', async () => {
      await service.deleteFilesByUrls([]);

      expect(mockBucket.file).not.toHaveBeenCalled();
    });

    it('filters out null/undefined/empty entries before processing', async () => {
      const file = makeDeletableFile();
      mockBucket.file.mockReturnValue(file);
      const url =
        'https://firebasestorage.googleapis.com/v0/b/rideglory-test.appspot.com/o/vehicles%2Fabc.jpg?alt=media';

      await service.deleteFilesByUrls([null, undefined, '', url]);

      expect(mockBucket.file).toHaveBeenCalledTimes(1);
      expect(file.delete).toHaveBeenCalledTimes(1);
    });

    it('continues the batch when one file fails to delete (object missing / corrupt)', async () => {
      const failing = { delete: jest.fn().mockRejectedValue(new Error('object not found')) };
      const succeeding = makeDeletableFile();
      mockBucket.file
        .mockReturnValueOnce(failing)
        .mockReturnValueOnce(succeeding);

      const urlA =
        'https://firebasestorage.googleapis.com/v0/b/rideglory-test.appspot.com/o/vehicles%2Fmissing.jpg?alt=media';
      const urlB =
        'https://firebasestorage.googleapis.com/v0/b/rideglory-test.appspot.com/o/vehicles%2Fok.jpg?alt=media';

      await expect(service.deleteFilesByUrls([urlA, urlB])).resolves.toBeUndefined();

      expect(failing.delete).toHaveBeenCalledTimes(1);
      expect(succeeding.delete).toHaveBeenCalledTimes(1);
    });

    it('skips a URL whose storage path cannot be parsed without throwing', async () => {
      await expect(
        service.deleteFilesByUrls(['not-a-valid-storage-url']),
      ).resolves.toBeUndefined();

      expect(mockBucket.file).not.toHaveBeenCalled();
    });
  });
});
