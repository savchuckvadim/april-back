import { Injectable, Logger } from '@nestjs/common';
import { maskedJson } from '../lib/mask-payload.util';
import {
    InstallStatus,
    MarketplaceInstallRepository,
} from '../persistence/marketplace-install.repository';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';

/**
 * События жизненного цикла приложения (регистрируются в event.bind
 * при установке): ONAPPUNINSTALL / ONAPPUPDATE / ONAPPPAYMENT.
 *
 * Подлинность: сверка auth[application_token] с сохранённым (расшифровка
 * на нашей стороне). Для ONAPPUNINSTALL это ЕДИНСТВЕННЫЙ способ проверки —
 * токены доступа уже отозваны, REST недоступен.
 */

interface LifecycleEventPayload {
    event?: string;
    memberId?: string;
    domain?: string;
    applicationToken?: string;
    version?: string;
    scope?: string;
    clean?: string;
}

export interface LifecycleEventResult {
    status: 'processed' | 'rejected' | 'ignored' | 'error';
    event?: string;
    message?: string;
}

function str(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Разбор события: auth может прийти вложенным объектом или плоскими ключами */
export function parseLifecycleEvent(
    body: Record<string, unknown> | undefined,
): LifecycleEventPayload {
    const auth =
        body?.auth && typeof body.auth === 'object'
            ? (body.auth as Record<string, unknown>)
            : undefined;
    const data =
        body?.data && typeof body.data === 'object'
            ? (body.data as Record<string, unknown>)
            : undefined;

    return {
        event: str(body?.event)?.toUpperCase(),
        memberId: str(auth?.member_id) ?? str(body?.['auth[member_id]']),
        domain: str(auth?.domain) ?? str(body?.['auth[domain]']),
        applicationToken:
            str(auth?.application_token) ??
            str(body?.['auth[application_token]']),
        version: str(data?.VERSION),
        scope: str(auth?.scope),
        clean: str(data?.CLEAN),
    };
}

@Injectable()
export class MarketplaceLifecycleService {
    private readonly logger = new Logger(MarketplaceLifecycleService.name);
    private readonly appCode = BITRIX_APP_CODES.GARANT as string;

    constructor(private readonly repository: MarketplaceInstallRepository) {}

    async handleEvent(
        body: Record<string, unknown> | undefined,
    ): Promise<LifecycleEventResult> {
        const payload = parseLifecycleEvent(body);
        const eventName = payload.event ?? 'UNKNOWN';

        await this.repository.logEvent({
            memberId: payload.memberId,
            domain: payload.domain,
            event: eventName,
            status: 'received',
            payload: maskedJson(body),
        });

        if (!payload.memberId) {
            return this.reject(payload, eventName, 'member_id отсутствует');
        }

        const install = await this.repository.findInstallByMemberId(
            payload.memberId,
            this.appCode,
        );
        if (!install) {
            return this.reject(payload, eventName, 'установка не найдена');
        }

        // Guard подлинности: сверка application_token
        const stored = this.repository.getApplicationToken(install);
        if (
            !stored ||
            !payload.applicationToken ||
            stored !== payload.applicationToken
        ) {
            return this.reject(
                payload,
                eventName,
                'application_token не совпадает',
            );
        }

        try {
            switch (eventName) {
                case 'ONAPPUNINSTALL':
                    // REST недоступен (токены отозваны) — только своя БД.
                    // CLEAN=1 (удалить данные) — пока журналируем, чистку
                    // данных портала решает вендор (план, этап 6.4).
                    await this.repository.markUninstalled(install.id);
                    await this.repository.updateInstallStatus(
                        install.id,
                        InstallStatus.PENDING,
                    );
                    this.logger.log(
                        `ONAPPUNINSTALL: member_id=${payload.memberId} clean=${payload.clean ?? '-'}`,
                    );
                    break;
                case 'ONAPPUPDATE':
                    // Новая версия: scope и НОВЫЙ application_token
                    await this.repository.applyUpdate(install.id, {
                        version: payload.version,
                        scope: payload.scope,
                        applicationToken: payload.applicationToken,
                    });
                    this.logger.log(
                        `ONAPPUPDATE: member_id=${payload.memberId} version=${payload.version ?? '-'}`,
                    );
                    break;
                case 'ONAPPPAYMENT':
                    // Смена лицензии Маркета; актуализация полей — через
                    // app.info (LicenseService, следующий этап). Пока журнал.
                    this.logger.log(
                        `ONAPPPAYMENT: member_id=${payload.memberId}`,
                    );
                    break;
                default:
                    await this.repository.logEvent({
                        memberId: payload.memberId,
                        domain: payload.domain,
                        event: eventName,
                        status: 'processed',
                        errorDetail: 'необработанный тип события (ignored)',
                    });
                    return { status: 'ignored', event: eventName };
            }

            await this.repository.logEvent({
                memberId: payload.memberId,
                domain: payload.domain,
                event: eventName,
                status: 'processed',
            });
            return { status: 'processed', event: eventName };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            await this.repository.logEvent({
                memberId: payload.memberId,
                domain: payload.domain,
                event: eventName,
                status: 'error',
                errorDetail: message,
            });
            this.logger.error(`Event ${eventName} failed: ${message}`);
            return { status: 'error', event: eventName, message };
        }
    }

    private async reject(
        payload: LifecycleEventPayload,
        eventName: string,
        reason: string,
    ): Promise<LifecycleEventResult> {
        await this.repository.logEvent({
            memberId: payload.memberId,
            domain: payload.domain,
            event: eventName,
            status: 'error',
            errorDetail: `rejected: ${reason}`,
        });
        this.logger.warn(
            `Event ${eventName} rejected: ${reason} (member_id=${payload.memberId ?? '-'})`,
        );
        return { status: 'rejected', event: eventName, message: reason };
    }
}
