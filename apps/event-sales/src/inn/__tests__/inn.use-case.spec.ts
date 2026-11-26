import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { InnLegacyFields } from '@lib/portal-lib/pbx-inn';
import { InnUseCase } from '../use-cases/inn.use-case';
import { OpenCardOnceGuard } from '../../shared/open-card-once';
import { InnLegacyFieldsResolver } from '../services/inn-legacy-fields.resolver';

/** Страж «недавно делали» — всегда пропускает: его правила проверены отдельно. */
const ONCE = {
    isRecent: () => Promise.resolve(false),
    remember: () => Promise.resolve(),
} as unknown as OpenCardOnceGuard;

/** Настройка старых полей ИНН портала — заглушка сервиса настроек. */
const legacyOf = (fields: InnLegacyFields = {}): InnLegacyFieldsResolver =>
    ({
        resolve: () => Promise.resolve(fields),
    }) as unknown as InnLegacyFieldsResolver;

const NO_LEGACY = legacyOf();

const INN = '7707083893';

type Row = Record<string, unknown>;

const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_inn'
            ? { bitrixId: 'OP_INN' }
            : code === 'op_inn_pool'
              ? { bitrixId: 'OP_INN_POOL' }
              : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
};

interface ICall {
    method: string;
    params: Row;
}

/** PBXService-заглушка: отдаёт инстанс Битрикса по домену, как на бою. */
function makePbx(
    deal: Row | null,
    company: Row = { ID: '55', TITLE: 'ООО «Ромашка»' },
): {
    pbx: never;
    calls: ICall[];
    domains: string[];
} {
    const calls: ICall[] = [];
    const domains: string[] = [];
    const rows: Record<string, unknown> = {
        'crm.deal.get': deal,
        'crm.company.get': company,
        'crm.deal.contact.items.get': [],
        'crm.timeline.comment.list': [],
        'user.get': [{ ID: '12', NAME: 'Иван', LAST_NAME: 'Иванов' }],
    };
    const bitrix = {
        api: {
            call: (method: string, params: Row): Promise<unknown> => {
                calls.push({ method, params });
                return Promise.resolve({ result: rows[method] ?? [] });
            },
        },
        user: {
            get: (): Promise<unknown> =>
                Promise.resolve({ result: rows['user.get'] }),
        },
        requisite: {
            getList: (): Promise<unknown> => Promise.resolve({ result: [] }),
        },
        requisiteLink: {
            getList: (): Promise<unknown> => Promise.resolve({ result: [] }),
        },
        requisitePreset: {
            getList: (): Promise<unknown> => Promise.resolve({ result: [] }),
        },
    };
    const pbx = {
        init: (domain: string): Promise<unknown> => {
            domains.push(domain);
            return Promise.resolve({ bitrix, PortalModel: portal });
        },
    };
    return { pbx: pbx as never, calls, domains };
}

