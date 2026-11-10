import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageService, StorageType } from '@lib/core/storage';
import {
    DocumentTemplateService,
    ResolveTemplateInput,
    TemplateResolutionSource,
} from '@lib/portal-lib/konstructor/document-template';
import { SupplyReportFieldOverrides } from '../../lib/supply-report-form';

/** Откуда взялся файл шаблона отчёта — для логов и для тестов. */
export enum SupplyReportTemplateOrigin {
    /** Строка нашлась в БД (админка «Шаблоны отчёта о поставке»). */
    DB = 'db',
    /** Строки нет — зонд по storage: домен → общий файл. */
    STORAGE_FALLBACK = 'storage-fallback',
}

export type SupplyReportTemplateFile = {
    path: string;
    origin: SupplyReportTemplateOrigin;
    templateId: string | null;
    /**
     * Портальная настройка состава формы из найденной строки.
     * `undefined` — строки нет, состав берётся из кода (как сегодня).
     */
    fieldOverrides?: SupplyReportFieldOverrides;
};

const BASE_PATH = 'konstructor/templates/supply';
/** Шаблон, которым отчёт собирается сегодня. */
const NEW_TEMPLATE_FILE = 'sales_report.docx';
/**
 * Старый файл. `isNewTemplate` был захардкожен в `true`, поэтому в живом
 * коде он недостижим; зонд проверяет его последним.
 */
const LEGACY_TEMPLATE_FILE = 'supply_report_gsr.docx';

/**
 * Откуда брать шаблон отчёта о поставке.
 *
 * Порядок: БД (портальный или общий шаблон из админки) → зонд по домену →
 * общий файл. Зонд — последний уровень: порталы без строки собирают отчёт
 * из файла, как раньше.
 */
@Injectable()
export class SupplyReportTemplateSourceService {
    private readonly logger = new Logger(
        SupplyReportTemplateSourceService.name,
    );

    constructor(
        private readonly storageService: StorageService,
        private readonly documentTemplateService: DocumentTemplateService,
    ) {}

    /** Путь к файлу шаблона плюс портальная настройка состава формы. */
    async resolve(
        input: ResolveTemplateInput,
    ): Promise<SupplyReportTemplateFile> {
        const resolved =
            await this.documentTemplateService.resolveSupplyReport(input);

        if (
            resolved.source === TemplateResolutionSource.STORAGE_FALLBACK ||
            !resolved.match
        ) {
            this.logger.log(
                `Шаблон отчёта в БД не найден (домен ${input.domain}) — зонд по storage`,
            );
            return {
                path: await this.resolveStoragePath(input.domain),
                origin: SupplyReportTemplateOrigin.STORAGE_FALLBACK,
                templateId: null,
            };
        }

        const { candidate, reason } = resolved.match;
        this.logger.log(
            `Шаблон отчёта #${candidate.id} из БД (домен ${input.domain}). ${reason}`,
        );

        return {
            path: candidate.filePath,
            origin: SupplyReportTemplateOrigin.DB,
            templateId: candidate.id,
            fieldOverrides: {
                requiredCodes: candidate.requiredFields ?? null,
                optionalCodes: candidate.optionalFields ?? null,
            },
        };
    }

    /**
     * Легаси-зонд: переопределение под домен, затем общий файл — ровно как
     * в Laravel (`templates/supply/{domain}/sales_report.docx` с фолбэком).
     *
     * `isNewTemplate` здесь больше нет: он был захардкожен в `true`, то есть
     * фактическим поведением было «только `sales_report.docx`». Старое имя
     * проверяется ПОСЛЕ нового и только если нового нет нигде — так
     * недостижимый файл перестаёт быть мёртвым кодом, не меняя того, что
     * выбирается сегодня.
     */
    private async resolveStoragePath(domain: string): Promise<string> {
        const candidates = [
            this.storageService.getFilePath(
                StorageType.APP,
                `${BASE_PATH}/${domain}`,
                NEW_TEMPLATE_FILE,
            ),
            this.storageService.getFilePath(
                StorageType.APP,
                BASE_PATH,
                NEW_TEMPLATE_FILE,
            ),
            this.storageService.getFilePath(
                StorageType.APP,
                `${BASE_PATH}/${domain}`,
                LEGACY_TEMPLATE_FILE,
            ),
            this.storageService.getFilePath(
                StorageType.APP,
                BASE_PATH,
                LEGACY_TEMPLATE_FILE,
            ),
        ];

        for (const path of candidates) {
            if (await this.storageService.fileExists(path)) {
                return path;
            }
        }

        // В сообщении — общий путь нового шаблона: именно его и ждут в
        // storage, остальные варианты это фолбэки.
        throw new NotFoundException(
            `Шаблон отчёта о поставке не найден: ${candidates[1]}`,
        );
    }
}
