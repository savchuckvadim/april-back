import { Injectable, Logger } from '@nestjs/common';
import { InitSupplyDto, InitSupplyFlow } from './dto/init-supply.dto';
import { InitSupplyTimelineCommentService } from './services/rpa-timeline-comment/init-supply-timeline-comment.service';
import { InitSupplyRpaFieldsService } from './services/rpa-fields/init-supply-rpa-fields.service';
import { PBXService } from '@lib/pbx/pbx.service';
import { IBxRpaItem } from '@lib/bitrix/domain/rpa/item/interface/bx-rpa-item.interface';
import { EBXEntity, IBXDeal } from '@lib/bitrix';
import { InitSupplyDealFileFieldsService } from './services/file/init-supply-deal-file-fields.service';
import { InitSupplyDiskService } from './services/disk/init-supply-disk.service';
import {
    buildDiskCommentLine,
    buildDiskTimelineEntry,
} from './lib/init-supply-disk';
import { toTimelineCommentDirect } from '@lib/bitrix/consts/timeline.consts';
import { InitSupplyResponseDto } from './dto/init-supply-response.dto';
import { addRpaComment } from './services/rpa-timeline-comment/lib/rpa-comment.writer';
import { COMPLECT_VARIANT_STAGE } from '@lib/portal-lib/pbx/pbx-complect-variant-smart';
import { ComplectVariantLifecycleService } from '../../modules/complect-variant-lifecycle';
import { InnerDealService } from '../../modules/inner-deal/services/inner-deal.service';
import {
    participantVariantIds,
    selectLeftoutVariantIds,
} from './lib/init-supply-variants';

@Injectable()
export class InitSupplyUseCase {
    private readonly logger = new Logger(InitSupplyUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly initSupplyRpaFieldsService: InitSupplyRpaFieldsService,
        private readonly initSupplyTimelineCommentService: InitSupplyTimelineCommentService,
        private readonly initSupplyDealFileFieldsService: InitSupplyDealFileFieldsService,
        private readonly initSupplyDiskService: InitSupplyDiskService,
        private readonly innerDealService: InnerDealService,
    ) {}

