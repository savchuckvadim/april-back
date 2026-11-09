import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    Optional,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
    formatCronJobsReport,
    mergeCronJobsRoster,
    summarizeCronJobs,
} from './cron-jobs-report';
import {
    CRON_JOBS_ROSTER_SOURCE,
    CronJobsRoster,
    CronJobsRosterSource,
} from './cron-jobs-roster';

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * При старте приложения пишет в лог и в Telegram список зарегистрированных
 * кронов с ближайшими запусками, а если приложение отдало сведения
 * (`CRON_JOBS_ROSTER_SOURCE`) — ещё и что каждый крон делает и на каких
 * порталах включён.
 *
 * Зачем: крон, у которого нет работы, молчит, и снаружи не отличить
 * «крон жив, но ему нечего делать» от «крон не зарегистрирован вовсе» и
 * от «крон есть, но на портале выключен». Сообщение при старте снимает
 * оба вопроса сразу после деплоя.
 *
 * Кроны монтирует глобальный ScheduleModule в своём onApplicationBootstrap,
 * а хуки глобальных модулей Nest вызывает первыми — к нашему хуку реестр
 * уже полон. Сведения читаются из БД без ожидания: старт приложения они
 * не задерживают, сбой чтения — строка в том же сообщении. Отчёт — только
 * диагностика, поэтому любая его ошибка остаётся в логе и приложение не
 * роняет.
 */
@Injectable()
export class CronJobsReporter implements OnApplicationBootstrap {
    private readonly logger = new Logger(CronJobsReporter.name);

    constructor(
        private readonly registry: SchedulerRegistry,
        @Optional()
        @Inject(CRON_JOBS_ROSTER_SOURCE)
        private readonly rosterSource: CronJobsRosterSource | null = null,
    ) {}

    onApplicationBootstrap(): void {
        void this.report().catch((error: unknown) =>
            this.logger.error(
                `Отчёт о кронах не отправлен: ${errorMessage(error)}`,
            ),
        );
    }

    /** Собрать и отправить отчёт; вынесен из хука ради тестов и повторного вызова. */
    async report(): Promise<void> {
        const jobs = summarizeCronJobs(this.registry.getCronJobs());
        if (!jobs.length) {
            this.logger.error(formatCronJobsReport([]), { telegram: true });
            return;
        }
        const roster = await this.loadRoster();
        const { lines, warnings } = mergeCronJobsRoster(jobs, roster.value);
        if (roster.error) {
            warnings.push(`⚠️ Сведения о порталах не собраны: ${roster.error}`);
        }
        this.logger.log(formatCronJobsReport(lines, warnings), {
            telegram: true,
        });
    }

    private async loadRoster(): Promise<{
        value: CronJobsRoster | null;
        error: string | null;
    }> {
        if (!this.rosterSource) return { value: null, error: null };
        try {
            return { value: await this.rosterSource.resolve(), error: null };
        } catch (error) {
            const message = errorMessage(error);
            this.logger.error(
                `Сведения о порталах для отчёта о кронах не собраны: ${message}`,
            );
            return { value: null, error: message };
        }
    }
}
