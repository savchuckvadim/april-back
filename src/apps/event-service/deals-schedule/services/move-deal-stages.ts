import { PBXService } from '@/modules/pbx/';
import { TelegramService } from '@/modules/telegram/telegram.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MoveDealStagesService {
    constructor(
        private readonly telegramService: TelegramService,
        private readonly pbx: PBXService,
    ) {}

    async moveDealStages() {
        const now = new Date();
        const timezone = 'Europe/Moscow';
        const date = new Date(
            now.toLocaleString('en-US', { timeZone: timezone }),
        );
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        await this.telegramService.sendMessage(
            `⏰ SCHEDLER MoveDealStagesService start ${hours}:${minutes}:${seconds} ${timezone}`,
        );
        const domain = 'gsr.bitrix24.ru';
        // const portals = process.env.PORTALS;
        // if (portals) {
        //     const portalList = portals.split(",").map(domain => domain.trim());

        //     for (const domain of portalList) {
        const { bitrix, portal, PortalModel } = await this.pbx.init(domain);

        const dealService = PortalModel.getDealCategoryByCode('service_base');
        if (!dealService) {
            await this.telegramService.sendMessage(
                `Not service_base for domain: ${domain}`,
            );
            return;
        }
        const results: {
            dealId: number;
            oldStage: string;
            targetStage: string;
        }[] = [];
        const stages = [
            'NEW',
            'WARM',
            'PRESENTATION',
            'DOCUMENT_SEND',
            'IN_PROSRESS',
            'MONEY_AWAIT',
        ];

        const bxStages: string[] = [];
        for (const stage of stages) {
            bxStages.push(`C${dealService.bitrixId}:${stage}`);
        }

        const filter: any = {
            STAGE_ID: bxStages,
            CATEGORY_ID: dealService.bitrixId,
        };

        const deals = await bitrix.deal.all(filter, [
            'UF_CRM_CONTRACT_END',
            'STAGE_ID',
        ]);

        await this.telegramService.sendMessage(`deals: ${deals.length}`);

        let dealsIds = '';

        for (const deal of deals) {
            const contractEnd = deal.UF_CRM_CONTRACT_END as string;
            if (!contractEnd) {
                continue;
            }

            const stageCode = this.daysStageDeal(
                this.daysUntilRenewal(contractEnd),
            );
            const targetStage = PortalModel.getStageByCode(stageCode);

            if (targetStage && !deal.STAGE_ID.includes(targetStage)) {
                dealsIds += `, ${deal.ID}`;

                results.push({
                    dealId: deal.ID,
                    oldStage: deal.STAGE_ID,
                    targetStage: targetStage,
                });
                // Move deal to new stage
                // await bitrix.deal.update(deal.ID, {
                //     STAGE_ID: `C${dealService.bitrixId}:${targetStage}`
                // });
                bitrix.batch.deal.update(deal.ID.toString(), deal.ID, {
                    STAGE_ID: `C${dealService.bitrixId}:${targetStage}`,
                });
            }
        }
        const batch = await bitrix.api.callBatch();

        if (dealsIds) {
            await this.telegramService.sendMessage(
                `nest moves deals: ${dealsIds}`,
            );
        }
        //     }
        // }
        return {
            dealsIds,
            count: deals.length,
            results,
            resultsCount: results.length,
            batch,
        };
    }

    // async crmDealAdd(data: any) {
    //     const domain = data.auth.domain;
    //     const { bitrix, portal, PortalModel } = await this.pbx.init(domain);

    //     const dealResponse = await bitrix.deal.get(data.FIELDS_AFTER.ID);
    //     const deal = dealResponse.result;
    //     const stageCode = this.daysStageDeal(
    //         this.daysUntilRenewal(deal.UF_CRM_CONTRACT_END as string)
    //     );
    //     const targetStage = PortalModel.getStageByCode(stageCode);

    //     if (targetStage) {
    //         await bitrix.deal.update(deal.ID, {
    //             STAGE_ID: `C${deal.CATEGORY_ID}:${targetStage}`
    //         });
    //     }

    //     return deal;
    // }

    // Функция для вычисления оставшихся дней до перезаключения договора
    private daysUntilRenewal(dateStr: string): number {
        // Преобразуем строку в объект Date
        const renewalDate = new Date(dateStr);

        // Получаем сегодняшнюю дату
        const today = new Date();

        // Вычисляем разницу в днях
        const timeDiff = renewalDate.getTime() - today.getTime();
        const remainingDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

        return remainingDays;
    }

    // Функция для определения стадии
    private daysStageDeal(days: number): string {
        if (days < 14) {
            return 'service_reg_two_weeks';
        } else if (days < 30) {
            return 'service_reg_one';
        } else if (days < 91) {
            return 'service_reg_three';
        } else if (days < 182) {
            return 'service_reg_six';
        } else {
            return 'service_in_work';
        }
    }
}
