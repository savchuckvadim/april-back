import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { TmcPresentationApprovedDto } from '../dto/tmc-presentation-approved.dto';
import { parseCrmEntityId } from '../lib/crm-entity-id.util';
import { normalizeApprovedPresentation } from '../lib/approved-presentation-flow-dto.builder';

/**
 * Параметры робота проходят глобальный ValidationPipe приложения (те же
 * опции, что в bootstrap): id сущностей CRM принимаются и голыми, и с
 * префиксом привязки, пустые — как «не передано», лишние параметры робота
 * отбрасываются, блок `auth` исходящего вебхука сохраняет домен.
 */
const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    forbidUnknownValues: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
});

const robotRequest = {
    commentOwner: '',
    commentTMC: 'Директор ждёт показ',
    commentManager: '',
    deadline: '05.11.2026 12:29:00',
    name: 'Заявка 123  от 05.11.2026 14:29:16',
    ownerId: 'user_1',
    managerId: 'user_187',
    tmcId: 'user_187',
    tmcDealId: '216773',
    companyId: '95857',
    contactId: '',
    contactName: 'Иванов Иван',
    auth: {
        domain: 'gsr.bitrix24.ru',
        member_id: 'abc',
        application_token: 'secret',
    },
    document_id: [
        'rpa',
        'Bitrix\\Rpa\\Integration\\Bizproc\\Document\\Item',
        '1211',
    ],
};

const validate = (value: Record<string, unknown>) =>
    pipe.transform(value, {
        type: 'body',
        metatype: TmcPresentationApprovedDto,
    }) as Promise<TmcPresentationApprovedDto>;

describe('TmcPresentationApprovedDto через ValidationPipe приложения', () => {
    it('запрос робота проходит: id числами, пустой контакт не передан, лишнее отброшено, домен из auth', async () => {
        const dto = await validate(robotRequest);

        expect(dto.tmcDealId).toBe(216773);
        expect(dto.companyId).toBe(95857);
        expect(dto.contactId).toBeUndefined();
        expect(dto.managerId).toBe('user_187');
        expect(dto.auth?.domain).toBe('gsr.bitrix24.ru');
        expect(dto).not.toHaveProperty('contactName');
        expect(dto).not.toHaveProperty('document_id');
    });

    it('привязки с префиксом (D_, CO_, C_) и id числом — тоже проходят', async () => {
        const dto = await validate({
            ...robotRequest,
            tmcDealId: 'D_216773',
            companyId: 'CO_95857',
            contactId: 48223,
        });

        expect(dto.tmcDealId).toBe(216773);
        expect(dto.companyId).toBe(95857);
        expect(dto.contactId).toBe(48223);
    });

    it('мусор в id — «не передано»: сервис отвечает 400 с понятным текстом, а не тихим нулём', async () => {
        const dto = await validate({
            ...robotRequest,
            tmcDealId: 'Сделка #216773',
        });

        expect(dto.tmcDealId).toBeUndefined();
        expect(() => normalizeApprovedPresentation(dto)).toThrow(/ТМЦ-сделка/);
    });
});

describe('parseCrmEntityId', () => {
    it('голый id, строка, префикс сущности, массив; пусто и мусор — undefined', () => {
        expect(parseCrmEntityId(216773)).toBe(216773);
        expect(parseCrmEntityId(' 216773 ')).toBe(216773);
        expect(parseCrmEntityId('CO_95857')).toBe(95857);
        expect(parseCrmEntityId(['D_5'])).toBe(5);
        expect(parseCrmEntityId('')).toBeUndefined();
        expect(parseCrmEntityId('0')).toBeUndefined();
        expect(parseCrmEntityId('abc')).toBeUndefined();
        expect(parseCrmEntityId('12abc')).toBeUndefined();
        expect(parseCrmEntityId(null)).toBeUndefined();
    });
});
