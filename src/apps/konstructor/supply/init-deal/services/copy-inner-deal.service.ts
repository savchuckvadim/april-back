import { APIOnlineClient } from "@/clients/online";
import { PrismaService } from "@/core/prisma/prisma.service";
import { TelegramService } from "@/modules/telegram/telegram.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class CopyInnerDealService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly telegram: TelegramService
    ) { }

    public async copyInnerDeal(serviceSmartId: number, newDealId: number, domain: string) {
        const deal = await this.prisma.bxDocumentDeal.findFirst({
            where: {
                serviceSmartId,
                domain
            },
        });
       
        if (!deal) {
            await this.telegram.sendMessage(
                `Сделка с таким serviceSmartId не найдена: ${domain} ${serviceSmartId}`,
            )
            return
        }

        const {
            id,
            dealId,
            serviceSmartId: _,
            created_at,
            updated_at,
            ...rest
        } = deal;

        const newDeal = await this.prisma.bxDocumentDeal.create({
            data: {
                ...rest,
                dealId: newDealId,
                serviceSmartId: null,
                domain: deal.domain,
                portalId: deal.portalId,
                // created_at и updated_at НЕ указываем — проставятся автоматически
            },
        });

        await this.telegram.sendMessage(
            `Сделка скопирована: ${domain} ${serviceSmartId}`,
        )
        await this.telegram.sendMessage(
            JSON.stringify(newDeal),
        )
        return newDeal;
    }
}