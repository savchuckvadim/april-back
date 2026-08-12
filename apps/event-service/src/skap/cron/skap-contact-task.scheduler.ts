import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import { IBXContact } from '@/modules/bitrix';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { SKAP_CONTACT_SOURCE_PREFIX } from '@lib/portal-lib/pbx/pbx-skap-smart';
import {
    buildSkapContactTaskKey,
    SKAP_CONTACT_TASK_CHUNK,
    SKAP_CONTACT_TASK_LOCK_KEY,
} from '@lib/skap-lib';

const LOCK_TTL_SEC = 30 * 60;
/** Первый прогон без метки смотрит на неделю назад. */
const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface CreatedContactRow {
    id: number;
    name: string;
    companyId: number | null;
    assignedById: number;
}

/**
 * Еженедельные сводные задачи по автосозданным контактам СКАП
 * (решение 2026-08-12: задачи на каждый контакт — лавина; вместо этого
 * раз в неделю одна задача на каждые {@link SKAP_CONTACT_TASK_CHUNK}
 * контактов, сгруппированных по ответственному).
 *
 * Контакты находятся в Bitrix по DATE_CREATE после метки прошлого прогона
 * и префиксу SOURCE_DESCRIPTION «Создан импортом СКАП» — своя таблица не
 * нужна, окно двигается Redis-меткой per-домен.
 */
@Injectable()
export class SkapContactTaskScheduler {
    private readonly logger = new Logger(SkapContactTaskScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly settingsService: PortalAppSettingsService,
        private readonly pbxService: PBXService,
    ) {}

    /** Понедельник 09:00 МСК — к началу рабочей недели. */
    @Cron('0 9 * * 1', {
        name: 'skap-contact-tasks',
        timeZone: 'Europe/Moscow',
    })
    async tick(): Promise<void> {
        const redis = this.redisService.getClient();
        const locked = await redis.set(
            SKAP_CONTACT_TASK_LOCK_KEY,
            String(process.pid),
            'EX',
            LOCK_TTL_SEC,
            'NX',
        );
        if (!locked) return;
        try {
            const records = await this.settingsService.listByAppCode(
                EnumPortalAppCode.skap,
            );
            for (const record of records) {
                try {
                    await this.processDomain(record.domain);
                } catch (error) {
                    this.logger.error(
                        `Сводные задачи СКАП по ${record.domain} упали: ${(error as Error).message}`,
                        { telegram: true, domain: record.domain },
                    );
                }
            }
        } finally {
            await redis.del(SKAP_CONTACT_TASK_LOCK_KEY).catch(() => undefined);
        }
    }

    private async processDomain(domain: string): Promise<void> {
        const settings = await this.settingsService.resolve(
            domain,
            EnumPortalAppCode.skap,
        );
        if (!settings.enabled) return;

        const redis = this.redisService.getClient();
        const markerKey = buildSkapContactTaskKey(domain);
        const rawMarker = await redis.get(markerKey).catch(() => null);
        const since = new Date(
            rawMarker && Number.isFinite(Number(rawMarker))
                ? Number(rawMarker)
                : Date.now() - DEFAULT_WINDOW_MS,
        );
        const now = Date.now();

        const { bitrix } = await this.pbxService.init(domain);
        const contacts = await bitrix.contact.all(
            {
                '>DATE_CREATE': since.toISOString(),
                '%SOURCE_DESCRIPTION': SKAP_CONTACT_SOURCE_PREFIX,
            } as unknown as Partial<IBXContact>,
            ['ID', 'NAME', 'COMPANY_ID', 'ASSIGNED_BY_ID', 'DATE_CREATE'],
        );

        const rows: CreatedContactRow[] = contacts
            .map(contact => {
                const raw = contact as unknown as Record<string, unknown>;
                return {
                    id: Number(raw.ID),
                    name: typeof raw.NAME === 'string' ? raw.NAME : '',
                    companyId: raw.COMPANY_ID ? Number(raw.COMPANY_ID) : null,
                    assignedById: Number(raw.ASSIGNED_BY_ID ?? 0),
                };
            })
            .filter(row => row.id > 0 && row.assignedById > 0);

        if (!rows.length) {
            await redis.set(markerKey, String(now)).catch(() => undefined);
            return;
        }

        // Группировка по ответственному → чанки по 30 → одна задача на чанк.
        const byAssignee = new Map<number, CreatedContactRow[]>();
        for (const row of rows) {
            const list = byAssignee.get(row.assignedById) ?? [];
            list.push(row);
            byAssignee.set(row.assignedById, list);
        }

        let tasksCreated = 0;
        for (const [assigneeId, list] of byAssignee) {
            for (let i = 0; i < list.length; i += SKAP_CONTACT_TASK_CHUNK) {
                const chunk = list.slice(i, i + SKAP_CONTACT_TASK_CHUNK);
                await bitrix.task
                    .add({
                        TITLE: `СКАП: проверьте созданные контакты (${chunk.length} шт)`,
                        DESCRIPTION:
                            'Контакты созданы автоматически из выгрузок СКАП ' +
                            'за прошедший период. Заполните ФИО/должность или ' +
                            'смерджите с существующими — ключ «СКАП-логины» ' +
                            'переживёт объединение.\n\n' +
                            chunk
                                .map(
                                    (row, index) =>
                                        `${index + 1}. ${row.name} (контакт #${row.id}` +
                                        (row.companyId
                                            ? `, компания #${row.companyId}`
                                            : '') +
                                        ')',
                                )
                                .join('\n'),
                        RESPONSIBLE_ID: assigneeId,
                        UF_CRM_TASK: chunk.map(row => `C_${row.id}`),
                    })
                    .catch((error: Error) =>
                        this.logger.warn(
                            `Сводная задача СКАП не создана (${domain}, user ${assigneeId}): ${error.message}`,
                        ),
                    );
                tasksCreated += 1;
            }
        }

        await redis.set(markerKey, String(now)).catch(() => undefined);
        this.logger.log(
            `Сводные задачи СКАП (${domain}): контактов ${rows.length}, задач ${tasksCreated}`,
        );
    }
}
