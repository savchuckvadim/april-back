import { composeInnSnapshot, IInnComposeInput } from '../inn-snapshot.composer';
import { InnFieldMap } from '../inn-fields';
import {
    IInnRequisiteCard,
    INN_AUDIT_ACTIONS,
    INN_CONFLICT_KINDS,
    INN_ORIGINS,
    INN_SOURCE_KINDS,
} from '../../type/inn.type';

const INN = '7707083893';
const OTHER = '7812032055';

/** Портал, где поля ИНН установлены на всех сущностях. */
const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_inn'
            ? { bitrixId: 'OP_INN' }
            : code === 'op_inn_pool'
              ? { bitrixId: 'OP_INN_POOL' }
              : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
} as never;

const fields = InnFieldMap.from(portal);

const requisite = (
    patch: Partial<IInnRequisiteCard> = {},
): IInnRequisiteCard => ({
    id: 812,
    ownerType: 'company',
    ownerId: 55,
    ownerTitle: 'ООО «Ромашка»',
    name: 'Организация',
    presetId: 1,
    presetName: 'Организация',
    inn: INN,
    kpp: '770701001',
    companyName: 'ООО «Ромашка»',
    linked: true,
    otherDealIds: [],
    ...patch,
});

const input = (patch: Partial<IInnComposeInput> = {}): IInnComposeInput => ({
    dealId: 100,
    domain: 'portal.bitrix24.ru',
    deal: { ID: '100' },
    closed: false,
    companyId: 55,
    observations: [],
    requisites: [],
    requisitesReadable: true,
    linkedRequisiteId: 0,
    audit: [],
    otherCompanies: new Map<string, number[]>(),
    fields,
    ...patch,
});

