import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    BX_SUPER_USER_IDS_ENV,
    isSuperUserId,
    parseSuperUserIds,
    SuperUserMap,
} from '../lib/super-user.util';

/**
 * Суперпользователь вендора (сотрудник April) по env `BX_SUPER_USER_IDS`
 * (`domain:id[,domain:id...]`). Список разбирается один раз при старте;
 * некорректные записи пропускаются с одним warn в лог.
 *
 * Что даёт признак — решают потребители: структура отделов отдаёт
 * суперпользователю видимость all (headOfSource = superuser), доступ
 * ai-analytics — роль cup без чтения структуры.
 */
@Injectable()
export class BxSuperUserService {
    private readonly logger = new Logger(BxSuperUserService.name);
    private readonly superUsers: SuperUserMap;

    constructor(config: ConfigService) {
        const { map, invalid } = parseSuperUserIds(
            config.get<string>(BX_SUPER_USER_IDS_ENV),
        );
        if (invalid.length > 0) {
            this.logger.warn(
                `${BX_SUPER_USER_IDS_ENV}: пропущены некорректные записи ` +
                    `[${invalid.join(', ')}] — ожидается формат domain:id[,domain:id...]`,
            );
        }
        this.superUsers = map;
    }

    /** Суперпользователь ли `userId` на портале `domain` (id ≤ 0 — нет). */
    isSuperUser(domain: string, userId: number): boolean {
        return isSuperUserId(domain, userId, this.superUsers);
    }
}
