import { Injectable } from '@nestjs/common';
import { InitSupplyDto, InitSupplyFlow } from './dto/init-supply.dto';
import { InitSupplyTimelineCommentService } from './services/rpa-timeline-comment/init-supply-timeline-comment.service';
import { InitSupplyRpaFieldsService } from './services/rpa-fields/init-supply-rpa-fields.service';
import { PBXService } from '@lib/pbx/pbx.service';
import { IBxRpaItem } from '@lib/bitrix/domain/rpa/item/interface/bx-rpa-item.interface';
import { EBXEntity, IBXDeal } from '@lib/bitrix';
import { InitSupplyDealFileFieldsService } from './services/file/init-supply-deal-file-fields.service';

@Injectable()
export class InitSupplyUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly initSupplyRpaFieldsService: InitSupplyRpaFieldsService,
        private readonly initSupplyTimelineCommentService: InitSupplyTimelineCommentService,
        private readonly initSupplyDealFileFieldsService: InitSupplyDealFileFieldsService,
    ) {}

    async initSupply(dto: InitSupplyDto): Promise<any> {
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

        const timelineComment =
            await this.initSupplyTimelineCommentService.getTimelineComment(dto);
        if (rpaId && dto.userId) {
            await bitrix.api.call('rpa.timeline.add', {
                typeId: rpaTypeId,
                itemId: rpaResponse?.id,
                userId: dto.userId.toString(),
                fields: {
                    title: flowTitle,
                    description: timelineComment,
                },
            });

            if (dto.dealId) {
                await bitrix.timeline.addTimelineComment({
                    ENTITY_ID: Number(dto.dealId),
                    ENTITY_TYPE: EBXEntity.DEAL,
                    COMMENT: this.getCommentEntityMessage(
                        dto.domain,
                        rpaTypeId,
                        rpaId,
                        flowTitle,
                    ),
                    AUTHOR_ID: dto.userId.toString(),
                });
            }
        }
        return {
            // id_rpa — контракт легаси-ручки /rpa/init_supply, фронт читает его
            id_rpa: rpaId,
            rpaDb: rpaType,
            rpaTypeId,
            rpaResponse,
            dealFileFields: Object.keys(dealFileFields),
            rpaFields: this.withoutFileBlobs(rpaFields),
        };
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
