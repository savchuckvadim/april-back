import { Injectable } from '@nestjs/common';
import { InitSupplyService } from './init-supply.service';
import { InitSupplyDto } from './dto/init-supply.dto';
import { InitSupplyTimelineCommentService } from './services/rpa-timeline-comment/init-supply-timeline-comment.service';
import { InitSupplyRpaFieldsService } from './services/rpa-fields/init-supply-rpa-fields.service';
import { PBXService } from '@/modules/pbx/pbx.service';
import { IBxRpaItem } from '@/modules/bitrix/domain/rpa/item/interface/bx-rpa-item.interface';
import {
    EBXEntity,
    EBxMethod,
    EBxNamespace,
    IBXTimelineComment,
} from '@/modules/bitrix';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { TelegramService } from '@/modules/telegram/telegram.service';

@Injectable()
export class InitSupplyUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly initSupplyService: InitSupplyService,
        private readonly initSupplyRpaFieldsService: InitSupplyRpaFieldsService,
        private readonly initSupplyTimelineCommentService: InitSupplyTimelineCommentService,
    ) { }

    async initSupply(dto: InitSupplyDto): Promise<any> {
        /*
         1. получаем данные из smart - или из сделки
         2. Создаем или обновляем rpa
        **/
        // return  await this.initSupplyService.initSupply(data);
        const { bitrix, PortalModel } = await this.pbx.init(dto.domain);
        const rpaType = PortalModel.getRpaByCode('supply');
        const rpaTypeId = rpaType?.bitrixId;
        if (!rpaTypeId) {
            throw new Error('Rpa type id not found');
        }

        let rpaResponse: IBxRpaItem | null = null;
        let rpaTimelineResponse: IBXTimelineComment | null = null;
        const rpaFields = await this.initSupplyRpaFieldsService.getRpaFields(
            dto,
            PortalModel,
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

        const timelineComment =
            await this.initSupplyTimelineCommentService.getTimelineComment(
                dto,
                PortalModel,
            );
        if (rpaId && dto.userId) {
            rpaTimelineResponse = await bitrix.api.call('rpa.timeline.add', {
                typeId: rpaTypeId,
                itemId: rpaResponse?.id,
                userId: dto.userId.toString(),
                fields: {
                    title: 'Перезаключение',
                    description: timelineComment,
                },
            });

            dto.dealId &&
                (await bitrix.timeline.addTimelineComment({
                    ENTITY_ID: Number(dto.dealId),
                    ENTITY_TYPE: EBXEntity.DEAL,
                    COMMENT: this.getCommentEntityMessage(
                        dto.domain,
                        rpaTypeId,
                        rpaId,
                    ),
                    AUTHOR_ID: dto.userId.toString(),
                }));
        }
        return {
            rpaDb: rpaType,
            rpaTypeId,
            rpaResponse,

            rpaFields,
        };
    }

    private getCommentEntityMessage(
        domain: string,
        rpaTypeId: number,
        rpaId: number,
    ) {
        const link = `https://${domain}/rpa/item/${rpaTypeId}/${rpaId}/`;
        const message = `📝 <a href="${link}"  target="_blank">Перезаключение</a>`;
        return message;
    }
}
