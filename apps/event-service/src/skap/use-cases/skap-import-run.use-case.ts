import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { PbxSkapSmartService } from '@lib/portal-lib/pbx/pbx-skap-smart';
import {
    emptySkapRunStats,
    SkapFileParseService,
    SkapFileRepository,
    SkapFormatError,
    SkapItemRepository,
    SkapRunNotifierService,
    SkapRunRepository,
    SkapRunStats,
    SkapSessionRepository,
    SkapSubscriptionRepository,
} from '@lib/skap-lib';
import { SkapDiskService } from '../services/disk/skap-disk.service';
import {
    SkapFileImportFlow,
    SkapTimeBudgetExceeded,
} from '../services/import/skap-file-import.flow';

export interface SkapImportRunResult {
    runId: string;
    domain: string;
    stats: SkapRunStats;
    stopReason: string | null;
}

/**
 * Прогон импорта СКАП по одному домену (весь compute — в воркере очереди,
 * правило heavy-endpoint-queue): скан Диска → синк журнала файлов →
 * обработка pending-файлов с тайм-бюджетом (требование «не более 3 часов
 * непрерывной работы») → журнал прогона.
 *
 * Идемпотентность: jobId={domain}:run (Bull), dedup_key (БД), xmlId (Bitrix).
 */
@Injectable()
export class SkapImportRunUseCase {
    private readonly logger = new Logger(SkapImportRunUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly settingsService: PortalAppSettingsService,
        private readonly skapSmartService: PbxSkapSmartService,
        private readonly parseService: SkapFileParseService,
        private readonly fileRepo: SkapFileRepository,
        private readonly itemRepo: SkapItemRepository,
        private readonly sessionRepo: SkapSessionRepository,
        private readonly subscriptionRepo: SkapSubscriptionRepository,
        private readonly runRepo: SkapRunRepository,
        private readonly notifier: SkapRunNotifierService,
    ) {}

