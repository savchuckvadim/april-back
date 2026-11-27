import type { PBXService } from '@lib/pbx/pbx.service';
import { OfferBxTimelineService } from '../offer-bx-timeline.service';

const setup = () => {
    const addTimelineComment = jest.fn<void, [string, { COMMENT: string }]>();
    const callBatchWithConcurrency = jest.fn().mockResolvedValue(undefined);
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                batch: { timeline: { addTimelineComment } },
                api: { callBatchWithConcurrency },
            },
        }),
    } as unknown as PBXService;
    return {
        service: new OfferBxTimelineService(pbx),
        addTimelineComment,
        callBatchWithConcurrency,
    };
};

describe('OfferBxTimelineService.sendErrorToBitrix', () => {
    it('в сделку уходит причина под значком ошибки', async () => {
        const { service, addTimelineComment, callBatchWithConcurrency } =
            setup();

        await service.sendErrorToBitrix({
            domain: 'gsirk.bitrix24.ru',
            companyId: '3',
            userId: 6,
            dealId: '281275',
            reason: 'КП не сформировано: загрузка на Диск — Битрикс ответил «Не удалось сохранить файл» (DISK_FOLDER_22002). Повторите формирование.',
        });

        expect(addTimelineComment).toHaveBeenCalledTimes(1);
        expect(addTimelineComment).toHaveBeenCalledWith(
            expect.stringContaining('_add_timeline_deal_281275'),
            {
                ENTITY_ID: '281275',
                ENTITY_TYPE: 'deal',
                AUTHOR_ID: '6',
                COMMENT:
                    '❌ КП не сформировано: загрузка на Диск — Битрикс ответил «Не удалось сохранить файл» (DISK_FOLDER_22002). Повторите формирование.',
            },
        );
        expect(callBatchWithConcurrency).toHaveBeenCalledWith(1);
    });

    it('«&», «+» и «%» из ответа Битрикса экранируются: команда пачки не обрывается', async () => {
        const { service, addTimelineComment } = setup();

        await service.sendErrorToBitrix({
            domain: 'gsirk.bitrix24.ru',
            companyId: '3',
            userId: 6,
            dealId: '281275',
            reason: 'КП не сформировано: Битрикс ответил «Лимит 100% & 5+ файлов #1»',
        });

        const data = addTimelineComment.mock.calls[0][1] as { COMMENT: string };
        expect(data.COMMENT).toBe(
            '❌ КП не сформировано: Битрикс ответил «Лимит 100%25 %26 5%2B файлов %231»',
        );
    });
});

/**
 * Комментарий уходит пачкой: значение поля `COMMENT` Битрикс декодирует из
 * query-строки один раз. Здесь это снято так же, как на стороне портала.
 */
const bitrixSees = (batchValue: string): string =>
    decodeURIComponent(batchValue.replace(/\+/g, ' '));

const hrefOf = (comment: string): string =>
    /href="([^"]*)"/.exec(comment)?.[1] ?? '';

const textOf = (comment: string): string =>
    />([^<]*)<\/a>/.exec(comment)?.[1] ?? '';

const DISK_BASE =
    'https://april-garant.bitrix24.ru/workgroups/group/28/disk/file/38050';

const CYRILLIC = /[А-Яа-яЁё]/;

const sendOf = async (
    documents: Array<{
        link: string;
        name: string;
        type: 'offer' | 'invoice';
        diskName?: string;
    }>,
) => {
    const ctx = setup();
    await ctx.service.sendDocumentToBitrix({
        domain: 'april-garant.bitrix24.ru',
        companyId: '3',
        userId: 6,
        dealId: '281275',
        documents,
    });
    const [, data] = ctx.addTimelineComment.mock.calls[0];
    return { ...ctx, batchComment: data.COMMENT };
};

