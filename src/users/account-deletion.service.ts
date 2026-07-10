import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { USERS_SERVICE } from '../config/services';
import { FirebaseAuthService } from '../auth/firebase-auth.service';

@Injectable()
export class AccountDeletionService {
  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    private readonly firebaseAuthService: FirebaseAuthService,
  ) {}

  /**
   * Orquesta la eliminación de cuenta en 5 pasos fijos, en este orden exacto:
   * 1. Resolver el usuario interno a partir del email del token.
   * 2. TODO fase 2 — no-op explícito.
   * 3. TODO fase 3 — no-op explícito.
   * 4. Hard-delete del usuario en users-ms.
   * 5. Eliminar el usuario en Firebase Auth — siempre el último paso. Si el
   *    paso 4 falla, este paso nunca se ejecuta.
   */
  async deleteAccount(uid: string, email: string): Promise<void> {
    const user = await firstValueFrom(
      this.usersService.send<{ id: string }>('findUserByEmail', { email }),
    );

    // TODO fase 2

    // TODO fase 3

    await firstValueFrom(
      this.usersService.send('hardDeleteUser', { id: user.id }),
    );

    await this.firebaseAuthService.deleteUser(uid);
  }
}
