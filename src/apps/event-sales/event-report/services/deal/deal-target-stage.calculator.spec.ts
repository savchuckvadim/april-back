import { IPCategory } from '@/modules/portal/interfaces/portal.interface';
import {
    getSalesBaseTargetStageCode,
    getXoTargetStageCode,
    getPresentationTargetStageCode,
    composeStageId,
} from './deal-target-stage.calculator';

const stage = (code: string, bitrixId: string) => ({
    bitrixId,
    code,
    name: code,
    order: 0,
});

const baseCategory: IPCategory = {
    bitrixId: 17,
    code: 'sales_base',
    name: 'ОП Основная',
    stages: [
        stage('sales_plan', 'NEW'),
        stage('sales_cold', 'PREPARATION'),
        stage('sales_warm', 'WARM'),
        stage('sales_pres', 'PRES'),
        stage('sales_in_progress', 'HOT'),
        stage('sales_money_await', 'PAY'),
        stage('sales_success', 'WON'),
        stage('sales_fail', 'LOSE'),
        stage('sales_noresult', 'NORESULT'),
    ],
} as unknown as IPCategory;

const xoCategory: IPCategory = {
    bitrixId: 32,
    code: 'sales_xo',
    name: 'ОП Холодные',
    stages: [
        stage('cold_pending', 'PENDING'),
        stage('cold_success', 'WON'),
        stage('cold_fail', 'LOSE'),
        stage('cold_noresult', 'NORESULT'),
    ],
} as unknown as IPCategory;

const presCategory: IPCategory = {
    bitrixId: 48,
    code: 'sales_presentation',
    name: 'ОП Презентации',
    stages: [
        stage('spres_plan', 'PLAN'),
        stage('spres_pending', 'PENDING'),
        stage('spres_success', 'WON'),
        stage('spres_fail', 'LOSE'),
        stage('spres_noresult', 'NORESULT'),
    ],
} as unknown as IPCategory;

describe('getSalesBaseTargetStageCode', () => {
    it('isSuccess побеждает все остальные сигналы', () => {
        expect(
            getSalesBaseTargetStageCode({
                category: baseCategory,
                currentStageEvent: 'warm',
                planEventType: 'presentation',
                reportEventType: 'warm',
                isResult: true,
                isUnplanned: false,
                isSuccess: true,
                isFail: false,
            }),
        ).toBe('WON');
    });

    it('isFail без isResult → noresult', () => {
        expect(
            getSalesBaseTargetStageCode({
                category: baseCategory,
                currentStageEvent: 'warm',
                planEventType: null,
                reportEventType: 'warm',
                isResult: false,
                isUnplanned: false,
                isSuccess: false,
                isFail: true,
            }),
        ).toBe('NORESULT');
    });

    it('plan=presentation двигает на pres-стадию', () => {
        expect(
            getSalesBaseTargetStageCode({
                category: baseCategory,
                currentStageEvent: 'warm',
                planEventType: 'presentation',
                reportEventType: 'warm',
                isResult: true,
                isUnplanned: false,
                isSuccess: false,
                isFail: false,
            }),
        ).toBe('PRES');
    });

    it('берёт максимум по «лестнице» из current/plan/report', () => {
        expect(
            getSalesBaseTargetStageCode({
                category: baseCategory,
                currentStageEvent: 'hot',
                planEventType: 'warm',
                reportEventType: 'presentation',
                isResult: true,
                isUnplanned: false,
                isSuccess: false,
                isFail: false,
            }),
        ).toBe('HOT');
    });

    it('isUnplanned добавляет presentation в кандидаты', () => {
        expect(
            getSalesBaseTargetStageCode({
                category: baseCategory,
                currentStageEvent: 'warm',
                planEventType: null,
                reportEventType: 'warm',
                isResult: true,
                isUnplanned: true,
                isSuccess: false,
                isFail: false,
            }),
        ).toBe('PRES');
    });
});

describe('getXoTargetStageCode', () => {
    it('reportEventType=xo + isResult → cold_success', () => {
        expect(
            getXoTargetStageCode({
                category: xoCategory,
                reportEventType: 'xo',
                isExpired: false,
                isResult: true,
                isSuccess: false,
                isFail: false,
            }),
        ).toBe('WON');
    });

    it('reportEventType=xo + isFail + !isResult → cold_noresult', () => {
        expect(
            getXoTargetStageCode({
                category: xoCategory,
                reportEventType: 'xo',
                isExpired: false,
                isResult: false,
                isSuccess: false,
                isFail: true,
            }),
        ).toBe('NORESULT');
    });

    it('reportEventType=xo + isExpired → cold_pending', () => {
        expect(
            getXoTargetStageCode({
                category: xoCategory,
                reportEventType: 'xo',
                isExpired: true,
                isResult: false,
                isSuccess: false,
                isFail: false,
            }),
        ).toBe('PENDING');
    });

    it('reportEventType≠xo → null (не обновляем xo-сделку)', () => {
        expect(
            getXoTargetStageCode({
                category: xoCategory,
                reportEventType: 'warm',
                isExpired: false,
                isResult: true,
                isSuccess: false,
                isFail: false,
            }),
        ).toBeNull();
    });
});

describe('getPresentationTargetStageCode', () => {
    it('plan → spres_plan', () => {
        expect(
            getPresentationTargetStageCode({
                category: presCategory,
                eventAction: 'plan',
                isResult: false,
            }),
        ).toBe('PLAN');
    });

    it('done → spres_success', () => {
        expect(
            getPresentationTargetStageCode({
                category: presCategory,
                eventAction: 'done',
                isResult: true,
            }),
        ).toBe('WON');
    });

    it('fail + isResult → spres_fail', () => {
        expect(
            getPresentationTargetStageCode({
                category: presCategory,
                eventAction: 'fail',
                isResult: true,
            }),
        ).toBe('LOSE');
    });

    it('fail + !isResult → spres_noresult', () => {
        expect(
            getPresentationTargetStageCode({
                category: presCategory,
                eventAction: 'fail',
                isResult: false,
            }),
        ).toBe('NORESULT');
    });

    it('expired → spres_pending', () => {
        expect(
            getPresentationTargetStageCode({
                category: presCategory,
                eventAction: 'expired',
                isResult: false,
            }),
        ).toBe('PENDING');
    });
});

describe('composeStageId', () => {
    it('собирает STAGE_ID Bitrix-формата', () => {
        expect(composeStageId(17, 'WARM')).toBe('C17:WARM');
    });
});
