import { PBXService } from '@lib/pbx/pbx.service';
import {
    findSmartItemField,
    PbxSmartItemFieldsService,
} from '../pbx-smart-item-fields.service';

/**
 * Живые поля элемента смарта: «UF-имя ↔ фактический camel-ключ ↔ элементы
 * списка» одним вызовом crm.item.fields. Имя формулой не собираем никогда
 * (боевой инцидент UF_CRM_94_TRANSCRIPT_1) — читаем у самого Битрикса.
 */
const RESPONSE = {
    result: {
        fields: {
            // Штатное поле: upperName у него нет — якорем анкеты быть не может.
            title: { type: 'string', title: 'Название' },
            // Фактический ключ РАСХОДИТСЯ с формулой от UF-имени.
            ufCrm8Transcript1: {
                upperName: 'UF_CRM_8_TRANSCRIPT',
                type: 'string',
                title: 'Расшифровка',
                isMultiple: false,
            },
            ufCrm8Source: {
                upperName: 'UF_CRM_8_SOURCE',
                type: 'enumeration',
                title: 'Откуда узнали',
                isMultiple: true,
                items: [
                    { ID: '701', VALUE: 'Сайт' },
                    { ID: 702, VALUE: 'Реклама' },
                    // Мусор без идентификатора в список не попадает.
                    { VALUE: 'Без id' },
                ],
            },
        },
    },
};

const makeHarness = (over?: { response?: unknown; fail?: boolean }) => {
    const calls: Array<number | string> = [];
    const bitrix = {
        item: {
            fields: (entityTypeId: number | string) => {
                calls.push(entityTypeId);
                if (over?.fail) return Promise.reject(new Error('нет прав'));
                return Promise.resolve(
                    over?.response === undefined ? RESPONSE : over.response,
                );
            },
        },
    };
    const pbx = {
        init: () => Promise.resolve({ bitrix }),
    } as unknown as PBXService;

    return { service: new PbxSmartItemFieldsService(pbx), calls };
};

describe('PbxSmartItemFieldsService', () => {
    it('поле находится по UF-имени и отдаёт ФАКТИЧЕСКИЙ camel-ключ', async () => {
        const { service } = makeHarness();
        const fields = await service.resolveFields('x.bitrix24.ru', 1040);

        const field = findSmartItemField(fields!, 'UF_CRM_8_TRANSCRIPT');
        expect(field?.key).toBe('ufCrm8Transcript1');
        expect(field?.type).toBe('string');
        expect(field?.isMultiple).toBe(false);
    });

    it('элементы списка приезжают числовыми id (их и ждёт Битрикс)', async () => {
        const { service } = makeHarness();
        const fields = await service.resolveFields('x.bitrix24.ru', 1040);

        const field = findSmartItemField(fields!, 'UF_CRM_8_SOURCE');
        expect(field?.isMultiple).toBe(true);
        expect(field?.items).toEqual([
            { id: 701, value: 'Сайт' },
            { id: 702, value: 'Реклама' },
        ]);
    });

    it('штатные поля (без UF-имени) якорем анкеты не становятся', async () => {
        const { service } = makeHarness();
        const fields = await service.resolveFields('x.bitrix24.ru', 1040);

        expect(Object.keys(fields!.byNormalizedName)).toHaveLength(2);
        expect(findSmartItemField(fields!, 'title')).toBeUndefined();
    });

    it('второй запрос по тому же смарту идёт из кэша', async () => {
        const { service, calls } = makeHarness();
        await service.resolveFields('x.bitrix24.ru', 1040);
        await service.resolveFields('x.bitrix24.ru', 1040);

        expect(calls).toEqual([1040]);
    });

    it('разные смарты кэшируются раздельно', async () => {
        const { service, calls } = makeHarness();
        await service.resolveFields('x.bitrix24.ru', 1040);
        await service.resolveFields('x.bitrix24.ru', 1038);

        expect(calls).toEqual([1040, 1038]);
    });

    it('сброс кэша домена заставляет перечитать', async () => {
        const { service, calls } = makeHarness();
        await service.resolveFields('x.bitrix24.ru', 1040);
        service.invalidate('x.bitrix24.ru');
        await service.resolveFields('x.bitrix24.ru', 1040);

        expect(calls).toEqual([1040, 1040]);
    });

    it('не прочитали — null, и он тоже кэшируется (fail-open)', async () => {
        const { service, calls } = makeHarness({ fail: true });

        expect(await service.resolveFields('x.bitrix24.ru', 1040)).toBeNull();
        expect(await service.resolveFields('x.bitrix24.ru', 1040)).toBeNull();
        expect(calls).toEqual([1040]);
    });

    it('пустой ответ — пустая карта, а не падение', async () => {
        const { service } = makeHarness({ response: {} });
        const fields = await service.resolveFields('x.bitrix24.ru', 1040);

        expect(fields).toEqual({ entityTypeId: 1040, byNormalizedName: {} });
    });
});
