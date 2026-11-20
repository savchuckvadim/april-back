import { ForbiddenException, Injectable } from '@nestjs/common';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import {
    DEAL_MOVEMENT_ROLES,
    DEAL_MOVEMENT_TEXTS,
} from './deal-movement-vitrina.const';

/** Руководитель по структуре или суперпользователь вендора. */
export const isDealMovementLeader = (access: RequesterAccess): boolean =>
    (DEAL_MOVEMENT_ROLES as readonly string[]).includes(access.role) ||
    access.isSuperUser === true;

/**
 * Права раздела «Движение сделок»: руководителям (cup / op / group по
 * структуре отделов) и суперпользователю — их периметр; менеджеру — только
 * при включённой настройке «Менеджер видит свою аналитику», и тогда только
 * свои сделки и звонки; иначе 403 «Раздел доступен руководителям».
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class DealMovementAccessService {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly settings: SettingsLoader,
    ) {}

    async resolve(
        domain: string,
        requesterUserId: string,
    ): Promise<RequesterAccess> {
        const access = await this.access.resolve(domain, requesterUserId);
        if (isDealMovementLeader(access)) return access;
        const { selfViewEnabled } = await this.settings.load(domain);
        if (!selfViewEnabled) {
            throw new ForbiddenException(DEAL_MOVEMENT_TEXTS.leadersOnly);
        }
        return access;
    }
}
