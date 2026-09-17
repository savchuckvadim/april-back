import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { LeadRequestSlaService } from './lead-request-sla.service';
import { PortalWorkingHoursService } from '../../shared/working-hours/portal-working-hours.service';

const LOCK_KEY = 'lead-request:sla-lock';
const LOCK_TTL_SEC = 9 * 60;

/**
 * НИЖНЯЯ ГРАНИЦА ПОРОГА SLA — ЧАС.
 *
 * Авария 16–17.09.2026: на портале в поле «минут на принятие» стояло 10, то
 * есть ровно тик крона. Просроченным становилось всё, что крон только что
 * передал, и один и тот же пул сделок переназначался НА КАЖДОМ ТИКЕ: заявки
 * скакали между менеджерами каждые десять минут два дня подряд.
 *
 * Первая версия этого предохранителя поднимала только значения МЕНЬШЕ тика и
 * ровно десять пропускала как осмысленные — авария повторилась. Поэтому
 * граница теперь не «тик», а ЧАС: меньше часа на принятие заявки не имеет
 * смысла ни при каких настройках — человеку нужно время увидеть заявку и
 * взять её в работу, а крон всё равно реагирует не чаще раза в десять минут.
 *
 * Решение владельца 17.09.2026: «60 мин минимум и дефолт, всё».
 */
const SLA_MIN_MINUTES = 60;

/**
 * Планировщик SLA принятия заявок: раз в 10 минут обходит порталы, у
 * которых в настройках приложения «Звонки» включён SLA (админка →
 * карточка портала → Settings → event-sales → «SLA принятия заявок»).
 * Порог/лимит — оттуда же (PORTAL_APP_SETTINGS_SCHEMA); env-конфигурации
 * больше нет.
 *
 * Это СТРАХОВКА и reconciliation: даже если битрикс-робот-таймер стадии
 * не настроен или его вебхук не долетел (Битрикс не ретраит), cron
 * доведёт потерянные принятия и передаст непринятые заявки.
 * Паттерн — CallReportScheduler: Redis-лок от наложения тиков, ошибка
 * одного домена не роняет цикл.
 */
@Injectable()
export class LeadRequestSlaScheduler implements OnModuleInit {
    private readonly logger = new Logger(LeadRequestSlaScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly slaService: LeadRequestSlaService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly workingHours: PortalWorkingHoursService,
    ) {}

    onModuleInit(): void {
        this.logger.log(
            'SLA принятия заявок: конфигурация — ТОЛЬКО портальные настройки ' +
                '(админка → портал → Settings → event-sales); env-настроек нет. ' +
                'Включённые порталы читаются на каждом тике (раз в 10 минут).',
        );
    }

    @Cron(CronExpression.EVERY_10_MINUTES)
    async tick(): Promise<void> {
        const domains = await this.resolveEnabledDomains();
        if (!domains.length) return;

        const redis = this.redisService.getClient();
        const locked = await redis.set(
            LOCK_KEY,
            String(process.pid),
            'EX',
            LOCK_TTL_SEC,
            'NX',
        );
        if (!locked) {
            this.logger.warn('Предыдущий SLA-тик ещё выполняется — пропуск');
            return;
        }

        try {
            for (const domain of domains) {
                try {
                    // Настройки перечитываются на домен: между ростером и
                    // проходом админ мог выключить портал/поменять порог.
                    const settings = await this.appSettings.resolve(
                        domain,
                        EnumPortalAppCode.eventSales,
                    );
                    if (!settings.leadIntakeSlaEnabled) continue;
                    /*
                     * Передача непринятой заявки — это назначение работы
                     * ЖИВОМУ человеку и уведомление ему же. Ночью и в
                     * выходные такая передача только прогоняет заявку по
                     * кругу менеджеров, которые её всё равно не видят.
                     *
                     * Заявка не потеряется: срок считается от
                     * `op_lead_assigned_at`, она остаётся просроченной и
                     * будет передана первым тиком рабочего дня.
                     *
                     * ОТДЕЛЬНО СТОИТ ЗНАТЬ: сам срок SLA измеряется
                     * КАЛЕНДАРНЫМИ минутами (см. buildOverdueFilter).
                     * Заявка, назначенная в 17:55 при пороге 30 минут,
                     * утром понедельника будет просрочена, хотя рабочего
                     * времени у менеджера было пять минут.
                     */
                    if (!(await this.workingHours.isWorkingTime(domain))) {
                        continue;
                    }

                    const minutes = this.safeMinutes(
                        domain,
                        settings.leadIntakeSlaMinutes,
                    );
                    const run = await this.slaService.runForDomain(
                        domain,
                        minutes,
                        settings.leadIntakeSlaMaxPerRun,
                        settings.leadIntakeSlaMaxTransfers,
                    );
                    if (run.warnings.length) {
                        this.logger.warn(
                            `[sla] ${domain}: ${run.warnings.join('; ')}`,
                        );
                    }
                } catch (error) {
                    this.logger.error(
                        `SLA-проход ${domain} упал: ${(error as Error).message}`,
                        { telegram: true, domain },
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
    }

    /**
     * Порог не ниже часа: см. {@link SLA_MIN_MINUTES}. Меньшее значение —
     * ошибка настройки, а не осознанный выбор, и стоит она каруселью.
     */
    private safeMinutes(domain: string, configured: number): number {
        if (configured >= SLA_MIN_MINUTES) return configured;
        this.logger.warn(
            `[sla] ${domain}: порог ${configured} мин меньше минимального ` +
                `(${SLA_MIN_MINUTES} мин) — поднят до ${SLA_MIN_MINUTES}. ` +
                'Порог меньше часа гонял бы заявки между менеджерами.',
        );
        return SLA_MIN_MINUTES;
    }

    /** Домены с включённым SLA; недоступность БД → пустой список (no-op). */
    private async resolveEnabledDomains(): Promise<string[]> {
        try {
            const rows = await this.appSettings.listByAppCode(
                EnumPortalAppCode.eventSales,
            );
            const enabledKey =
                PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales]
                    .leadIntakeSlaEnabled.code;
            return rows
                .filter(row => row.settings[enabledKey] === true)
                .map(row => row.domain);
        } catch (error) {
            this.logger.error(
                `Порталы из portal_app_settings не прочитаны: ${(error as Error).message} — тик пропущен`,
                { telegram: true },
            );
            return [];
        }
    }
}