describe('InnUseCase', () => {
    const DOMAIN = 'portal.bitrix24.ru';

    it('снимок берёт инстанс Битрикса по домену запроса', async () => {
        const { pbx, domains } = makePbx({ ID: '100', COMPANY_ID: '55' });
        const useCase = new InnUseCase(pbx, ONCE, NO_LEGACY);

        const snapshot = await useCase.snapshot(100, DOMAIN);

        expect(domains).toEqual([DOMAIN]);
        expect(snapshot.dealId).toBe(100);
    });

    it('сделки нет — 404 вместо пустого ответа', async () => {
        const { pbx } = makePbx(null);
        const useCase = new InnUseCase(pbx, ONCE, NO_LEGACY);

        await expect(useCase.snapshot(100, DOMAIN)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('устаревшая версия снимка — 409', async () => {
        const { pbx } = makePbx({ ID: '100', COMPANY_ID: '55' });
        const useCase = new InnUseCase(pbx, ONCE, NO_LEGACY);

        await expect(
            useCase.choose(100, {
                domain: DOMAIN,
                inn: INN,
                version: 'stale',
                userId: 12,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('закрытая сделка — 409 на попытку выбрать', async () => {
        const { pbx } = makePbx({ ID: '100', COMPANY_ID: '55', CLOSED: 'Y' });
        const useCase = new InnUseCase(pbx, ONCE, NO_LEGACY);
        const snapshot = await useCase.snapshot(100, DOMAIN);

        await expect(
            useCase.choose(100, {
                domain: DOMAIN,
                inn: INN,
                version: snapshot.version,
                userId: 12,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('невалидный ИНН — 400', async () => {
        const { pbx } = makePbx({ ID: '100', COMPANY_ID: '55' });
        const useCase = new InnUseCase(pbx, ONCE, NO_LEGACY);

        await expect(
            useCase.choose(100, {
                domain: DOMAIN,
                inn: '12345',
                version: 'any',
                userId: 12,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    /*
     * Подпись «кто выбрал» берём у портала, а не у фронта: запись аудита
     * должна быть достоверной.
     */
    it('имя автора подставляется из портала', async () => {
        const { pbx, calls } = makePbx({ ID: '100', COMPANY_ID: '55' });
        const useCase = new InnUseCase(pbx, ONCE, NO_LEGACY);
        const snapshot = await useCase.snapshot(100, DOMAIN);

        const after = await useCase.choose(100, {
            domain: DOMAIN,
            inn: INN,
            version: snapshot.version,
            userId: 12,
        });

        expect(after.current?.userName).toBe('Иванов Иван');
        const comment = calls.find(
            call => call.method === 'crm.timeline.comment.add',
        );
        expect(String((comment?.params.fields as Row).COMMENT)).toContain(
            'Иванов Иван (#12)',
        );
    });

    /*
     * gsirk 26.11.2026, сделка 281275: ИНН есть только в своём поле портала
     * «ИНН (new)». Поле выбрано в настройке — вкладка видит его на лету.
     */
    describe('старые поля портала (настройка inn_legacy_fields_*)', () => {
        const LEGACY_DEAL_FIELD = 'UF_CRM_1695372881';
        const LEGACY_COMPANY_FIELD = 'UF_CRM_1400482437';
        const GSIRK_INN = '4205220212';
        const SECOND_INN = '420536405891';

        it('ИНН из старого поля сделки — вариант «из карточки сделки» и текущий', async () => {
            const { pbx } = makePbx({
                ID: '100',
                COMPANY_ID: '55',
                [LEGACY_DEAL_FIELD]: GSIRK_INN,
            });
            const useCase = new InnUseCase(
                pbx,
                ONCE,
                legacyOf({ deal: [LEGACY_DEAL_FIELD] }),
            );

            const snapshot = await useCase.snapshot(100, DOMAIN);

            const candidate = snapshot.candidates.find(
                item => item.inn === GSIRK_INN,
            );
            expect(candidate?.label).toBe('из карточки сделки');
            // текущий пуст в сделке и компании, ИНН в старых полях один
            expect(snapshot.current?.inn).toBe(GSIRK_INN);
        });

        it('без настройки старое поле не читается', async () => {
            const { pbx } = makePbx({
                ID: '100',
                COMPANY_ID: '55',
                [LEGACY_DEAL_FIELD]: GSIRK_INN,
            });
            const useCase = new InnUseCase(pbx, ONCE, NO_LEGACY);

            const snapshot = await useCase.snapshot(100, DOMAIN);

            expect(snapshot.candidates).toEqual([]);
            expect(snapshot.current).toBeNull();
        });

        it('два ИНН в старом поле компании — два варианта, текущий не ставится', async () => {
            const { pbx } = makePbx(
                { ID: '100', COMPANY_ID: '55' },
                {
                    ID: '55',
                    TITLE: 'ООО «Ромашка»',
                    [LEGACY_COMPANY_FIELD]: `${GSIRK_INN}, ${SECOND_INN}`,
                },
            );
            const useCase = new InnUseCase(
                pbx,
                ONCE,
                legacyOf({ company: [LEGACY_COMPANY_FIELD] }),
            );

            const snapshot = await useCase.snapshot(100, DOMAIN);

            expect(snapshot.candidates.map(item => item.inn).sort()).toEqual(
                [GSIRK_INN, SECOND_INN].sort(),
            );
            expect(snapshot.current).toBeNull();
        });
    });
});
