import { StorageService } from './storage.service';

// Mock firebase-admin/app and firebase-admin/storage
const mockFile = {
  save: jest.fn(),
  makePublic: jest.fn(),
};
const mockBucket = {
  name: 'my-project.appspot.com',
  file: jest.fn().mockReturnValue(mockFile),
};
const mockGetStorage = jest.fn().mockReturnValue({ bucket: () => mockBucket });
const mockGetApps = jest.fn().mockReturnValue([{}]);

jest.mock('firebase-admin/storage', () => ({
  getStorage: (...args: unknown[]) => mockGetStorage(...args),
}));

jest.mock('firebase-admin/app', () => ({
  getApps: () => mockGetApps(),
}));

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBucket.file.mockReturnValue(mockFile);
    service = new StorageService();
  });

  it('stores the file at pending/{userId}/{draftId}.{ext}', async () => {
    mockFile.save.mockResolvedValue(undefined);
    mockFile.makePublic.mockResolvedValue(undefined);

    await service.uploadCover('user-abc', 'draft-uuid', Buffer.from('data'), 'image/jpeg');

    expect(mockBucket.file).toHaveBeenCalledWith('pending/user-abc/draft-uuid.jpg');
  });

  it('calls save with correct contentType', async () => {
    mockFile.save.mockResolvedValue(undefined);
    mockFile.makePublic.mockResolvedValue(undefined);

    await service.uploadCover('user-abc', 'draft-uuid', Buffer.from('data'), 'image/png');

    expect(mockFile.save).toHaveBeenCalledWith(expect.any(Buffer), { contentType: 'image/png' });
  });

  it('resolves extension from mimeType: image/jpeg → jpg', async () => {
    mockFile.save.mockResolvedValue(undefined);
    mockFile.makePublic.mockResolvedValue(undefined);

    await service.uploadCover('u', 'd', Buffer.from('x'), 'image/jpeg');

    expect(mockBucket.file).toHaveBeenCalledWith('pending/u/d.jpg');
  });

  it('resolves extension from mimeType: image/webp → webp', async () => {
    mockFile.save.mockResolvedValue(undefined);
    mockFile.makePublic.mockResolvedValue(undefined);

    await service.uploadCover('u', 'd', Buffer.from('x'), 'image/webp');

    expect(mockBucket.file).toHaveBeenCalledWith('pending/u/d.webp');
  });

  it('defaults to png extension for unknown mimeType', async () => {
    mockFile.save.mockResolvedValue(undefined);
    mockFile.makePublic.mockResolvedValue(undefined);

    await service.uploadCover('u', 'd', Buffer.from('x'), 'image/gif');

    expect(mockBucket.file).toHaveBeenCalledWith('pending/u/d.png');
  });

  it('returns the correct public URL', async () => {
    mockFile.save.mockResolvedValue(undefined);
    mockFile.makePublic.mockResolvedValue(undefined);

    const url = await service.uploadCover('user-abc', 'draft-uuid', Buffer.from('data'), 'image/png');

    expect(url).toBe('https://storage.googleapis.com/my-project.appspot.com/pending/user-abc/draft-uuid.png');
  });

  it('propagates errors from file.save', async () => {
    mockFile.save.mockRejectedValue(new Error('permission denied'));

    await expect(
      service.uploadCover('u', 'd', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow('permission denied');
  });
});
