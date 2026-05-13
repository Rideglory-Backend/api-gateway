import { Test, TestingModule } from '@nestjs/testing';
import {
  ServiceUnavailableException,
  BadRequestException,
  ValidationPipe,
  INestApplication,
} from '@nestjs/common';
import { EventsController } from './events.controller';
import { ClaudeService } from '../common/claude.service';
import { UnsplashService } from '../common/unsplash.service';
import { GenerateCoverDto } from './dto/generate-cover.dto';
import { ClientProxy } from '@nestjs/microservices';
import { EVENTS_SERVICE, USERS_SERVICE } from '../config/services';
import axios from 'axios';

const mockEventsService: Partial<ClientProxy> = {};
const mockUsersService: Partial<ClientProxy> = {};

const mockClaudeService = {
  generateSearchQuery: jest.fn(),
};

const mockUnsplashService = {
  searchPhoto: jest.fn(),
};

describe('EventsController — generateCover', () => {
  let controller: EventsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EVENTS_SERVICE, useValue: mockEventsService },
        { provide: USERS_SERVICE, useValue: mockUsersService },
        { provide: ClaudeService, useValue: mockClaudeService },
        { provide: UnsplashService, useValue: mockUnsplashService },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  describe('happy path', () => {
    it('returns 200 with imageUrl, source, and query', async () => {
      const query = 'motorcycle mountain road';
      const imageUrl = 'https://images.unsplash.com/photo-test';

      mockClaudeService.generateSearchQuery.mockResolvedValue(query);
      mockUnsplashService.searchPhoto.mockResolvedValue(imageUrl);

      const dto: GenerateCoverDto = {
        title: 'Ruta de los Andes',
        eventType: 'ride',
        city: 'Medellín',
      };

      const result = await controller.generateCover(dto);

      expect(result).toEqual({ imageUrl, source: 'unsplash', query });
      expect(mockClaudeService.generateSearchQuery).toHaveBeenCalledWith(
        dto.title,
        dto.eventType,
        dto.city,
      );
      expect(mockUnsplashService.searchPhoto).toHaveBeenCalledWith(query);
    });
  });

  describe('Claude SDK throws', () => {
    it('propagates ServiceUnavailableException (503)', async () => {
      mockClaudeService.generateSearchQuery.mockRejectedValue(
        new ServiceUnavailableException(
          'Claude service is currently unavailable',
        ),
      );

      const dto: GenerateCoverDto = {
        title: 'Ruta de los Andes',
        eventType: 'ride',
        city: 'Medellín',
      };

      await expect(controller.generateCover(dto)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('Unsplash axios throws', () => {
    it('propagates ServiceUnavailableException (503)', async () => {
      mockClaudeService.generateSearchQuery.mockResolvedValue(
        'motorcycle mountains',
      );
      mockUnsplashService.searchPhoto.mockRejectedValue(
        new ServiceUnavailableException(
          'Unsplash service is currently unavailable',
        ),
      );

      const dto: GenerateCoverDto = {
        title: 'Ruta de los Andes',
        eventType: 'ride',
        city: 'Medellín',
      };

      await expect(controller.generateCover(dto)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('Unsplash 15s timeout exceeded', () => {
    it('propagates ServiceUnavailableException (503) on timeout', async () => {
      mockClaudeService.generateSearchQuery.mockResolvedValue(
        'motorcycle mountain road',
      );
      const timeoutError = new ServiceUnavailableException(
        'Unsplash service is currently unavailable',
      );
      // Simulate axios timeout by rejecting with ServiceUnavailableException
      mockUnsplashService.searchPhoto.mockRejectedValue(timeoutError);

      const dto: GenerateCoverDto = {
        title: 'Ruta de los Andes',
        eventType: 'ride',
        city: 'Medellín',
      };

      await expect(controller.generateCover(dto)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});

describe('GenerateCoverDto — validation', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const mockModule: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EVENTS_SERVICE, useValue: mockEventsService },
        { provide: USERS_SERVICE, useValue: mockUsersService },
        { provide: ClaudeService, useValue: mockClaudeService },
        { provide: UnsplashService, useValue: mockUnsplashService },
      ],
    }).compile();

    app = mockModule.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('throws BadRequestException when title is missing', async () => {
    // Validate the DTO directly using ValidationPipe
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const dto = { eventType: 'ride', city: 'Medellín' };

    await expect(
      pipe.transform(dto, { type: 'body', metatype: GenerateCoverDto }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when eventType is missing', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const dto = { title: 'Ruta de los Andes', city: 'Medellín' };

    await expect(
      pipe.transform(dto, { type: 'body', metatype: GenerateCoverDto }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when city is missing', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const dto = { title: 'Ruta de los Andes', eventType: 'ride' };

    await expect(
      pipe.transform(dto, { type: 'body', metatype: GenerateCoverDto }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ClaudeService — unit', () => {
  it('throws ServiceUnavailableException when Anthropic SDK throws', async () => {
    const service = new ClaudeService();

    (service as unknown as Record<string, unknown>).client = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('Anthropic SDK error')),
      },
    };

    await expect(
      service.generateSearchQuery('Ruta de los Andes', 'ride', 'Medellín'),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('UnsplashService — unit', () => {
  it('throws ServiceUnavailableException when axios throws', async () => {
    const service = new UnsplashService();
    const getSpy = jest
      .spyOn(axios, 'get')
      .mockRejectedValue(new Error('Network error'));

    await expect(service.searchPhoto('motorcycle mountains')).rejects.toThrow(
      ServiceUnavailableException,
    );

    getSpy.mockRestore();
  });

  it('throws ServiceUnavailableException when results array is empty', async () => {
    const service = new UnsplashService();
    const getSpy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { results: [] },
    });

    await expect(service.searchPhoto('motorcycle mountains')).rejects.toThrow(
      ServiceUnavailableException,
    );

    getSpy.mockRestore();
  });
});
