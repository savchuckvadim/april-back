import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService, StorageType } from '@lib/core/storage';
import {
    DocumentTemplateService,
    ResolveTemplateInput,
    TemplateResolutionSource,
} from '@lib/portal-lib/konstructor/document-template';
import { SupplyReportFieldOverrides } from '../../lib/supply-report-form';

/** Откуда взялся файл шаблона отчёта — для логов и для тестов. */
export enum SupplyReportTemplateOrigin {
    /** Флаг выключен: нетронутый легаси-путь (домен → общий файл). */
    LEGACY = 'legacy',
    /** Флаг включён, строка нашлась в БД. */
    DB = 'db',
    /** Флаг включён, строки нет — тот же легаси-зонд по storage. */
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
 * коде он недостижим; имя сохранено, чтобы зонд по storage остался
 * идентичным, если флаг включат, а строки в БД не окажется.
 */
const LEGACY_TEMPLATE_FILE = 'supply_report_gsr.docx';

/**
 * Откуда брать шаблон отчёта о поставке.
 *
 * Одна ответственность — «выбрать файл», и одна точка ветвления по флагу
 * `USE_DB_SUPPLY_REPORT_TEMPLATES` (по умолчанию ВЫКЛЮЧЕН: деплой ничего
 * не меняет). Флаг свой, отдельный от договорного: отчёт и договор
 * переключаются независимо.
 *
 * Порядок при включённом флаге: БД → зонд по домену → общий файл. Зонд
 * остался ПОСЛЕДНИМ уровнем, а не исчез: порталы, у которых строки ещё
 * нет, продолжают собирать отчёт из файла.
 */
@Injectable()
export class SupplyReportTemplateSourceService {
    private readonly logger = new Logger(
        SupplyReportTemplateSourceService.name,
    );

    constructor(
        private readonly storageService: StorageService,
        private readonly configService: ConfigService,
        private readonly documentTemplateService: DocumentTemplateService,
    ) {}

    /**
     * Читается на каждый вызов, а не в конструкторе: флаг переключают
     * переменной окружения, и синглтон не должен держать её значение
     * с момента старта процесса. «Истина» — только явные `true`/`1`,
     * чтобы опечатка в env не включала новый путь молча.
     */
    isDbLookupEnabled(): boolean {
        const raw = this.configService
            .get<string>('USE_DB_SUPPLY_REPORT_TEMPLATES')
            ?.trim()
            .toLowerCase();
        return raw === 'true' || raw === '1';
    }

    /**
     * Путь к файлу шаблона плюс портальная настройка состава формы.
     *
     * Флаг выключен → `resolveStoragePath` без единого обращения к БД:
     * тот же зонд `{domain}/sales_report.docx` → общий файл, что и раньше.
     */
    async resolve(
        input: ResolveTemplateInput,
    ): Promise<SupplyReportTemplateFile> {
        if (!this.isDbLookupEnabled()) {
            return {
                path: await this.resolveStoragePath(input.domain),
                origin: SupplyReportTemplateOrigin.LEGACY,
                templateId: null,
            };
        }

        const resolved =
            await this.documentTemplateService.resolveSupplyReport(input);

        if (
            resolved.source === TemplateResolutionSource.STORAGE_FALLBACK ||
            !resolved.match
        ) {
            this.logger.log(
                `Шаблон отчёта в БД не найден (домен ${input.domain}) — зонд по storage, как до флага`,
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
