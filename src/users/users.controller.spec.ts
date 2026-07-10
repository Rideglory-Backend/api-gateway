import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { AccountDeletionService } from './account-deletion.service';
import { USERS_SERVICE } from '../config/services';

const mockUsersService = { send: jest.fn() };
const mockAccountDeletionService = { deleteAccount: jest.fn() };

describe('UsersController.deleteMe', () => {
  let controller: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: USERS_SERVICE, useValue: mockUsersService },
        { provide: AccountDeletionService, useValue: mockAccountDeletionService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('returns 204 (void) and delegates to AccountDeletionService with uid/email from the token', async () => {
    mockAccountDeletionService.deleteAccount.mockResolvedValue(undefined);
    const request = { user: { uid: 'uid-123', email: 'rider@example.com' } } as any;

    const result = await controller.deleteMe(request);

    expect(result).toBeUndefined();
    expect(mockAccountDeletionService.deleteAccount).toHaveBeenCalledWith(
      'uid-123',
      'rider@example.com',
    );
  });

  it('never reads uid/email from params or body — only from request.user', async () => {
    mockAccountDeletionService.deleteAccount.mockResolvedValue(undefined);
    const request = {
      user: { uid: 'uid-from-token', email: 'token@example.com' },
      params: { uid: 'uid-from-params', email: 'params@example.com' },
      body: { uid: 'uid-from-body', email: 'body@example.com' },
    } as any;

    await controller.deleteMe(request);

    expect(mockAccountDeletionService.deleteAccount).toHaveBeenCalledWith(
      'uid-from-token',
      'token@example.com',
    );
  });

  it('throws UnauthorizedException when the token has no uid/email', async () => {
    const request = { user: undefined } as any;

    await expect(controller.deleteMe(request)).rejects.toThrow(UnauthorizedException);
    expect(mockAccountDeletionService.deleteAccount).not.toHaveBeenCalled();
  });

  it('propagates errors thrown by AccountDeletionService', async () => {
    const failure = new Error('hard delete failed');
    mockAccountDeletionService.deleteAccount.mockRejectedValue(failure);
    const request = { user: { uid: 'uid-123', email: 'rider@example.com' } } as any;

    await expect(controller.deleteMe(request)).rejects.toThrow(failure);
  });
});
