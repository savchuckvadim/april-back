import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { STAGGERED_HALF_HOUR_CRON } from '../../shared/cron/staggered-crons.const';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    TmcApprovalRescueOptions,
    TmcApprovalRescueService,
} from './tmc-approval-rescue.service';
import { RPA_PRESENTATION_APPROVED_STAGE_CODE } from '../lib/rpa-presentation-fields.const';

const LOCK_KEY = 'event-sales:tmc-approval-rescue-lock';
const LOCK_TTL_SEC = 25 * 60;
/**
 * Раз в полчаса: пауза роботу измеряется десятками минут, а чаще читать
 * РПА портала незачем — утверждений за день единицы.
 */
const RESCUE_CRON = STAGGERED_HALF_HOUR_CRON.tmcApprovalRescue;

const SCHEMA = PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales];

/** Число из настройки; пусто или мусор — дефолт схемы. */
const positive = (raw: unknown, fallback: number): number => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** Коды стадий через запятую; пусто — стадия «Утверждено». */
export const parseStageCodes = (raw: unknown): string[] => {
    const codes = (typeof raw === 'string' ? raw : '')
        .split(',')
        .map(code => code.trim())
        .filter(Boolean);
    return codes.length ? codes : [RPA_PRESENTATION_APPROVED_STAGE_CODE];
};

/**
 * Планировщик подстраховки согласования заявок ТМЦ на презентацию.
 *
 * Паттерн общий с подстраховкой ХО и страховкой входа: Redis-лок от
 * наложения тиков, настройки перечитываются на домен, падение одного
 * домена не роняет цикл. Рабочее время портала НЕ проверяется:
 * утверждение — дневное действие, и догнать упавший вызов робота нужно
 * сразу, а не утром.
 */
@Injectable()
export class TmcApprovalRescueScheduler {
    private readonly logger = new Logger(TmcApprovalRescueScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly rescueService: TmcApprovalRescueService,
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    @Cron(RESCUE_CRON, { name: 'tmc-approval-rescue' })
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
            this.logger.warn(
                'Предыдущий тик подстраховки согласования заявок ещё выполняется — пропуск',
            );
            return;
        }

        try {
            for (const domain of domains) {
                try {
                    const settings = await this.appSettings.resolve(
                        domain,
                        EnumPortalAppCode.eventSales,
                    );
                    if (!settings.tmcApprovalRescueEnabled) continue;
                    const options: TmcApprovalRescueOptions = {
                        dryRun: Boolean(settings.tmcApprovalRescueDryRun),
                        stageCodes: parseStageCodes(
                            settings.tmcApprovalRescueStageCodes,
                        ),
                        lookbackHours: positive(
                            settings.tmcApprovalRescueLookbackHours,
                            SCHEMA.tmcApprovalRescueLookbackHours.default,
                        ),
                        graceMinutes: positive(
                            settings.tmcApprovalRescueGraceMinutes,
                            SCHEMA.tmcApprovalRescueGraceMinutes.default,
                        ),
                        maxPerRun: positive(
                            settings.tmcApprovalRescueMaxPerRun,
                            SCHEMA.tmcApprovalRescueMaxPerRun.default,
                        ),
                    };
                    const run = await this.rescueService.runForDomain(
                        domain,
                        options,
                    );
                    if (run.dispatched || run.dryRun || run.warnings.length) {
                        this.logger.log(
                            `[tmc-approval-rescue] ${domain}: кандидатов ${run.candidates}, ` +
                                `поставлено ${run.dispatched}, холостой ход ${run.dryRun}, ` +
                                `пропущено ${JSON.stringify(run.skipped)}`,
                        );
                    }
                    if (run.warnings.length) {
                        this.logger.warn(
                            `[tmc-approval-rescue] ${domain}: ${run.warnings.join('; ')}`,
                        );
                    }
                } catch (error) {
                    this.logger.error(
                        `Подстраховка согласования заявок ${domain} упала: ${(error as Error).message}`,
                        { telegram: true, domain },
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
    }

    /** Домены с включённой подстраховкой; недоступность БД → тик пропущен. */
    private async resolveEnabledDomains(): Promise<string[]> {
        try {
            const rows = await this.appSettings.listByAppCode(
                EnumPortalAppCode.eventSales,
            );
            const enabledKey = SCHEMA.tmcApprovalRescueEnabled.code;
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
