
import { BitrixService } from "src/modules/bitrix";
import { DealValue } from "./deal-helper/deal-values-helper.service";
import { BitrixEntityType } from "../use-cases/create-deal.use-case";




export class BxDealService {
    private bitrix: BitrixService
    constructor(

    ) { }

    async init(bitrix: BitrixService) {
        this.bitrix = bitrix;
    }

    async getDeal(dealId: number, select: string[] = []) {
        const response = await this.bitrix.deal.get(Number(dealId), select)
        const deal = response.result

        return deal
    }

    async setTimeline(dealId: number, dealValues: DealValue[]) {
        const comment = this.getComment(dealValues)

        await this.setTimelineComment(dealId, comment)
    }
    getComment(dealValues: DealValue[]) {
        const participants = this.getParticipants(dealValues)
        const info = this.getInfo(dealValues)
        let comment = `${info}\n`
        for (const participant in participants) {
            comment += participants[participant] + "\n \n"
        }

        return comment
    }
    getParticipants(dealValues: DealValue[]) {
        let participants = {

        } as Record<string, string>
        dealValues.forEach((value) => {
            if (value.name.includes('Участник') && value.value && value.value !== '0') {
                
                for (let i = 1; i <= 11; i++) {
                    const key = `Участник ${i}`
                    if (i === 1) {
                        if (value.name.includes(key) && !value.name.includes("10") && value.value) {
                            if (!participants[i]) participants[i] = "👤[B]" + key + "[/B] \n"
                            participants[i] += "[B]" + value.name + ":[/B] " + value.value + " \n"
                        }
                    } else {
                        if (value.name.includes(key) && value.value) {
                            if (!participants[i]) participants[i] = "👤[B]" + key + "[/B] \n"
                            participants[i] += "[B]" + value.name + ":[/B] " + value.value + " \n"
                        }
                    }

                }
            }
        })
        return participants
    }
    getInfo(dealValues: DealValue[]) {
        let info = '';
        dealValues.forEach((value) => {
            if (!value.name.includes('Участник')) {
                if (value.value) {
                    if (!info) info = "💡[B]" + "Информация" + "[/B] \n"
                    info += "[B]" + value.name + ":[/B] " + value.value + " \n"
                }
            }
        })
        return info
    }
    async setTimelineComment(dealId: number, comment: string) {
        await this.bitrix.timeline.addTimelineComment({
            ENTITY_TYPE: BitrixEntityType.DEAL,
            ENTITY_ID: dealId,
            COMMENT: comment,
            AUTHOR_ID: '502'
        })
    }
}