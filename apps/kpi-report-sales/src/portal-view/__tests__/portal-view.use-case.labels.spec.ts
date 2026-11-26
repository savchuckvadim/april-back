import { BadRequestException } from '@nestjs/common';
import type { PortalViewSaveRequestDto } from '../dto/portal-view-request.dto';
import type { PortalViewState } from '../portal-view.types';
import {
    buildUseCase,
    DEFAULT_VIEW,
    DOMAIN,
    GROUP_ACCESS,
    INDICATORS,
    MANAGER_ACCESS,
    USER_ID,
} from './portal-view.fixtures';

/**
 * «Настройки отчёта»: свои названия показателей и колонки планов. Названия
 * хранятся по коду показателя; ключ принимается только из каталога
 * показателей портала.
 */
const base = { domain: DOMAIN, requesterUserId: USER_ID };
const NOW = '2026-11-26T09:30:00.000Z';

const saveRequest = (
    fields: Partial<PortalViewSaveRequestDto>,
): PortalViewSaveRequestDto => ({ ...base, ...fields });

describe('PortalViewUseCase.get: свои названия и колонки планов', () => {
    it('по умолчанию своих названий нет, колонки планов выключены, каталог — в вариантах', async () => {
        const { useCase, indicators } = buildUseCase(MANAGER_ACCESS);

        const response = await useCase.get(base);

        expect(response.view).toMatchObject({
            labels: {},
            plansEvents: false,
            plansMerged: false,
            plansCallings: false,
            planColumnsHidden: [],
        });
        expect(indicators.forDomain).toHaveBeenCalledWith(DOMAIN);
        expect(response.options.indicators).toEqual(INDICATORS);
    });

    it('заданные значения отдаются как прочитаны', async () => {
        const { useCase, reader } = buildUseCase(MANAGER_ACCESS);
        const view: PortalViewState = {
            ...DEFAULT_VIEW,
            labels: { 'ev:presentation_done': 'Проведённая' },
            plansEvents: true,
            plansCallings: true,
            planColumnsHidden: ['sales_count'],
        };
        reader.read.mockResolvedValue(view);

        const response = await useCase.get(base);

        expect(response.view).toEqual(view);
    });

    it('сбой чтения портала не роняет чтение настроек: каталог пуст, вид отчёта отдаётся', async () => {
        const { useCase, indicators } = buildUseCase(MANAGER_ACCESS);
        indicators.forDomain.mockRejectedValue(new Error('портал не найден'));

        const response = await useCase.get(base);

        expect(response.view).toEqual(DEFAULT_VIEW);
        expect(response.options.indicators).toEqual([]);
    });
});

