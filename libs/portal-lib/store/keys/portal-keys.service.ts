import { Injectable, NotFoundException } from '@nestjs/common';
import { PortalRepository } from '../portal.repository';
import { PortalKeyCryptoService } from './portal-key-crypto.service';
import {
    PORTAL_KEY_NAMES,
    PortalKeyName,
    PortalKeysRecord,
} from './portal-key.const';

/**
 * CRUD ключей интеграций портала.
 *
 * Инварианты:
 * - в БД ключи лежат ТОЛЬКО в зашифрованном виде ({@link set} шифрует);
 * - наружу отдаются расшифрованными ({@link get}/{@link getAll});
 * - значение, которое не удалось расшифровать (повреждено / сменился
 *   секрет), возвращается как `null`, а не роняет ответ.
 */
@Injectable()
export class PortalKeysService {
    constructor(
        private readonly portalRepository: PortalRepository,
        private readonly crypto: PortalKeyCryptoService,
    ) {}

    /** Все ключи портала в расшифрованном виде. */
    async getAll(portalId: number): Promise<PortalKeysRecord> {
        const stored = await this.requireKeys(portalId);
        const result = {} as PortalKeysRecord;
        for (const name of PORTAL_KEY_NAMES) {
            result[name] = this.safeDecrypt(stored[name]);
        }
        return result;
    }

    /** Один ключ портала в расшифрованном виде (или `null`, если не задан). */
    async get(portalId: number, key: PortalKeyName): Promise<string | null> {
        const stored = await this.requireKeys(portalId);
        return this.safeDecrypt(stored[key]);
    }

    /** Задаёт/обновляет ключ: значение шифруется перед записью. */
    async set(
        portalId: number,
        key: PortalKeyName,
        value: string,
    ): Promise<void> {
        await this.requireKeys(portalId);
        await this.portalRepository.updateKey(
            portalId,
            key,
            this.crypto.encrypt(value),
        );
    }

    /** Очищает ключ (записывает `null`). */
    async delete(portalId: number, key: PortalKeyName): Promise<void> {
        await this.requireKeys(portalId);
        await this.portalRepository.updateKey(portalId, key, null);
    }

    private async requireKeys(portalId: number): Promise<PortalKeysRecord> {
        const stored = await this.portalRepository.findKeysById(portalId);
        if (!stored) {
            throw new NotFoundException(`Портал с id=${portalId} не найден`);
        }
        return stored;
    }

    private safeDecrypt(value: string | null): string | null {
        if (!value) return null;
        try {
            return this.crypto.decrypt(value);
        } catch {
            return null;
        }
    }
}
