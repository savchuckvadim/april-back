import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CALL_BADGES } from '@lib/sales-ai-analytics';
import type { PortalViewSaveRequestDto } from '../dto/portal-view-request.dto';
import type { PortalViewState } from '../portal-view.types';
import {
    buildUseCase,
    DEFAULT_VIEW,
    DOMAIN,
    GROUP_ACCESS,
    MANAGER_ACCESS,
    NO_POINTS,
    SUPER_USER_ACCESS,
    SUPPORT_URL,
    USER_ID,
} from './portal-view.fixtures';

const base = { domain: DOMAIN, requesterUserId: USER_ID };

const saveRequest = (
    fields: Partial<PortalViewSaveRequestDto>,
): PortalViewSaveRequestDto => ({ ...base, ...fields });

describe('PortalViewUseCase.get', () => {
    it('менеджер читает настройки, но менять не вправе', async () => {
        const { useCase, access, reader } = buildUseCase(MANAGER_ACCESS);
        const view: PortalViewState = {
            ...DEFAULT_VIEW,
            tabsHidden: ['finance'],
            chartsEnabled: false,
            badgesMain: ['signal'],
        };
        reader.read.mockResolvedValue(view);

        const response = await useCase.get(base);

        expect(access.resolve).toHaveBeenCalledWith(DOMAIN, USER_ID);
        expect(reader.read).toHaveBeenCalledWith(DOMAIN);
        expect(response.view).toEqual(view);
        expect(response.canEdit).toBe(false);
        expect(response.supportUrl).toBe(SUPPORT_URL);
    });

    it('руководитель группы и суперпользователь могут менять', async () => {
        const group = buildUseCase(GROUP_ACCESS);
        expect((await group.useCase.get(base)).canEdit).toBe(true);

        const superUser = buildUseCase(SUPER_USER_ACCESS);
        expect((await superUser.useCase.get(base)).canEdit).toBe(true);
    });

    it('ссылки поддержки нет — supportUrl null', async () => {
        const { useCase, supportUrl } = buildUseCase();
        supportUrl.read.mockResolvedValue(null);

        const response = await useCase.get(base);

        expect(response.supportUrl).toBeNull();
    });

    it('варианты: вкладки, общие бейджи справочника и пункты методики с приставкой «m:»', async () => {
        const { useCase, points } = buildUseCase();

        const { options } = await useCase.get(base);

        expect(points.forDomain).toHaveBeenCalledWith(DOMAIN);
        expect(options.tabs.map(tab => tab.code)).toEqual([
            'events',
            'callings',
            'merged',
            'digest',
            'finance',
            'ai',
            'call_reviews',
        ]);
        expect(options.tabs).toContainEqual({
            code: 'call_reviews',
            name: 'Разборы звонков',
        });

        const general = options.badges.filter(
            badge => badge.group === 'general',
        );
        expect(general.map(badge => badge.id)).toEqual(
            CALL_BADGES.map(badge => badge.id),
        );
        const signal = general.find(badge => badge.id === 'signal');
        expect(signal).toMatchObject({
            id: 'signal',
            title: 'Сигнал руководителю',
            group: 'general',
            callTypes: [],
            mainByDefault: true,
        });
        expect(signal?.hint).toContain('ошибку менеджера');
        expect(
            general.find(badge => badge.id === 'step_no_date'),
        ).toMatchObject({ mainByDefault: false });

        const methodology = options.badges.filter(
            badge => badge.group === 'methodology',
        );
        expect(methodology).toEqual([
            {
                id: 'm:cold.utp_unique',
                title: 'УТП: уникальность',
                hint: 'Менеджер назвал, чем компания отличается от других.',
                group: 'methodology',
                callTypes: ['cold'],
                mainByDefault: true,
            },
            {
                id: 'm:pres.dialogue',
                title: 'Диалог',
                hint: 'Презентация построена как диалог, а не монолог.',
                group: 'methodology',
                callTypes: ['presentation', 'repeat'],
                mainByDefault: false,
            },
        ]);
        expect(options.methodology).toEqual({
            code: 'polyansky',
            title: 'Методика Полянского',
        });
    });

    it('методики нет — methodology null и только общие бейджи', async () => {
        const { useCase, points } = buildUseCase();
        points.forDomain.mockResolvedValue(NO_POINTS);

        const { options } = await useCase.get(base);

        expect(options.methodology).toBeNull();
        expect(options.badges).toHaveLength(CALL_BADGES.length);
        expect(options.badges.every(badge => badge.group === 'general')).toBe(
            true,
        );
    });

    it('пункт без короткой подписи и формулировки не ломает список: подпись — код, подсказки нет', async () => {
        const { useCase, points } = buildUseCase();
        points.forDomain.mockResolvedValue({
            methodology: null,
            defs: [
                {
                    code: 'x.empty',
                    label: ' ',
                    title: ' ',
                    callTypes: [],
                    main: false,
                },
            ],
        });

        const { options } = await useCase.get(base);

        expect(options.badges[options.badges.length - 1]).toMatchObject({
            id: 'm:x.empty',
            title: 'x.empty',
            hint: null,
        });
    });
});