    async execute(domain: string): Promise<SkapImportRunResult> {
        const settings = await this.settingsService.resolve(
            domain,
            EnumPortalAppCode.skap,
        );
        // Перечитка настроек в воркере: админ мог выключить портал между
        // тиком планировщика и стартом джоба.
        if (!settings.enabled) {
            this.logger.log(`Импорт СКАП выключен для ${domain} — пропуск`);
            return {
                runId: '',
                domain,
                stats: emptySkapRunStats(),
                stopReason: 'disabled',
            };
        }

        const {
            bitrix,
            PortalModel: portalModel,
            portal,
        } = await this.pbxService.init(domain);
        if (portal.id === undefined || portal.id === null) {
            throw new Error(
                `Портал ${domain} без id в локальной БД — импорт СКАП требует строку portals`,
            );
        }
        const portalId = BigInt(portal.id);
        const run = await this.runRepo.start(portalId, domain);
        const stats = emptySkapRunStats();
        const deadlineAt = Date.now() + settings.maxRunMinutes * 60_000;
        let stopReason: string | null = null;

        try {
            const smartInfo = await this.skapSmartService.resolveInfo(domain);
            if (!smartInfo) {
                throw new Error(
                    'Смарт «СКАП» не установлен на портале — установите его ' +
                        'через админку (галерея смартов, kind=skap)',
                );
            }

            // Диск: группа отдела сервиса → папка загрузок → листинг.
            const disk = new SkapDiskService(bitrix, portalModel);
            const groupId = disk.resolveGroupId(settings.groupId);
            const folderId = await disk.resolveUploadFolderId(
                groupId,
                settings.folderId,
            );
            // Кэш папки и её URL (ссылка «Хранилище СКАП» на фронте).
            if (folderId !== settings.folderId || !settings.folderUrl) {
                const folderUrl = await disk.getFolderUrl(folderId, domain);
                await this.settingsService
                    .save(Number(portal.id), EnumPortalAppCode.skap, {
                        groupId,
                        folderId,
                        ...(folderUrl ? { folderUrl } : {}),
                    })
                    .catch(error =>
                        this.logger.warn(
                            `folderId не закэширован в настройках (${domain}): ${(error as Error).message}`,
                        ),
                    );
            }

            const diskFiles = await disk.listFiles(folderId);
            stats.filesFound = diskFiles.length;
            await this.fileRepo.syncDiskFiles(
                portalId,
                domain,
                diskFiles.map(file => ({
                    diskFileId: file.diskFileId,
                    // В журнале храним путь от папки загрузок — из него
                    // извлекается отчётный месяц (подпапки месяцев).
                    fileName: file.relativePath,
                    diskUpdatedAt: file.updateTime,
                    size: file.size,
                })),
            );

            const historyCutoff =
                settings.maxHistoryYears > 0
                    ? new Date(
                          new Date().getFullYear() - settings.maxHistoryYears,
                          new Date().getMonth(),
                          1,
                      )
                    : null;
            const flow = new SkapFileImportFlow(
                bitrix,
                portalModel,
                { domain, portalId, deadlineAt, historyCutoff, smartInfo },
                {
                    itemRepo: this.itemRepo,
                    sessionRepo: this.sessionRepo,
                    subscriptionRepo: this.subscriptionRepo,
                },
                this.parseService,
            );

            const pending = await this.fileRepo.findPending(
                portalId,
                settings.maxFilesPerRun,
            );
            for (const file of pending) {
                if (Date.now() > deadlineAt) {
                    stopReason = 'time_budget';
                    break;
                }
                await this.fileRepo.markProcessing(file.id);
                try {
                    const buffer = await disk.downloadFile(file.diskFileId);
                    const result = await flow.processFile(file, buffer);
                    this.mergeStats(stats, result.stats);
                    await this.fileRepo.markDone(
                        file.id,
                        result.formatVersion,
                        result.stats,
                    );
                    stats.filesProcessed += 1;
                } catch (error) {
                    if (error instanceof SkapTimeBudgetExceeded) {
                        // Возврат в pending: upsert-ы идемпотентны, файл
                        // безопасно дообработается следующим тиком.
                        await this.fileRepo.resetToPending(file.id);
                        stopReason = 'time_budget';
                        break;
                    }
                    const message = (error as Error).message;
                    stats.filesError += 1;
                    if (error instanceof SkapFormatError) {
                        await this.fileRepo.markError(
                            file.id,
                            'error_format',
                            message,
                        );
                        // Смена формата таблиц — узнаём сразу (Telegram).
                        this.logger.error(
                            `Формат СКАП не распознан (${domain}, ${file.fileName}): ${message}`,
                            { telegram: true, domain, file: file.fileName },
                        );
                    } else {
                        await this.fileRepo.markError(
                            file.id,
                            'error',
                            message,
                        );
                        this.logger.error(
                            `Файл СКАП упал (${domain}, ${file.fileName}): ${message}`,
                            { telegram: true, domain, file: file.fileName },
                        );
                    }
                }
            }

            const finalStatus =
                stopReason === 'time_budget' ? 'stopped_time_budget' : 'done';
            await this.runRepo.finish(
                run.id,
                finalStatus,
                stats,
                stopReason ?? undefined,
            );
            if (stopReason === 'time_budget') {
                this.logger.warn(
                    `Прогон СКАП остановлен по тайм-бюджету (${domain}): ` +
                        `${settings.maxRunMinutes} мин, остаток уйдёт в следующий тик`,
                    { telegram: true, domain },
                );
            }

            // Дайджест прогона (контуры 2–3 плана §11): fail-open.
            await this.notifier
                .sendDigest(
                    { domain, stats, stopReason },
                    settings.digestLevel,
                    settings.notifyUserIds,
                    bitrix,
                )
                .catch(error =>
                    this.logger.warn(
                        `Дайджест не отправлен (${domain}): ${(error as Error).message}`,
                    ),
                );

            return { runId: run.id, domain, stats, stopReason };
        } catch (error) {
            await this.runRepo
                .finish(run.id, 'error', stats, (error as Error).message)
                .catch(() => undefined);
            throw error;
        }
    }

    private mergeStats(total: SkapRunStats, file: SkapRunStats | object): void {
        const source = file as Record<string, unknown>;
        for (const key of Object.keys(total) as (keyof SkapRunStats)[]) {
            const value = source[key];
            if (typeof value === 'number' && key !== 'filesFound') {
                (total[key] as number) += value;
            }
            if (Array.isArray(value) && key === 'warnings') {
                total.warnings.push(...(value as string[]));
            }
        }
    }
}
