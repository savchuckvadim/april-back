import { SmartLinkLoader } from '../domain/loaders/smart-link.loader';

/**
 * Ссылки на карточки разборов берутся по АКТИВНОЙ записи agent-analysis
 * (после переразбора старая — superseded, report_item_id скопирован в новую).
 */
const DOMAIN = 'gsr.bitrix24.ru';

const record = (
    id: string,
    transcriptionId: string,
    status: string,
    reportItemId: string,
    type = 'agent-analysis',
) => ({
    id,
    type,
    status,
    transcription_id: transcriptionId,
    report_item_id: reportItemId,
});

function makeLoader(records: unknown[], entityTypeId: number | null = 1050) {
    const aicallSmart = {
        resolveInfo: jest
            .fn()
            .mockResolvedValue(entityTypeId === null ? null : { entityTypeId }),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue(records),
    };
    return {
        loader: new SmartLinkLoader(aicallSmart as never, aiService as never),
        aiService,
    };
}

describe('SmartLinkLoader', () => {
    it('старая superseded + новая активная → ссылка по активной; без карточки и чужой тип — null', async () => {
        const { loader } = makeLoader([
            record('1', 't-1', 'superseded', '100'),
            record('2', 't-1', 'done', '100'),
            record('3', 't-2', 'done', ''),
            record('4', 't-3', 'done', '77', 'call-classify'),
        ]);
        const links = await loader.resolveLinks(DOMAIN, ['t-1', 't-2', 't-3']);
        expect(links.get('t-1')).toBe(
            `https://${DOMAIN}/crm/type/1050/details/100/`,
        );
        expect(links.get('t-2')).toBeNull();
        expect(links.get('t-3')).toBeNull();
    });

    it('только замещённая запись — ссылки нет; смарт не установлен — все null без чтения ais', async () => {
        const superseded = makeLoader([
            record('1', 't-1', 'superseded', '100'),
        ]);
        expect(
            (await superseded.loader.resolveLinks(DOMAIN, ['t-1'])).get('t-1'),
        ).toBeNull();

        const noSmart = makeLoader([record('2', 't-1', 'done', '100')], null);
        expect(
            (await noSmart.loader.resolveLinks(DOMAIN, ['t-1'])).get('t-1'),
        ).toBeNull();
        expect(noSmart.aiService.findByTranscriptionIds).not.toHaveBeenCalled();
    });
});
