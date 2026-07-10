import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { catchError, firstValueFrom, timeout } from 'rxjs';
import { MAINTENANCES_SERVICE, USERS_SERVICE, VEHICLES_SERVICE } from '../config/services';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { StorageCleanupService } from '../ai/storage-cleanup.service';

interface HardDeleteAllByOwnerResult {
  deletedVehicleCount: number;
  imageUrls: string[];
}

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    @Inject(VEHICLES_SERVICE) private readonly vehiclesService: ClientProxy,
    @Inject(MAINTENANCES_SERVICE) private readonly maintenancesService: ClientProxy,
    private readonly storageCleanupService: StorageCleanupService,
    private readonly firebaseAuthService: FirebaseAuthService,
  ) {}

  /**
   * Orquesta la eliminación de cuenta en 6 pasos fijos, en este orden exacto:
   * 1. Resolver el usuario interno a partir del email del token.
   * 2. Hard-delete de vehículos + SOAT + RTM del owner (vehicles-ms), capturando
   *    las URLs de las imágenes asociadas.
   * 3. Limpieza best-effort de las imágenes en Firebase Storage — un fallo aquí
   *    se loguea y NO aborta el flujo.
   * 4. Soft-delete de todos los mantenimientos del usuario (maintenances-ms).
   * 5. Hard-delete del usuario en users-ms.
   * 6. Eliminar el usuario en Firebase Auth — siempre el último paso. Si algún
   *    paso previo (2, 4 o 5) falla, los pasos siguientes nunca se ejecutan.
   */
  async deleteAccount(uid: string, email: string): Promise<void> {
    const user = await firstValueFrom(
      this.usersService.send<{ id: string }>('findUserByEmail', { email }),
    );

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
      this.usersService.send('hardDeleteUser', { id: user.id }),
    );

    await this.firebaseAuthService.deleteUser(uid);
  }
}
