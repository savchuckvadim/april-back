import { BadRequestException, Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { PbxSkapSmartService } from '@lib/portal-lib/pbx/pbx-skap-smart';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import { SkapFileRepository } from '../store/skap-file.repository';
import { SkapRunRepository } from '../store/skap-run.repository';
import {
    SkapPortalLastRunDto,
    SkapPortalRunResponseDto,
    SkapPortalStatusResponseDto,
} from './skap-portal.dto';

/**
 * Портальная поверхность импорта СКАП, общая для фронтов kpi-service и
 * event-service: постановка run-джоба («пересчитать» / «обновить из
 * хранилища») и чтение статуса из журнала. Сам конвейер-воркер живёт в
 * apps/event-service; контроллеры приложений — тонкие обёртки над этим
 * сервисом, чтобы логика и DTO не дублировались по аппам.
 *
 * Модуля у сервиса нет сознательно: зависимости (настройки, очередь,
 * store) приложения уже импортируют для конвейера/своих модулей, сервис
 * добавляется в providers по месту — по образцу SkapImportRunUseCase.
 */
@Injectable()
export class SkapPortalService {
    constructor(
        private readonly settingsService: PortalAppSettingsService,
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly runRepo: SkapRunRepository,
        private readonly fileRepo: SkapFileRepository,
        private readonly skapSmartService: PbxSkapSmartService,
    ) {}

    /**
     * Поставить run-джоб импорта немедленно, не дожидаясь крона. Если
     * прогон уже идёт — второй не ставится (jobId={domain}:run), это
     * не ошибка. Импорт должен быть включён в настройках app=skap.
     */
    async runNow(domain: string): Promise<SkapPortalRunResponseDto> {
        const trimmed = this.requireDomain(domain);
        const settings = await this.settingsService.resolve(
            trimmed,
            EnumPortalAppCode.skap,
        );
        if (!settings.enabled) {
            throw new BadRequestException(
                `Импорт СКАП выключен для портала ${trimmed} — включите ` +
                    'его в настройках приложения (app=skap) в админке',
            );
        }
        const jobId = `${trimmed}:run`;
        await this.queueDispatcher.dispatch(
            QueueNames.SKAP_IMPORT,
            JobNames.SKAP_IMPORT_RUN,
            { domain: trimmed },
            jobId,
            {
                attempts: 1,
                timeout: (settings.maxRunMinutes + 10) * 60_000,
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
        return { queued: true, jobId };
    }

    /**
     * Статус импорта: running / pendingFiles / lastRun + две ссылки для
     * фронта: folderUrl — «Хранилище СКАП» на папку Диска (кэш настроек,
     * null до первого прогона), smartUrl — список элементов смарта «СКАП»
     * в CRM портала (null, пока смарт не установлен). Фронт поллит, пока
     * running или pendingFiles > 0.
     */
    async status(domain: string): Promise<SkapPortalStatusResponseDto> {
        const trimmed = this.requireDomain(domain);
        const lastRun = await this.runRepo.findLatestByDomain(trimmed);
        const pendingFiles = await this.fileRepo.countPendingByDomain(trimmed);
        const settings = await this.settingsService.resolve(
            trimmed,
            EnumPortalAppCode.skap,
        );
        return {
            running: lastRun?.status === 'running',
            pendingFiles,
            lastRun: lastRun ? SkapPortalLastRunDto.fromRow(lastRun) : null,
            folderUrl: settings.folderUrl || null,
            smartUrl: await this.resolveSmartUrl(trimmed),
        };
    }

    /** Ссылка на список элементов смарта; резолв не должен ронять статус. */
    private async resolveSmartUrl(domain: string): Promise<string | null> {
        const info = await this.skapSmartService
            .resolveInfo(domain)
            .catch(() => null);
        if (!info) return null;
        return `https://${domain}/crm/type/${info.entityTypeId}/list/category/0/`;
    }

    private requireDomain(domain: string): string {
        const trimmed = domain?.trim();
        if (!trimmed) {
            throw new BadRequestException(
                'Параметр domain обязателен (домен портала Битрикс)',
            );
        }
        return trimmed;
    }
}
