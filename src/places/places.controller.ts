import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { PlacesService } from './places.service';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('autocomplete')
  autocomplete(
    @Query('q') query: string,
    @Query('type') type = 'establishment',
  ) {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
      throw new BadRequestException('Query parameter "q" is required.');
    }
    if (type !== 'cities' && type !== 'establishment') {
      throw new BadRequestException(
        'Query parameter "type" must be either "cities" or "establishment".',
      );
    }

    return this.placesService.autocomplete(trimmedQuery, type as 'cities' | 'establishment');
  }

  @Get('details')
  details(@Query('placeId') placeId: string) {
    const trimmed = placeId?.trim();
    if (!trimmed) {
      throw new BadRequestException('Query parameter "placeId" is required.');
    }
    return this.placesService.getDetails(trimmed);
  }

  @Get('geocode')
  geocode(@Query('q') query: string) {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
      throw new BadRequestException('Query parameter "q" is required.');
    }
    return this.placesService.geocode(trimmedQuery);
  }
}