    async initSupply(dto: InitSupplyDto): Promise<InitSupplyResponseDto> {
        /*
         1. получаем данные из smart - или из сделки
         2. Создаем или обновляем rpa
        **/
        const { bitrix, PortalModel } = await this.pbx.init(dto.domain);
        const rpaType = PortalModel.getRpaByCode('supply');
        const rpaTypeId = rpaType?.bitrixId;
        if (!rpaTypeId) {
            throw new Error('Rpa type id not found');
        }

        let rpaResponse: IBxRpaItem | null = null;
        const rpaFields = await this.initSupplyRpaFieldsService.getRpaFields(
            dto,
            PortalModel,
            bitrix,
        );

        if (dto.rpa_id && rpaTypeId) {
            rpaResponse = await bitrix.rpaItem
                .update({
                    id: dto.rpa_id,
                    typeId: Number(rpaTypeId),
                    fields: rpaFields,
                })
                .then(res => res.result.item);
        }

        if (!dto.rpa_id) {
            rpaResponse = await bitrix.rpaItem
                .add({
                    typeId: Number(rpaTypeId),
                    fields: rpaFields,
                })
                .then(res => res.result.item);
        }
        const rpaId = dto.rpa_id || rpaResponse?.id;

        // Участники заявки → стадия «Поставка» (README lifecycle, п.4; только
        // вперёд). Остальные варианты сделки закрываются «Не состоялся»: в
        // сервисную сделку переезжают только проданные. Запрос без вариантов
        // ничего не двигает и не закрывает.
        const variantIds = participantVariantIds(dto);
        let closedVariantIds: number[] = [];
        if (variantIds.length) {
            const lifecycle = new ComplectVariantLifecycleService(
                bitrix,
                PortalModel,
            );
            try {
                await lifecycle.markStageForward(
                    dto.domain,
                    variantIds,
                    COMPLECT_VARIANT_STAGE.SUPPLY,
                );
            } catch (error) {
                this.logger.warn(
                    `${dto.domain}: стадия «Поставка» вариантам не проставлена: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
            closedVariantIds = await this.closeLeftoutVariants(
                dto,
                lifecycle,
                variantIds,
            );
        }

        // Договор и счёт, приложенные менеджером в конструкторе, кладём ещё и
        // в саму сделку: в RPA они ушли вместе с rpaFields. Файл, который уже
        // лежал в сделке (downloadUrl), сюда не попадает — он там есть.
        const dealFileFields = this.initSupplyDealFileFieldsService.get(
            dto,
            PortalModel,
        );
        if (dto.dealId && Object.keys(dealFileFields).length > 0) {
            await bitrix.deal.update(
                Number(dto.dealId),
                // fileData не описан в IBXDeal — там только скалярные значения
                dealFileFields as unknown as Partial<IBXDeal>,
            );
        }

        const flowTitle =
            dto.flow === InitSupplyFlow.SUPPLY ? 'Поставка' : 'Перезаключение';

        // Документы заявки — на Диск, в подпапку папки сделки. Диск дополняет
        // файловые поля: заявка создаётся при любом исходе, сбой Диска
        // приходит в ответе причиной.
        const disk = await this.initSupplyDiskService.save({ dto, rpaId });
        const diskWarnings = disk.warning ? [disk.warning] : [];

        // страница таймлайна на каждого участника: наборы сервис смотрит по
        // отдельности
        const timelineEntries =
            await this.initSupplyTimelineCommentService.getTimelineEntries(
                dto,
                flowTitle,
            );
        if (rpaId && dto.userId) {
            for (const entry of timelineEntries) {
                await addRpaComment(bitrix, {
                    typeId: rpaTypeId,
                    itemId: rpaId,
                    title: entry.title,
                    description: entry.description,
                });
            }

            // Ссылка на папку Диска отдельной страницей: при любом числе
            // договоров заявка одна, документы лежат в одной папке.
            if (disk.folderUrl) {
                const diskEntry = buildDiskTimelineEntry(
                    dto.flow,
                    disk.folderUrl,
                    disk.fileNames,
                );
                try {
                    await addRpaComment(bitrix, {
                        typeId: rpaTypeId,
                        itemId: rpaId,
                        title: diskEntry.title,
                        description: diskEntry.description,
                    });
                } catch (error) {
                    const reason =
                        error instanceof Error ? error.message : String(error);
                    this.logger.warn(
                        `${dto.domain}: ссылка на папку Диска не добавлена в таймлайн заявки ${rpaId}: ${reason}`,
                    );
                    diskWarnings.push(
                        `Ссылка на папку Диска не добавлена в таймлайн заявки: ${reason}`,
                    );
                }
            }

            if (dto.dealId) {
                await bitrix.timeline.addTimelineComment({
                    ENTITY_ID: Number(dto.dealId),
                    ENTITY_TYPE: EBXEntity.DEAL,
                    COMMENT: toTimelineCommentDirect([
                        this.getCommentEntityMessage(
                            dto.domain,
                            rpaTypeId,
                            rpaId,
                            flowTitle,
                        ),
                        disk.folderUrl
                            ? buildDiskCommentLine(disk.folderUrl)
                            : '',
                    ]),
                    AUTHOR_ID: dto.userId.toString(),
                });
            }
        }
        return {
            // id_rpa — контракт легаси-ручки /rpa/init_supply, фронт читает его
            id_rpa: rpaId ?? null,
            rpaDb: rpaType ?? null,
            rpaTypeId,
            rpaResponse,
            dealFileFields: Object.keys(dealFileFields),
            rpaFields: this.withoutFileBlobs(rpaFields),
            diskFolderUrl: disk.folderUrl,
            ...(diskWarnings.length > 0
                ? { diskWarning: diskWarnings.join('; ') }
                : {}),
            ...(closedVariantIds.length > 0 ? { closedVariantIds } : {}),
        };
    }

    /**
     * Остальные варианты сделки (строки слепков, чьих id нет среди участников
     * заявки) переводятся в «Не состоялся». Закрытые раньше («Успех»,
     * «Отклонён») сервис жизненного цикла не переписывает.
     *
     * Best-effort: сбой чтения вариантов или Битрикса пишется в лог и заявку
     * не роняет. Возвращает id вариантов, которым стадия поставлена.
     */
    private async closeLeftoutVariants(
        dto: InitSupplyDto,
        lifecycle: ComplectVariantLifecycleService,
        participantIds: readonly number[],
    ): Promise<number[]> {
        const closed: number[] = [];
        if (!dto.dealId) {
            return closed;
        }
        try {
            const dealVariants = await this.innerDealService.listVariants(
                dto.domain,
                dto.dealId,
            );
            // по одному: так видно, какие именно варианты закрыты
            for (const variantId of selectLeftoutVariantIds(
                dealVariants,
                participantIds,
            )) {
                const result = await lifecycle.markRejected(dto.domain, [
                    variantId,
                ]);
                if (result.moved > 0) {
                    closed.push(variantId);
                }
            }
        } catch (error) {
            this.logger.warn(
                `${dto.domain}: остальные варианты сделки ${dto.dealId} не закрыты стадией «Не состоялся»: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        return closed;
    }

    /**
     * В rpaFields файлы лежат парой `[имя, base64]` — гнать их обратно на фронт
     * незачем, ответ распухает на размер всех вложений.
     */
    private withoutFileBlobs(
        rpaFields: Partial<IBxRpaItem>,
    ): Record<string, unknown> {
        return Object.fromEntries(
            Object.entries(rpaFields).map(([key, value]) => {
                if (
                    Array.isArray(value) &&
                    value.length === 2 &&
                    typeof value[1] === 'string' &&
                    value[1].length > 256
                ) {
                    return [key, [value[0], `<base64:${value[1].length}>`]];
                }
                return [key, value];
            }),
        );
    }

    private getCommentEntityMessage(
        domain: string,
        rpaTypeId: number,
        rpaId: number,
        flowTitle: string,
    ) {
        const link = `https://${domain}/rpa/item/${rpaTypeId}/${rpaId}/`;
        const message = `📝 <a href="${link}"  target="_blank">${flowTitle}</a>`;
        return message;
    }
}
