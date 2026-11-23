import { Injectable, Logger } from '@nestjs/common';
import {
    BitrixDocumentSaveFlowService,
    IDealFolderFile,
} from '@app/konstructor/offer-word/services/bitrix/bitrix-document-save-flow.service';
import { InitSupplyDto } from '../../dto/init-supply.dto';
import { buildDiskFolderName } from '../../lib/init-supply-disk';
import { InitSupplyFileService } from '../file/init-supply-file.service';

export interface InitSupplyDiskParams {
    dto: InitSupplyDto;
    /** Id заявки RPA: по нему называется подпапка. */
    rpaId: number | undefined;
}

export interface InitSupplyDiskResult {
    /** Ссылка на подпапку заявки; документы не легли на Диск — `null`. */
    folderUrl: string | null;
    /** Имена файлов, как они лежат на Диске. */
    fileNames: string[];
    /** Причина, если Диск принял не всё. Нет сбоев — поля нет. */
    warning?: string;
}

const reasonOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * Документы заявки поставки на Диске Битрикса: в папке сделки подпапка
 * `Поставка {id заявки}` (`Перезаключение {id заявки}`), в ней отчёт о
 * поставке и все файлы менеджера (договоры, счета).
 *
 * Диск — дополнение к файловым полям заявки: исключений сервис наружу не
 * отдаёт, сбой записывается в лог и в `warning`, заявка живёт дальше.
 */
@Injectable()
export class InitSupplyDiskService {
    private readonly logger = new Logger(InitSupplyDiskService.name);

    constructor(
        private readonly saveFlow: BitrixDocumentSaveFlowService,
        private readonly fileService: InitSupplyFileService,
    ) {}

    async save(params: InitSupplyDiskParams): Promise<InitSupplyDiskResult> {
        const { dto, rpaId } = params;
        const where = `${dto.domain}, заявка ${rpaId ?? 'без id'}, сделка ${dto.dealId ?? 'без сделки'}`;

        if (!rpaId) {
            return this.failed(
                where,
                'в ответе Битрикса нет id заявки, подпапку назвать нечем',
            );
        }

        const problems: string[] = [];
        const files = await this.collectFiles(dto, problems);
        if (files.length === 0) {
            return this.failed(
                where,
                problems.join('; ') || 'нет файлов для загрузки',
            );
        }

        try {
            const saved = await this.saveFlow.saveFilesToDealFolder({
                domain: dto.domain,
                dealId: dto.dealId,
                companyId: dto.companyId,
                subfolder: buildDiskFolderName(dto.flow, rpaId),
                files,
            });
            for (const item of saved.failed) {
                problems.push(`«${item.name}»: ${item.reason}`);
            }
            // пустая папка ссылки не стоит: в ответ и таймлайн она не идёт
            if (saved.uploaded.length === 0) {
                return this.failed(
                    where,
                    problems.join('; ') || 'Диск не принял ни одного файла',
                );
            }
            if (!saved.folderUrl) {
                problems.push('Диск не вернул ссылку на папку');
            }

            const result: InitSupplyDiskResult = {
                folderUrl: saved.folderUrl,
                fileNames: saved.uploaded.map(item => item.name),
            };
            if (problems.length > 0) {
                result.warning = `Документы загружены на Диск не полностью: ${problems.join('; ')}`;
                this.logger.warn(`${result.warning} (${where})`);
            }
            return result;
        } catch (error) {
            return this.failed(where, reasonOf(error));
        }
    }

    /**
     * Что кладём: отчёт о поставке (тот же файл по ссылке `dto.file`, что идёт
     * в поле `current_supply`) и все файлы менеджера. Файлов с одним `code`
     * может быть несколько, на Диск идут все.
     */
    private async collectFiles(
        dto: InitSupplyDto,
        problems: string[],
    ): Promise<IDealFolderFile[]> {
        const files: IDealFolderFile[] = [];

        if (dto.file) {
            try {
                const [name, base64] =
                    await this.fileService.downloadFileAndConvertToBase64(
                        dto.file,
                    );
                files.push({ name, content: base64 });
            } catch (error) {
                problems.push(`отчёт о поставке не скачан: ${reasonOf(error)}`);
            }
        }

        for (const file of dto.files ?? []) {
            if (file.base64) {
                files.push({ name: file.filename, content: file.base64 });
            }
        }
        return files;
    }

    private failed(where: string, reason: string): InitSupplyDiskResult {
        const warning = `Документы не загружены на Диск: ${reason}`;
        this.logger.warn(`${warning} (${where})`);
        return { folderUrl: null, fileNames: [], warning };
    }
}
