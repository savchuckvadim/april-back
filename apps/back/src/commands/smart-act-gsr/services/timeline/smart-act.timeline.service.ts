import { BitrixEntityType, BitrixService } from '@/modules/bitrix';
import { formatRuCalendarDateTimeZone } from '@/shared/lib/';
import { ETimeZone } from '@/shared/lib/utils/date-convert.util';

export class SmartActTimelineChangeContractStartService {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly fromDate: string,
        private readonly toDate: string,
        private readonly dealId: number,
        private readonly userId: number,
    ) {}

    public async execute(): Promise<void> {
        const comment = this.getComment();
        await this.addTimelineComment(comment);
    }

    private getComment(): string {
        const fromRuMsk = formatRuCalendarDateTimeZone(
            this.fromDate,
            ETimeZone.EUROPE_MOSCOW,
        );
        const toRuMsk = formatRuCalendarDateTimeZone(
            this.toDate,
            ETimeZone.EUROPE_MOSCOW,
        );
        const commentMessage =
            '⚠️ Дата начала договора сдвинута на месяц вперёд под срок лицензии по товару. \n' +
            `Изменено с <b>${fromRuMsk}</b> на <b>${toRuMsk}</b>.\n` +
            'Проверьте сделку и акты.';
        return commentMessage;
    }
    private async addTimelineComment(comment: string): Promise<void> {
        await this.bitrix.timeline.addTimelineComment({
            ENTITY_TYPE: BitrixEntityType.DEAL,
            ENTITY_ID: this.dealId,
            COMMENT: comment,
            AUTHOR_ID: this.userId.toString(),
        });
    }
}