describe('PortalViewUseCase.save: свои названия и колонки планов', () => {
    beforeEach(() => {
        jest.useFakeTimers({
            now: new Date(NOW),
            doNotFake: ['nextTick', 'setImmediate'],
        });
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('пишутся ровно переданные поля: свои названия JSON-строкой плюс «кто» и «когда»', async () => {
        const { useCase, writer, indicators } = buildUseCase(GROUP_ACCESS);

        const response = await useCase.save(
            saveRequest({
                labels: {
                    'plan:presentations_done': ' План ',
                    'ev:presentation_done': 'Проведённая',
                },
            }),
        );

        expect(writer.write).toHaveBeenCalledWith(DOMAIN, {
            reportViewLabels:
                '{"ev:presentation_done":"Проведённая","plan:presentations_done":"План"}',
            reportViewUpdatedBy: 'Иванов Пётр',
            reportViewUpdatedAt: NOW,
        });
        // Каталог читается один раз: и для проверки, и для ответа.
        expect(indicators.forDomain).toHaveBeenCalledTimes(1);
        expect(response.options.indicators).toEqual(INDICATORS);
    });

    it('флаги и скрытые плановые колонки — в свои ключи, повторы отброшены', async () => {
        const { useCase, writer } = buildUseCase(GROUP_ACCESS);

        await useCase.save(
            saveRequest({
                plansEvents: true,
                plansMerged: false,
                plansCallings: true,
                planColumnsHidden: ['sales_count', 'sales_count', 'calls_done'],
            }),
        );

        expect(writer.write).toHaveBeenCalledWith(DOMAIN, {
            reportViewPlansEvents: true,
            reportViewPlansMerged: false,
            reportViewPlansCallings: true,
            reportViewPlanColumnsHidden: 'sales_count,calls_done',
            reportViewUpdatedBy: 'Иванов Пётр',
            reportViewUpdatedAt: NOW,
        });
    });

    it('ключ не из каталога показателей портала — 400, ничего не записано', async () => {
        const { useCase, writer, author } = buildUseCase(GROUP_ACCESS);

        const call = useCase.save(
            saveRequest({
                labels: {
                    'ev:presentation_done': 'Проведённая',
                    'ev:ev_invoice_act_send': 'Счёт',
                },
            }),
        );

        await expect(call).rejects.toBeInstanceOf(BadRequestException);
        await expect(call).rejects.toThrow(
            'Неизвестный показатель в своих названиях',
        );
        expect(writer.write).not.toHaveBeenCalled();
        expect(author.nameOf).not.toHaveBeenCalled();
    });

    it('название длиннее 60 знаков после обрезки пробелов — 400', async () => {
        const { useCase, writer } = buildUseCase(GROUP_ACCESS);

        await expect(
            useCase.save(
                saveRequest({
                    labels: { 'ev:presentation_done': 'я'.repeat(61) },
                }),
            ),
        ).rejects.toThrow('не длиннее 60 знаков');
        expect(writer.write).not.toHaveBeenCalled();

        await useCase.save(
            saveRequest({
                labels: { 'ev:presentation_done': `  ${'я'.repeat(60)}  ` },
            }),
        );
        expect(writer.write).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                reportViewLabels: `{"ev:presentation_done":"${'я'.repeat(60)}"}`,
            }),
        );
    });

    it('пустое значение убирает своё название ключа', async () => {
        const { useCase, writer } = buildUseCase(GROUP_ACCESS);

        await useCase.save(
            saveRequest({
                labels: {
                    'ev:presentation_done': 'Проведённая',
                    'call:30': '',
                },
            }),
        );

        expect(writer.write).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                reportViewLabels: '{"ev:presentation_done":"Проведённая"}',
            }),
        );
    });

    it('пустой объект сбрасывает все свои названия: пишется пустая строка', async () => {
        const { useCase, writer, author } = buildUseCase(GROUP_ACCESS);

        await useCase.save(saveRequest({ labels: {} }));

        expect(author.nameOf).toHaveBeenCalledWith(DOMAIN, USER_ID);
        expect(writer.write).toHaveBeenCalledWith(DOMAIN, {
            reportViewLabels: '',
            reportViewUpdatedBy: 'Иванов Пётр',
            reportViewUpdatedAt: NOW,
        });
    });

    it('другие поля без своих названий не трогают ключ названий', async () => {
        const { useCase, writer } = buildUseCase(GROUP_ACCESS);

        await useCase.save(saveRequest({ chartsEnabled: false }));

        expect(writer.write).toHaveBeenCalledWith(DOMAIN, {
            reportViewChartsEnabled: false,
            reportViewUpdatedBy: 'Иванов Пётр',
            reportViewUpdatedAt: NOW,
        });
    });

    it('null в новых полях — «не менять»: запись не идёт, подписи нет', async () => {
        const { useCase, writer, author } = buildUseCase(GROUP_ACCESS);

        await useCase.save(
            saveRequest({
                labels: null as unknown as Record<string, string>,
                plansEvents: null as unknown as boolean,
                planColumnsHidden: null as unknown as [],
            }),
        );

        expect(writer.write).not.toHaveBeenCalled();
        expect(author.nameOf).not.toHaveBeenCalled();
    });

    it('ошибка чтения каталога не глушится: проверять ключи не по чему', async () => {
        const { useCase, writer, indicators } = buildUseCase(GROUP_ACCESS);
        indicators.forDomain.mockRejectedValue(new Error('портал не найден'));

        await expect(
            useCase.save(saveRequest({ labels: { 'call:30': 'x' } })),
        ).rejects.toThrow('портал не найден');
        expect(writer.write).not.toHaveBeenCalled();
    });

    it('без своих названий в запросе сбой чтения портала не мешает сохранить остальное', async () => {
        const { useCase, writer, indicators } = buildUseCase(GROUP_ACCESS);
        indicators.forDomain.mockRejectedValue(new Error('портал не найден'));

        const response = await useCase.save(saveRequest({ plansMerged: true }));

        expect(writer.write).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({ reportViewPlansMerged: true }),
        );
        expect(response.options.indicators).toEqual([]);
    });
});
