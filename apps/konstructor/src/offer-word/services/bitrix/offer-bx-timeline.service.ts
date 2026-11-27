import { BxTimelinePusherService } from '@app/konstructor/bx-timeliene-pusher/bx-timeline-pusher.service';
import { toBatchSafeText } from '@lib/bitrix/consts/batch.consts';
import {
    timelineLink,
    toSafeHref,
    toTimelineComment,
} from '@lib/bitrix/consts/timeline.consts';
import { PBXService } from '@lib/pbx/pbx.service';
import { Injectable } from '@nestjs/common';
import { IResultDocumentLink } from '../../interface/document.interface';
import { diskNameToLinkText } from '../../lib/document-disk-name.util';

export interface ITimeLineSendData {
    domain: string;
    companyId: string;
    userId: number;
    documents: IResultDocumentLink[];
    dealId?: string;
    files?: [string, string][];
}

/** Сообщение об ошибке генерации для таймлайна сделки. */
export interface ITimeLineErrorData {
    domain: string;
    companyId: string;
    userId: number;
    dealId?: string;
    /**
     * Готовая строка для менеджера: что не вышло, на каком шаге и почему
     * (`describeOfferFailure(...).comment`).
     */
    reason: string;
}
@Injectable()
export class OfferBxTimelineService {
    constructor(private readonly pbx: PBXService) {}

    public async sendErrorToBitrix(data: ITimeLineErrorData) {
        const { bitrix } = await this.pbx.init(data.domain);
        const timelinePusher = new BxTimelinePusherService(bitrix);
        await timelinePusher.push(
            {
                companyId: data.companyId,
                userId: data.userId,
                // в тексте бывает ответ Битрикса со знаками «&», «+», «%»:
                // без экранирования команда пачки обрывается на них
                message: toBatchSafeText(data.reason),
                dealId: data.dealId,
            },
            true,
        );
    }

    public async sendDocumentToBitrix(data: ITimeLineSendData) {
        const { bitrix } = await this.pbx.init(data.domain);
        const commentMessage = this.getCommentMessage(data.documents);
        const timelinePusher = new BxTimelinePusherService(bitrix);
        await timelinePusher.push({
            companyId: data.companyId,
            userId: data.userId,
            message: commentMessage,
            dealId: data.dealId,
            files: data.files,
        });
    }

    /**
     * Комментарий уходит пачкой (batch), поэтому собирается через
     * {@link toTimelineComment}: он склеивает строки переносом и один раз
     * экранирует `%`, `+`, `&`, `#`. Закодированный адрес Диска
     * (`%D0%9A…`) доезжает до карточки таким же, а `&` и `+` из названия
     * комплекта не обрывают команду и не превращаются в пробел.
     */
    private getCommentMessage(documents: IResultDocumentLink[]) {
        return toTimelineComment(
            documents.map(document => this.getDocumentMessage(document)),
        );
    }

    /**
     * Адрес ссылки — `DETAIL_URL` файла на Диске, кодируется
     * {@link toSafeHref}: Битрикс отдаёт его с кириллицей, а пробелы в нём
     * оборвали бы ссылку. Читаемое название — только текст внутри `<a>`:
     * из имени на Диске, а без него из подписи документа.
     */
    private getDocumentMessage(document: IResultDocumentLink) {
        const icon = document.type === 'offer' ? '📝' : '🧾';
        const text =
            (document.diskName && diskNameToLinkText(document.diskName)) ||
            document.name;
        return `${icon} ${timelineLink(toSafeHref(document.link), text)}`;
    }
}