describe('OfferBxTimelineService.sendDocumentToBitrix', () => {
    it('КП: адрес без пробелов и сырой кириллицы, текст ссылки читаемый', async () => {
        const diskUrl = `${DISK_BASE}/КП_Гарант-Юрист_Интернет_1_ОД.docx`;
        const { batchComment } = await sendOf([
            {
                link: diskUrl,
                name: 'КП Гарант-Юрист - Интернет 1 ОД',
                type: 'offer',
                diskName: 'КП_Гарант-Юрист_Интернет_1_ОД',
            },
        ]);

        const comment = bitrixSees(batchComment);
        const href = hrefOf(comment);
        expect(href).not.toMatch(/\s/);
        expect(href).not.toMatch(CYRILLIC);
        expect(decodeURI(href)).toBe(diskUrl);
        expect(textOf(comment)).toBe('КП Гарант-Юрист Интернет 1 ОД');
        expect(comment.startsWith('📝 <a href="')).toBe(true);
    });

    it('адрес с пробелами (старые имена Диска) тоже кодируется: ссылка не рвётся', async () => {
        const spaced = `${DISK_BASE}/КП Гарант-Юрист - Интернет 1 ОД.docx`;
        const { batchComment } = await sendOf([
            { link: spaced, name: 'КП Юрист', type: 'offer' },
        ]);

        const href = hrefOf(bitrixSees(batchComment));
        expect(href).not.toMatch(/\s/);
        expect(decodeURI(href)).toBe(spaced);
    });

    it('счёт: иконка счёта, текст «Счёт <номер>»', async () => {
        const diskUrl = `${DISK_BASE}/Счёт_311-5527.pdf`;
        const { batchComment } = await sendOf([
            {
                link: diskUrl,
                name: 'Счёт Гарант-Юрист - Интернет 1 ОД',
                type: 'invoice',
                diskName: 'Счёт_311-5527',
            },
        ]);

        const comment = bitrixSees(batchComment);
        expect(comment.startsWith('🧾 ')).toBe(true);
        expect(textOf(comment)).toBe('Счёт 311-5527');
        expect(decodeURI(hrefOf(comment))).toBe(diskUrl);
    });

    it('% закодированного адреса экранируется для пачки: до карточки адрес доезжает закодированным один раз', async () => {
        const { batchComment } = await sendOf([
            {
                link: `${DISK_BASE}/КП_Юрист.docx`,
                name: 'КП',
                type: 'offer',
                diskName: 'КП_Юрист',
            },
        ]);

        // в команде пачки %25D0…: Битрикс раскодирует его в %D0…, а не в кириллицу
        expect(batchComment).toContain('%25D0%259A');
        expect(hrefOf(batchComment)).not.toMatch(CYRILLIC);
        expect(hrefOf(bitrixSees(batchComment))).toContain('%D0%9A');
    });

    it('документы идут строками через перенос, без сырого символа переноса', async () => {
        const { batchComment } = await sendOf([
            {
                link: `${DISK_BASE}/КП_Юрист.docx`,
                name: 'КП Юрист',
                type: 'offer',
                diskName: 'КП_Юрист',
            },
            {
                link: `${DISK_BASE}/Счёт_5.docx`,
                name: 'Счёт',
                type: 'invoice',
                diskName: 'Счёт_5',
            },
        ]);

        expect(batchComment).not.toContain('\n');
        const lines = bitrixSees(batchComment).split('\n');
        expect(lines).toHaveLength(2);
        expect(textOf(lines[0])).toBe('КП Юрист');
        expect(textOf(lines[1])).toBe('Счёт 5');
        // перенос один раз: ручной «%0A» поверх экранирования дал бы «%250A»
        expect(batchComment).not.toContain('%250A');
    });

    it('имени на Диске нет (запасной путь) — текстом служит подпись документа', async () => {
        const serverLink = 'https://april-online.ru/api/files/abc123';
        const { batchComment } = await sendOf([
            {
                link: serverLink,
                name: 'КП Гарант-Юрист - Интернет 1 ОД',
                type: 'offer',
            },
        ]);

        const comment = bitrixSees(batchComment);
        expect(hrefOf(comment)).toBe(serverLink);
        expect(textOf(comment)).toBe('КП Гарант-Юрист - Интернет 1 ОД');
    });

    it('«+», «&» и «#» из подписи не рвут команду пачки', async () => {
        const { batchComment } = await sendOf([
            {
                link: 'https://april-online.ru/api/files/abc123',
                name: 'КП Гарант-Классик+ & Партнёры #1',
                type: 'offer',
            },
        ]);

        expect(batchComment).not.toMatch(/[+&#]/);
        expect(textOf(bitrixSees(batchComment))).toBe(
            'КП Гарант-Классик+ & Партнёры #1',
        );
    });

    it('комментарий уходит и в компанию, и в сделку одной пачкой', async () => {
        const { addTimelineComment, callBatchWithConcurrency } = await sendOf([
            {
                link: `${DISK_BASE}/КП_Юрист.docx`,
                name: 'КП Юрист',
                type: 'offer',
                diskName: 'КП_Юрист',
            },
        ]);

        expect(addTimelineComment).toHaveBeenCalledTimes(2);
        expect(callBatchWithConcurrency).toHaveBeenCalledTimes(1);
        expect(callBatchWithConcurrency).toHaveBeenCalledWith(1);
    });
});
