import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { SendCallReportWeeklyUseCase } from '@lib/call-lib/call-report/weekly-report/send-call-report-weekly.use-case';

/**
 * Недельный Excel-отчёт по звонкам: пятница, 19:00 МСК (16:00 UTC —
 * контейнер живёт в UTC, как остальные кроны конвейера).
 *
 * Собирается по каждому порталу, где включён отчёт
 * (`weeklyReportEnabled`), за последние 7 дней. Ошибка одного портала не
 * прерывает остальные: файл — не критичный путь конвейера.
 */
@Injectable()
export class CallReportWeeklyScheduler {
    private readonly logger = new Logger(CallReportWeeklyScheduler.name);

    constructor(
        private readonly portalAiSettings: PortalAiSettingsService,
        private readonly sendWeekly: SendCallReportWeeklyUseCase,
    ) {}

    @Cron('0 16 * * 5')
    async tick(): Promise<void> {
        const portals = await this.portalAiSettings
            .findEnabled()
            .catch((error: Error) => {
                this.logger.error(
                    `Недельный отчёт: порталы не прочитаны (${error.message})`,
                    { telegram: true },
                );
                return [] as Awaited<
                    ReturnType<PortalAiSettingsService['findEnabled']>
                >;
            });
        const targets = portals.filter(
            portal => portal.weeklyReportEnabled === true,
        );
        if (!targets.length) return;

        this.logger.log(
            `Недельный отчёт по звонкам: порталов ${targets.length}`,
        );
        for (const portal of targets) {
            await this.runDomain(portal.domain);
        }
    }

    /** Один портал; ошибки логируются и не прерывают обход. */
    private async runDomain(domain: string): Promise<void> {
        try {
            const result = await this.sendWeekly.execute(domain);
            this.logger.log(
                `Недельный отчёт ${domain}: звонков ${result.calls}, ` +
                    `получателей ${result.notifiedUserIds.length}`,
            );
        } catch (error) {
            this.logger.error(
                `Недельный отчёт ${domain} не собран: ${(error as Error).message}`,
                { telegram: true },
            );
        }
    }
}
