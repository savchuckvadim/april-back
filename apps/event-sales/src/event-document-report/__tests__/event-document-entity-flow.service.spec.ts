import { Logger } from '@nestjs/common';
import { EventDocumentEntityFlowService } from '../services/entity/event-document-entity-flow.service';
import {
    DOCUMENT_COMPANY_ID,
    DOCUMENT_CREATED_AT_MOSCOW,
    FakePortalOptions,
    SnapshotOptions,
    fieldKey,
    makeContext,
    makeFakeBitrix,
    makeFakeBuffer,
} from './event-document.fixtures';

const run = (
    options: { snapshot?: SnapshotOptions; portal?: FakePortalOptions } = {},
) => {
    const { bitrix, companyUpdates } = makeFakeBitrix();
    const { ctx } = makeContext(options);
    const buffer = makeFakeBuffer();

    new EventDocumentEntityFlowService(bitrix as never).queue(ctx, buffer);
    return { companyUpdates, buffer };
};

/**
 * Поля компании по документу уходят одной командой `company.update`; если
 * компанию не прочитали или писать нечего — команды нет, а поток идёт дальше.
 */
describe('EventDocumentEntityFlowService — поля компании', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('компания в снимке есть: одна команда с ключом doc_company, id компании и счётчиком КП', () => {
        const { companyUpdates, buffer } = run({
            snapshot: {
                company: {
                    ID: String(DOCUMENT_COMPANY_ID),
                    [fieldKey('op_offer_q')]: '2',
                },
            },
        });

        expect(companyUpdates).toHaveLength(1);
        expect(companyUpdates[0].cmd).toBe('doc_company');
        expect(companyUpdates[0].id).toBe(DOCUMENT_COMPANY_ID);
        expect(companyUpdates[0].fields).toMatchObject({
            // В карточке компании было 2 КП — станет 3.
            [fieldKey('op_offer_q')]: 3,
            [fieldKey('op_offer_date')]: DOCUMENT_CREATED_AT_MOSCOW,
            [fieldKey('op_current_status')]: 'Коммерческое предложение',
        });
        expect(buffer.getCurrentGroupSize()).toBe(1);
    });

    it('счётчик читается из компании, а не из сделки', () => {
        const { companyUpdates } = run({
            snapshot: {
                company: { ID: '700', [fieldKey('op_offer_q')]: '9' },
                baseDeal: { ID: '5000', [fieldKey('op_offer_q')]: '1' },
            },
        });

        expect(companyUpdates[0].fields[fieldKey('op_offer_q')]).toBe(10);
    });

    it('компания не прочитана: команд нет, исключения нет, в журнале предупреждение', () => {
        const { companyUpdates, buffer } = run({ snapshot: { company: null } });

        expect(companyUpdates).toEqual([]);
        expect(buffer.getCurrentGroupSize()).toBe(0);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('не прочитана'),
        );
    });

    it('ни одно поле не установлено на портале: команда не ставится', () => {
        const { companyUpdates, buffer } = run({ portal: { fields: {} } });

        expect(companyUpdates).toEqual([]);
        expect(buffer.getCurrentGroupSize()).toBe(0);
    });

    it('в поля компании попадают только пользовательские поля: стадии и ответственного нет', () => {
        const { companyUpdates } = run();

        const keys = Object.keys(companyUpdates[0].fields);
        expect(keys).not.toContain('STAGE_ID');
        expect(keys).not.toContain('ASSIGNED_BY_ID');
        expect(keys.every(key => key.startsWith('UF_CRM_'))).toBe(true);
    });
});
