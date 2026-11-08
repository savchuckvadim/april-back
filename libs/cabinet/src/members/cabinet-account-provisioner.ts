import { ConflictException, Injectable } from '@nestjs/common';
import { User } from 'generated/prisma';
import { CabinetUserRepository } from '../persistence/cabinet-user.repository';

export interface ProvisionAccountInput {
    email: string;
    firstName: string;
    lastName: string;
    /** Организация портала; null — портал ещё не привязан к клиенту. */
    clientId: bigint | null;
    bitrixUserId?: string;
}

/**
 * Учётка под email: найти существующую или завести новую.
 *
 * Главное правило — email не уводит человека из чужой организации:
 * учётка, уже принадлежащая другому клиенту, не переиспользуется (409).
 * Учётка без организации получает организацию портала.
 */
@Injectable()
export class CabinetAccountProvisioner {
    constructor(private readonly users: CabinetUserRepository) {}

    async ensure(
        input: ProvisionAccountInput,
    ): Promise<{ user: User; isNew: boolean }> {
        const existing = await this.users.findByEmail(input.email);
        if (!existing) {
            const user = await this.users.create(input);
            return { user, isNew: true };
        }
        return {
            user: await this.adopt(existing, input.clientId),
            isNew: false,
        };
    }

    /**
     * Учётка переходит в организацию портала: своя — без изменений, без
     * организации — получает её, чужая — 409.
     */
    async adopt(user: User, clientId: bigint | null): Promise<User> {
        if (
            user.client_id !== null &&
            clientId !== null &&
            user.client_id !== clientId
        ) {
            throw new ConflictException(
                'Этот email уже используется учётной записью другой организации — укажите другой адрес',
            );
        }
        if (user.client_id === null && clientId !== null) {
            return this.users.setClient(user.id, clientId);
        }
        return user;
    }
}
