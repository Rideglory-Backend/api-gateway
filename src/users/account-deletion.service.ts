import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { catchError, firstValueFrom, timeout } from 'rxjs';
import {
  EVENTS_SERVICE,
  MAINTENANCES_SERVICE,
  USERS_SERVICE,
  VEHICLES_SERVICE,
} from '../config/services';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { StorageCleanupService } from '../ai/storage-cleanup.service';

interface HardDeleteAllByOwnerResult {
  deletedVehicleCount: number;
  imageUrls: string[];
}

/** Estados de evento que bloquean el borrado de cuenta del organizador. */
const ACTIVE_EVENT_STATES = ['DRAFT', 'SCHEDULED', 'IN_PROGRESS'];

interface OwnedEvent {
  id: string;
  name: string;
  state: string;
}

/**
 * Duck-typing guard para el error "no encontrado" tal como cruza el
 * `ClientProxy` de NestJS microservices: llega como objeto plano
 * `{status, message}` (no como instancia de `RpcException`), replicando el
 * `{status: HttpStatus.NOT_FOUND, message}` que `users-ms` lanza en
 * `findByEmail`. Ver los `catchError` de `vehicles.controller.ts` que ya
 * acceden a `error?.status` con el mismo patrón.
 */
function isNotFoundRpcError(error: unknown): boolean {
  const candidate = error instanceof RpcException ? error.getError() : error;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'status' in candidate &&
    (candidate as { status?: unknown }).status === HttpStatus.NOT_FOUND
  );
}

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    @Inject(VEHICLES_SERVICE) private readonly vehiclesService: ClientProxy,
    @Inject(MAINTENANCES_SERVICE) private readonly maintenancesService: ClientProxy,
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
    private readonly storageCleanupService: StorageCleanupService,
    private readonly firebaseAuthService: FirebaseAuthService,
  ) {}

  /**
   * Orquesta la eliminación de cuenta en 8 pasos fijos, en este orden exacto:
   * 1. Resolver el usuario interno a partir del email del token.
   * 2. Precondición: si el usuario tiene al menos un evento como organizador
   *    en estado DRAFT/SCHEDULED/IN_PROGRESS, lanza 409
   *    ACTIVE_EVENTS_AS_ORGANIZER y NINGÚN paso posterior se ejecuta.
   * 3. Hard-delete de vehículos + SOAT + RTM del owner (vehicles-ms), capturando
   *    las URLs de las imágenes asociadas.
   * 4. Limpieza best-effort de las imágenes en Firebase Storage — un fallo aquí
   *    se loguea y NO aborta el flujo.
   * 5. Soft-delete de todos los mantenimientos del usuario (maintenances-ms).
   * 6. Anonimización permanente de las EventRegistration del usuario en
   *    events-ms (evidencia legal de consentimientos se preserva).
   * 7. Hard-delete del usuario en users-ms.
   * 8. Eliminar el usuario en Firebase Auth — siempre el último paso. Si algún
   *    paso previo (2, 3, 5, 6 o 7) falla, los pasos siguientes nunca se
   *    ejecutan.
   */
  async deleteAccount(uid: string, email: string): Promise<void> {
    let user: { id: string };
    try {
      user = await firstValueFrom(
        this.usersService.send<{ id: string }>('findUserByEmail', { email }),
      );
    } catch (error) {
      if (isNotFoundRpcError(error)) {
        // El usuario ya fue borrado por completo en una corrida previa
        // (reintento tras éxito total, o carrera con otra petición en
        // vuelo). Éxito idempotente: no hay nada más que hacer.
        this.logger.log(
          `deleteAccount: user for email already deleted, treating as idempotent success`,
        );
        return;
      }
      throw error;
    }

    await this.ensureNoActiveEventsAsOrganizer(user.id);

    const { imageUrls } = await firstValueFrom(
      this.vehiclesService
        .send<HardDeleteAllByOwnerResult>('hardDeleteAllByOwner', { ownerId: user.id })
        .pipe(
          timeout(15_000),
          catchError((error) => {
            throw new RpcException({
              message: error?.message ?? 'Failed to hard-delete owner vehicles',
              status: HttpStatus.BAD_GATEWAY,
            });
          }),
        ),
    );

    try {
      await this.storageCleanupService.deleteFilesByUrls(imageUrls);
    } catch (error) {
      this.logger.warn(`Storage cleanup failed for account deletion: ${error}`);
      // no relanzar — el borrado de cuenta continúa igual
    }

    await firstValueFrom(
      this.maintenancesService
        .send('softDeleteMaintenancesByUserId', { userId: user.id })
        .pipe(
          timeout(15_000),
          catchError((error) => {
            throw new RpcException({
              message: error?.message ?? 'Failed to soft-delete user maintenances',
              status: HttpStatus.BAD_GATEWAY,
            });
          }),
        ),
    );

    await firstValueFrom(
      this.eventsService
        .send('anonymizeRegistrationsByUserId', { userId: user.id })
        .pipe(
          timeout(15_000),
          catchError((error) => {
            throw new RpcException({
              message: error?.message ?? 'Failed to anonymize user event registrations',
              status: HttpStatus.BAD_GATEWAY,
            });
          }),
        ),
    );

    await firstValueFrom(
      this.usersService.send('hardDeleteUser', { id: user.id }),
    );

    await this.firebaseAuthService.deleteUser(uid);
  }

  private async ensureNoActiveEventsAsOrganizer(ownerId: string): Promise<void> {
    const events = await firstValueFrom(
      this.eventsService
        .send<OwnedEvent[]>('findEventsByOwnerId', { ownerId })
        .pipe(
          timeout(15_000),
          catchError((error) => {
            throw new RpcException({
              message: error?.message ?? 'Failed to check organizer events',
              status: HttpStatus.BAD_GATEWAY,
            });
          }),
        ),
    );

    const activeEvents = (events ?? []).filter((event) =>
      ACTIVE_EVENT_STATES.includes(event.state),
    );

    if (activeEvents.length > 0) {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        error: 'ACTIVE_EVENTS_AS_ORGANIZER',
        message:
          'No puedes eliminar tu cuenta mientras tengas eventos activos como organizador. Cancela o finaliza tus eventos primero.',
        activeEvents: activeEvents.map((event) => ({
          id: event.id,
          name: event.name,
          state: event.state,
        })),
      });
    }
  }
}