describe('composeInnSnapshot', () => {
    it('ИНН не выбран, а кандидаты есть — красная плашка', () => {
        const snapshot = composeInnSnapshot(
            input({
                observations: [
                    { inn: INN, kind: INN_SOURCE_KINDS.company_requisite },
                ],
            }),
        );

        expect(snapshot.current).toBeNull();
        expect(snapshot.conflicts.map(item => item.kind)).toContain(
            INN_CONFLICT_KINDS.not_chosen,
        );
    });

    /*
     * Привязка реквизита — ведущий источник: Битрикс сам меняет её, когда
     * менеджер выбирает реквизит в счёте, и делает это мимо нас.
     */
    it('текущий ИНН совпал с привязанным реквизитом — происхождение «реквизит»', () => {
        const snapshot = composeInnSnapshot(
            input({
                deal: { ID: '100', UF_CRM_OP_INN: INN },
                requisites: [requisite()],
                linkedRequisiteId: 812,
                observations: [
                    { inn: INN, kind: INN_SOURCE_KINDS.company_requisite },
                ],
            }),
        );

        expect(snapshot.current?.origin).toBe(INN_ORIGINS.requisite);
        expect(snapshot.current?.requisiteId).toBe(812);
        expect(snapshot.current?.unverified).toBe(false);
    });

    it('ИНН договора не совпал с привязанным реквизитом — конфликт', () => {
        const snapshot = composeInnSnapshot(
            input({
                deal: { ID: '100', UF_CRM_OP_INN: OTHER },
                requisites: [requisite()],
                linkedRequisiteId: 812,
            }),
        );

        const conflict = snapshot.conflicts.find(
            item => item.kind === INN_CONFLICT_KINDS.requisite_mismatch,
        );
        expect(conflict?.message).toContain(OTHER);
        expect(conflict?.message).toContain(INN);
    });

    it('выбор человека виден в происхождении и подписи', () => {
        const snapshot = composeInnSnapshot(
            input({
                deal: { ID: '100', UF_CRM_OP_INN: INN },
                audit: [
                    {
                        action: INN_AUDIT_ACTIONS.choose,
                        inn: INN,
                        userId: 12,
                        userName: 'Иванов Иван',
                        at: '2026-09-17T10:00:00+03:00',
                    },
                ],
            }),
        );

        expect(snapshot.current?.origin).toBe(INN_ORIGINS.manual);
        expect(snapshot.current?.userName).toBe('Иванов Иван');
        expect(snapshot.candidates[0].label).toContain('добавил Иванов Иван');
    });

    /*
     * Раздел 5 постановки: 4 107 сделок ночного догона — это догадки, и их
     * надо отличать от подтверждённого выбора.
     */
    it('значение без записи о выборе при нескольких кандидатах — непроверенное', () => {
        const snapshot = composeInnSnapshot(
            input({
                deal: {
                    ID: '100',
                    UF_CRM_OP_INN: INN,
                    UF_CRM_OP_INN_POOL: [INN, OTHER],
                },
                observations: [
                    { inn: INN, kind: INN_SOURCE_KINDS.deal_field },
                    { inn: OTHER, kind: INN_SOURCE_KINDS.deal_pool },
                ],
            }),
        );

        expect(snapshot.current?.origin).toBe(INN_ORIGINS.unknown);
        expect(snapshot.current?.unverified).toBe(true);
    });

    it('ИНН есть, реквизита с ним нет — мягкий конфликт про печатную форму', () => {
        const snapshot = composeInnSnapshot(
            input({
                deal: { ID: '100', UF_CRM_OP_INN: OTHER },
                requisites: [requisite({ linked: false })],
                observations: [
                    { inn: OTHER, kind: INN_SOURCE_KINDS.deal_field },
                ],
            }),
        );

        expect(snapshot.conflicts.map(item => item.kind)).toContain(
            INN_CONFLICT_KINDS.inn_without_requisite,
        );
    });

    it('тот же ИНН в реквизите другой компании — плашка со ссылкой', () => {
        const snapshot = composeInnSnapshot(
            input({
                observations: [
                    { inn: INN, kind: INN_SOURCE_KINDS.company_requisite },
                ],
                otherCompanies: new Map([[INN, [777]]]),
            }),
        );

        const conflict = snapshot.conflicts.find(
            item => item.kind === INN_CONFLICT_KINDS.inn_other_company,
        );
        expect(conflict?.entityIds).toEqual([777]);
    });

    it('поля портала не установлены — об этом сказано, экран не пустой', () => {
        const emptyPortal = {
            getEntityFieldByCode: () => undefined,
            getFieldBitrixId: () => '',
        } as never;
        const snapshot = composeInnSnapshot(
            input({ fields: InnFieldMap.from(emptyPortal) }),
        );

        expect(snapshot.availability.dealInnField).toBe(false);
        expect(snapshot.conflicts.map(item => item.kind)).toContain(
            INN_CONFLICT_KINDS.fields_missing,
        );
    });

    it('нет прав на реквизиты — признак и предупреждение', () => {
        const snapshot = composeInnSnapshot(
            input({ requisitesReadable: false }),
        );

        expect(snapshot.availability.requisitesReadable).toBe(false);
        expect(snapshot.conflicts.map(item => item.kind)).toContain(
            INN_CONFLICT_KINDS.requisites_denied,
        );
    });

    it('закрытая сделка отдаётся только на чтение', () => {
        expect(composeInnSnapshot(input({ closed: true })).readOnly).toBe(true);
    });

    it('версия меняется вместе с составом пула', () => {
        const first = composeInnSnapshot(input());
        const second = composeInnSnapshot(
            input({ deal: { ID: '100', UF_CRM_OP_INN_POOL: [INN] } }),
        );

        expect(first.version).not.toBe(second.version);
        // Тот же вход — та же версия: иначе выбор был бы невозможен.
        expect(composeInnSnapshot(input()).version).toBe(first.version);
    });

    it('скрытый вариант остаётся в списке, но помечен', () => {
        const snapshot = composeInnSnapshot(
            input({
                observations: [
                    { inn: OTHER, kind: INN_SOURCE_KINDS.company_field },
                ],
                audit: [
                    {
                        action: INN_AUDIT_ACTIONS.hide,
                        inn: OTHER,
                        userId: 12,
                        userName: 'Иванов',
                        at: '2026-09-17T10:00:00+03:00',
                    },
                ],
            }),
        );

        expect(snapshot.candidates).toHaveLength(1);
        expect(snapshot.candidates[0].hidden).toBe(true);
    });
});
