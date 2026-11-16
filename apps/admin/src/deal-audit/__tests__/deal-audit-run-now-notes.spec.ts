import {
    buildDealAuditRunNowNotes,
    DEAL_AUDIT_RUN_NOW_NOTE,
    DealAuditRunNowSettings,
} from '../lib/deal-audit-run-now-notes';

const READY: DealAuditRunNowSettings = {
    dealAuditEnabled: true,
    dealAuditDryRun: false,
    dealAuditDigestToManager: false,
    dealAuditDigestToHead: true,
    dealAuditDigestUserIds: '',
    dealAuditDigestDepartmentUserIds: '',
};

describe('аудит сделок: предупреждения перед «Сформировать и отправить»', () => {
    it('всё настроено — предупреждений нет', () => {
        expect(buildDealAuditRunNowNotes(READY)).toEqual([]);
    });

    it('аудит выключен — прогон всё равно пройдёт, но админ об этом знает', () => {
        expect(
            buildDealAuditRunNowNotes({ ...READY, dealAuditEnabled: false }),
        ).toEqual([DEAL_AUDIT_RUN_NOW_NOTE.disabled]);
    });

    it('«Только считать» — сводки не уйдут; про получателей тогда не говорим', () => {
        expect(
            buildDealAuditRunNowNotes({
                ...READY,
                dealAuditDryRun: true,
                dealAuditDigestToHead: false,
            }),
        ).toEqual([DEAL_AUDIT_RUN_NOW_NOTE.dryRun]);
    });

    it('ни одного получателя — отправлять некому', () => {
        expect(
            buildDealAuditRunNowNotes({
                ...READY,
                dealAuditDigestToHead: false,
                dealAuditDigestUserIds: ' ; ',
            }),
        ).toEqual([DEAL_AUDIT_RUN_NOW_NOTE.noRecipients]);
    });

    it('получатель только в «сводке по всей структуре» — этого достаточно', () => {
        expect(
            buildDealAuditRunNowNotes({
                ...READY,
                dealAuditDigestToHead: false,
                dealAuditDigestUserIds: '447',
            }),
        ).toEqual([]);
    });
});
