import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageService } from '@lib/core/storage';
import { DocumentTemplateService } from '@lib/portal-lib/konstructor/document-template';
import { ContractGenerateDto } from '../dto/contract-generate.dto';

export type ContractTemplateFile = {
    /** Путь к .docx внутри storage. */
    path: string;
    /** id строки шаблона в contract_templates. */
    templateId: string;
};

/**
 * Откуда брать шаблон договора: портальный или общий шаблон из БД по типу
 * договора, поставке, типу клиента и поставщику (админка «Шаблоны
 * договоров»). Нет подходящего — `DocumentTemplateService` отвечает 404 с
 * текстом, какой шаблон завести; подмены «общим» файлом нет.
 */
@Injectable()
export class ContractTemplateSourceService {
    private readonly logger = new Logger(ContractTemplateSourceService.name);

    constructor(
        private readonly storage: StorageService,
        private readonly documentTemplateService: DocumentTemplateService,
    ) {}

    async resolve(dto: ContractGenerateDto): Promise<ContractTemplateFile> {
        const resolved = await this.documentTemplateService.resolveContract({
            domain: dto.domain,
            providerId: dto.providerId,
            contractType: dto.contractType,
            clientType: dto.clientType,
            supplyType: dto.supply?.type,
        });
        // без шаблона resolveContract уже ответил 404 с подробностями
        if (!resolved.match) {
            throw new NotFoundException('Шаблон договора не найден');
        }
        const { candidate, reason } = resolved.match;

        if (!(await this.storage.fileExists(candidate.filePath))) {
            throw new NotFoundException(
                `Файл шаблона договора #${candidate.id} не найден в хранилище. ` +
                    'Загрузите файл заново в админке: «Шаблоны договоров».',
            );
        }

        this.logger.log(
            `Шаблон договора #${candidate.id} (домен ${dto.domain}, тип ${dto.contractType}). ${reason}`,
        );
        return { path: candidate.filePath, templateId: candidate.id };
    }
}
