import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService, StorageType } from '@lib/core/storage';
import {
    DocumentTemplateService,
    TemplateResolutionSource,
} from '@lib/portal-lib/konstructor/document-template';
import { ContractGenerateDto } from '../dto/contract-generate.dto';

/**
 * Признак «откуда взялся файл шаблона» — для логов и для теста,
 * который проверяет, что при выключенном флаге легаси-путь не тронут.
 */
export enum ContractTemplateOrigin {
    /** Флаг выключен: ровно тот путь, что был до резолвера. */
    LEGACY = 'legacy',
    /** Флаг включён, шаблон найден в БД. */
    DB = 'db',
    /** Флаг включён, но у портала нет ни одного шаблона — откат на файл. */
    STORAGE_FALLBACK = 'storage-fallback',
}

export type ContractTemplateFile = {
    /** Путь к .docx внутри storage. */
    path: string;
    origin: ContractTemplateOrigin;
    /** id строки шаблона, если он пришёл из БД. */
    templateId: string | null;
};

/** Единственный легаси-путь к файлу шаблона договора. */
const LEGACY_SUB_PATH = 'konstructor/templates/contract';
const LEGACY_FILE_NAME = 'template.docx';

/**
 * Откуда брать шаблон договора.
 *
 * Вынесено из `ContractGenerateService` отдельным сервисом по двум причинам:
 *  1. одна ответственность — «выбрать файл», а не «собрать документ»;
 *  2. это ЕДИНСТВЕННАЯ точка ветвления по фиче-флагу, поэтому её легко
 *     прочитать и покрыть тестом целиком.
 *
 * Флаг `USE_DB_CONTRACT_TEMPLATES` по умолчанию ВЫКЛЮЧЕН: деплой ничего не
 * меняет, пока его не включат в env. Пока он выключен, резолвер не
 * вызывается вовсе — ни запроса в БД, ни обращения к PortalStore, то есть
 * ни нового отказа, ни новой задержки на живой генерации появиться не может.
 */
@Injectable()
export class ContractTemplateSourceService {
    private readonly logger = new Logger(ContractTemplateSourceService.name);

    constructor(
        private readonly storage: StorageService,
        private readonly configService: ConfigService,
        private readonly documentTemplateService: DocumentTemplateService,
    ) {}

    /**
     * Включён ли подбор шаблона договора из БД.
     *
     * Читается на каждый вызов, а не в конструкторе: флаг переключают
     * переменной окружения, и сервис-синглтон не должен держать её значение
     * с момента старта процесса (иначе для проверки нужен рестарт).
     * Значение «истина» — только явные `true`/`1`: любая опечатка в env
     * оставляет легаси-путь, а не включает новый молча.
     */
    isDbLookupEnabled(): boolean {
        const raw = this.configService
            .get<string>('USE_DB_CONTRACT_TEMPLATES')
            ?.trim()
            .toLowerCase();
        return raw === 'true' || raw === '1';
    }

    /**
     * Путь к файлу шаблона.
     *
     * Флаг выключен → ровно легаси-путь, без единого обращения к БД.
     * Флаг включён → резолвер; его `storage-fallback` (у портала вообще нет
     * шаблонов) приводит к тому же легаси-файлу, поэтому порталы, которые
     * шаблоны ещё не завели, работают как сегодня. Отсутствие шаблона под
     * нужный тип договора при наличии других резолвер поднимает исключением
     * сам — подменять документ универсальным файлом нельзя.
     */
    async resolve(dto: ContractGenerateDto): Promise<ContractTemplateFile> {
        if (!this.isDbLookupEnabled()) {
            return {
                path: this.getLegacyPath(),
                origin: ContractTemplateOrigin.LEGACY,
                templateId: null,
            };
        }

        const resolved = await this.documentTemplateService.resolveContract({
            domain: dto.domain,
            providerId: dto.providerId,
            contractType: dto.contractType,
            clientType: dto.clientType,
            supplyType: dto.supply?.type,
        });

        if (
            resolved.source === TemplateResolutionSource.STORAGE_FALLBACK ||
            !resolved.match
        ) {
            this.logger.warn(
                `Шаблон договора не найден в БД (домен ${dto.domain}, тип ${dto.contractType}) — берём файл из storage`,
            );
            return {
                path: this.getLegacyPath(),
                origin: ContractTemplateOrigin.STORAGE_FALLBACK,
                templateId: null,
            };
        }

        const { candidate, reason } = resolved.match;
        this.logger.log(
            `Шаблон договора #${candidate.id} из БД (домен ${dto.domain}, тип ${dto.contractType}). ${reason}`,
        );

        return {
            path: candidate.filePath,
            origin: ContractTemplateOrigin.DB,
            templateId: candidate.id,
        };
    }

    /** Тот самый единственный файл на все порталы — поведение до резолвера. */
    private getLegacyPath(): string {
        return this.storage.getFilePath(
            StorageType.APP,
            LEGACY_SUB_PATH,
            LEGACY_FILE_NAME,
        );
    }
}