describe('PortalViewUseCase.save', () => {
    beforeEach(() => {
        jest.useFakeTimers({
            now: new Date('2026-11-25T09:30:00.000Z'),
            doNotFake: ['nextTick', 'setImmediate'],
        });
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('менеджеру нельзя: 403, ничего не записано и имя не читалось', async () => {
        const { useCase, writer, author } = buildUseCase(MANAGER_ACCESS);

        const call = useCase.save(saveRequest({ chartsEnabled: false }));

        await expect(call).rejects.toBeInstanceOf(ForbiddenException);
        await expect(call).rejects.toThrow(
            'Настройки отчёта меняет руководитель группы и выше',
        );
        expect(writer.write).not.toHaveBeenCalled();
        expect(author.nameOf).not.toHaveBeenCalled();
    });

    it('руководитель группы: пишутся ровно переданные поля плюс «кто» и «когда», в ответе — состояние после записи', async () => {
        const { useCase, writer, author } = buildUseCase(GROUP_ACCESS);
        const saved: PortalViewState = {
            tabsHidden: ['merged', 'finance'],
            chartsEnabled: true,
            badgesMain: [],
            updatedBy: 'Иванов Пётр',
            updatedAt: '2026-11-25T09:30:00.000Z',
        };
        writer.write.mockResolvedValue(saved);

        const response = await useCase.save(
            saveRequest({ tabsHidden: ['merged', 'finance', 'merged'] }),
        );

        expect(author.nameOf).toHaveBeenCalledWith(DOMAIN, USER_ID);
        expect(writer.write).toHaveBeenCalledTimes(1);
        expect(writer.write).toHaveBeenCalledWith(DOMAIN, {
            reportViewTabsHidden: 'merged,finance',
            reportViewUpdatedBy: 'Иванов Пётр',
            reportViewUpdatedAt: '2026-11-25T09:30:00.000Z',
        });
        expect(response.view).toEqual(saved);
        expect(response.canEdit).toBe(true);
        expect(response.supportUrl).toBe(SUPPORT_URL);
        expect(response.options.badges.length).toBeGreaterThan(0);
    });

    it('суперпользователь может сохранять; все три поля уходят в свои ключи', async () => {
        const { useCase, writer } = buildUseCase(SUPER_USER_ACCESS);

        await useCase.save(
            saveRequest({
                tabsHidden: ['ai'],
                chartsEnabled: false,
                badgesMain: ['signal', 'm:pres.dialogue'],
            }),
        );

        expect(writer.write).toHaveBeenCalledWith(DOMAIN, {
            reportViewTabsHidden: 'ai',
            reportViewChartsEnabled: false,
            reportViewBadgesMain: 'signal,m:pres.dialogue',
            reportViewUpdatedBy: 'Иванов Пётр',
            reportViewUpdatedAt: '2026-11-25T09:30:00.000Z',
        });
    });

    it('пустые списки пишутся пустой строкой: «ничего не скрыто» и «набор по умолчанию»', async () => {
        const { useCase, writer } = buildUseCase(GROUP_ACCESS);

        await useCase.save(saveRequest({ tabsHidden: [], badgesMain: [] }));

        expect(writer.write).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                reportViewTabsHidden: '',
                reportViewBadgesMain: '',
            }),
        );
    });

    it('повторы бейджей отбрасываются, порядок сохраняется', async () => {
        const { useCase, writer } = buildUseCase(GROUP_ACCESS);

        await useCase.save(
            saveRequest({
                badgesMain: ['signal', 'step_missing', 'signal'],
            }),
        );

        expect(writer.write).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                reportViewBadgesMain: 'signal,step_missing',
            }),
        );
    });

    it('неизвестный общий бейдж — 400, ничего не записано', async () => {
        const { useCase, writer, author } = buildUseCase(GROUP_ACCESS);

        const call = useCase.save(
            saveRequest({ badgesMain: ['signal', 'no_such_badge'] }),
        );

        await expect(call).rejects.toBeInstanceOf(BadRequestException);
        await expect(call).rejects.toThrow(
            'Неизвестный бейдж в списке основных',
        );
        expect(writer.write).not.toHaveBeenCalled();
        expect(author.nameOf).not.toHaveBeenCalled();
    });

    it('пункты методики «m:…» сохраняются как есть, даже если такого пункта сейчас нет', async () => {
        const { useCase, writer } = buildUseCase(GROUP_ACCESS);

        await useCase.save(
            saveRequest({ badgesMain: ['m:gone.point', 'm:cold.utp_unique'] }),
        );

        expect(writer.write).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                reportViewBadgesMain: 'm:gone.point,m:cold.utp_unique',
            }),
        );
    });

    it('имя не прочиталось — подпись «Сотрудник № id»', async () => {
        const { useCase, writer, author } = buildUseCase(GROUP_ACCESS);
        author.nameOf.mockResolvedValue('Сотрудник № 447');

        await useCase.save(saveRequest({ chartsEnabled: true }));

        expect(writer.write).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                reportViewUpdatedBy: 'Сотрудник № 447',
            }),
        );
    });

    it('пустой запрос ничего не меняет и подпись «менял» не ставит', async () => {
        const { useCase, writer, author, reader } = buildUseCase(GROUP_ACCESS);

        const response = await useCase.save(saveRequest({}));

        expect(writer.write).not.toHaveBeenCalled();
        expect(author.nameOf).not.toHaveBeenCalled();
        expect(reader.read).toHaveBeenCalledWith(DOMAIN);
        expect(response.view).toEqual(DEFAULT_VIEW);
        expect(response.canEdit).toBe(true);
    });

    it('ошибка записи не глушится', async () => {
        const { useCase, writer } = buildUseCase(GROUP_ACCESS);
        writer.write.mockRejectedValue(new Error('база недоступна'));

        await expect(
            useCase.save(saveRequest({ chartsEnabled: false })),
        ).rejects.toThrow('база недоступна');
    });
});
