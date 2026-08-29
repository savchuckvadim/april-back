import { PrismaService } from 'src/core/prisma';
import { PortalQuestionnairesPrismaRepository } from './portal-questionnaires.prisma.repository';
import {
    PortalQuestionnaireItemInput,
    PortalQuestionnaireOptionInput,
    PortalQuestionnaireSaveInput,
} from './portal-questionnaires.repository';
import {
    EnumQuestionnaireChannel,
    EnumQuestionnaireControl,
    EnumQuestionnaireFieldStatus,
    EnumQuestionnairePersist,
    EnumQuestionnairePresentation,
    EnumQuestionnairePurpose,
    EnumQuestionnaireTargetEntity,
    EnumQuestionnaireTargetMode,
} from './portal-questionnaires.schema';

/**
 * Спека сохранения каталога: проверяется ровно то, чем сохранение из
 * админки способно испортить уже собранные данные —
 *  - ПУНКТ И ВАРИАНТ ГАСЯТСЯ, А НЕ УДАЛЯЮТСЯ: ответ на них уже лежит в
 *    поле CRM, без строки вопроса это значение объяснить нечем;
 *  - id пункта и варианта переживают сохранение: их отдаёт ответ
 *    «Проверить привязки», и админка адресует ими существующие строки;
 *  - ИТОГ ПРОВЕРКИ ПРИВЯЗОК не берётся из тела: иначе правка заголовка
 *    вернула бы сломанный вопрос в каталог со статусом «ok».
 */

const CHECKED_AT = new Date('2026-08-20T10:00:00.000Z');

type DelegateMock = Record<string, jest.Mock>;

interface PrismaMock {
    portalQuestionnaire: DelegateMock;
    portalQuestionnaireItem: DelegateMock;
    portalQuestionnaireItemOption: DelegateMock;
    $transaction: jest.Mock;
}

/** Строка пункта в том виде, в каком её читает сведение состава. */
interface StoredItem {
    id: string;
    code: string;
    channel: string;
    /** BigInt, как его отдаёт Prisma; null — носитель не смарт. */
    smartId: bigint | null;
    fieldName: string | null;
    fieldType: string | null;
    fieldStatus: string;
    fieldCheckedAt: Date | null;
    options: { id: string; code: string }[];
}

const makeStoredItem = (over: Partial<StoredItem> = {}): StoredItem => ({
    id: 'item-1',
    code: 'decision_date',
    channel: 'crm',
    smartId: null,
    fieldName: 'UF_CRM_1712345678',
    fieldType: 'date',
    // Поле на портале не нашлось — вердикт последней проверки привязок.
    fieldStatus: EnumQuestionnaireFieldStatus.missing,
    fieldCheckedAt: CHECKED_AT,
    options: [],
    ...over,
});

const makeOptionInput = (
    over: Partial<PortalQuestionnaireOptionInput> = {},
): PortalQuestionnaireOptionInput => ({
    code: 'yes',
    title: 'Да',
    bitrixId: 77,
    xmlId: null,
    sort: 500,
    isDefault: false,
    isActive: true,
    ...over,
});

const makeItemInput = (
    over: Partial<PortalQuestionnaireItemInput> = {},
): PortalQuestionnaireItemInput => ({
    code: 'decision_date',
    title: 'Когда клиент примет решение?',
    placeholder: null,
    hint: null,
    groupTitle: null,
    sort: 500,
    control: EnumQuestionnaireControl.date,
    isMultiple: false,
    isRequired: true,
    requireChange: false,
    staleAfterDays: null,
    channel: EnumQuestionnaireChannel.crm,
    targetMode: EnumQuestionnaireTargetMode.auto,
    targetEntity: null,
    dtoPath: null,
    smartId: null,
    smartEntityTypeId: null,
    isNative: false,
    fieldName: 'UF_CRM_1712345678',
    fieldBitrixId: 1234,
    fieldXmlId: null,
    fieldCode: null,
    fieldType: 'date',
    // Тело сохранения вердикта проверки не знает: в нём всегда дефолт.
    fieldStatus: EnumQuestionnaireFieldStatus.ok,
    fieldCheckedAt: null,
    meta: {},
    isActive: true,
    options: [],
    ...over,
});

const makeInput = (
    items: PortalQuestionnaireItemInput[],
): PortalQuestionnaireSaveInput => ({
    id: 'q-1',
    portalId: 5,
    domain: 'gsr.bitrix24.ru',
    appCode: 'event-sales',
    code: 'refine',
    title: 'Доработка',
    hint: null,
    purpose: EnumQuestionnairePurpose.plan,
    presentation: EnumQuestionnairePresentation.inline,
    place: null,
    persist: EnumQuestionnairePersist.onChange,
    conditions: [{ kind: 'planType', values: ['refine'] }],
    configKey: null,
    legacyChecklistId: null,
    isActive: true,
    sort: 500,
    updatedBy: 42,
    items,
});

/** Анкета, которую `save()` перечитывает после транзакции. */
const savedRow = {
    id: 'q-1',
    portal_id: BigInt(5),
    domain: 'gsr.bitrix24.ru',
    appCode: 'event-sales',
    code: 'refine',
    title: 'Доработка',
    hint: null,
    purpose: 'plan',
    presentation: 'inline',
    place: null,
    persist: 'onChange',
    conditions: [],
    configKey: null,
    legacyChecklistId: null,
    isActive: true,
    sort: 500,
    version: 4,
    updatedBy: BigInt(42),
    createdAt: null,
    updatedAt: null,
    items: [],
};

type ItemWriteCall = [
    { where?: { id: string }; data: Record<string, unknown> },
];

describe('PortalQuestionnairesPrismaRepository.save', () => {
    let prisma: PrismaMock;
    let repository: PortalQuestionnairesPrismaRepository;

    beforeEach(() => {
        prisma = {
            portalQuestionnaire: {
                findUnique: jest.fn(),
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            portalQuestionnaireItem: {
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            portalQuestionnaireItemOption: {
                findMany: jest.fn(),
                create: jest.fn(),
                createMany: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            $transaction: jest.fn(),
        };
        // Транзакция выполняет колбэк на том же инстансе.
        prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
            cb(prisma),
        );
        // Один и тот же делегат отвечает и на поиск шапки внутри
        // транзакции, и на перечитывание анкеты целиком после неё.
        prisma.portalQuestionnaire.findUnique.mockImplementation(
            (args: { include?: unknown }) =>
                args.include ? savedRow : { id: 'q-1' },
        );
        prisma.portalQuestionnaire.update.mockResolvedValue({ id: 'q-1' });
        prisma.portalQuestionnaireItem.findMany.mockResolvedValue([]);

        repository = new PortalQuestionnairesPrismaRepository(
            prisma as unknown as PrismaService,
        );
    });

    it('пункт, пропавший из тела, гасит, а не удаляет', async () => {
        prisma.portalQuestionnaireItem.findMany.mockResolvedValue([
            makeStoredItem(),
            makeStoredItem({
                id: 'item-2',
                code: 'budget',
                fieldName: 'UF_CRM_777',
                fieldStatus: EnumQuestionnaireFieldStatus.ok,
                fieldCheckedAt: null,
            }),
        ]);

        await repository.save(makeInput([makeItemInput()]));

        expect(
            prisma.portalQuestionnaireItem.deleteMany,
        ).not.toHaveBeenCalled();
        expect(
            prisma.portalQuestionnaireItemOption.deleteMany,
        ).not.toHaveBeenCalled();
        expect(prisma.portalQuestionnaireItem.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['item-2'] } },
            data: { isActive: false, updatedAt: expect.any(Date) as Date },
        });
    });

    it('пункт с прежним кодом переписывает свою строку — id не меняется', async () => {
        prisma.portalQuestionnaireItem.findMany.mockResolvedValue([
            makeStoredItem(),
        ]);

        await repository.save(
            makeInput([makeItemInput({ title: 'Дата решения' })]),
        );

        expect(prisma.portalQuestionnaireItem.create).not.toHaveBeenCalled();
        const calls = prisma.portalQuestionnaireItem.update.mock
            .calls as ItemWriteCall[];
        expect(calls).toHaveLength(1);
        expect(calls[0][0].where).toEqual({ id: 'item-1' });
        expect(calls[0][0].data.title).toBe('Дата решения');
    });

    it('итог проверки привязок переживает сохранение при той же привязке', async () => {
        prisma.portalQuestionnaireItem.findMany.mockResolvedValue([
            makeStoredItem(),
        ]);

        await repository.save(
            makeInput([makeItemInput({ title: 'Дата решения' })]),
        );

        const calls = prisma.portalQuestionnaireItem.update.mock
            .calls as ItemWriteCall[];
        // В теле пришли `ok` и пустая отметка — берём то, что в БД.
        expect(calls[0][0].data.fieldStatus).toBe(
            EnumQuestionnaireFieldStatus.missing,
        );
        expect(calls[0][0].data.fieldCheckedAt).toBe(CHECKED_AT);
    });

    it('смена поля сбрасывает вердикт: прежняя проверка была о другом поле', async () => {
        prisma.portalQuestionnaireItem.findMany.mockResolvedValue([
            makeStoredItem(),
        ]);

        await repository.save(
            makeInput([makeItemInput({ fieldName: 'UF_CRM_999' })]),
        );

        const calls = prisma.portalQuestionnaireItem.update.mock
            .calls as ItemWriteCall[];
        expect(calls[0][0].data.fieldStatus).toBe(
            EnumQuestionnaireFieldStatus.ok,
        );
        expect(calls[0][0].data.fieldCheckedAt).toBeNull();
    });

    it('смена смарта сбрасывает вердикт: поле искали в другом элементе', async () => {
        prisma.portalQuestionnaireItem.findMany.mockResolvedValue([
            makeStoredItem({
                channel: EnumQuestionnaireChannel.smart,
                smartId: BigInt(12),
                fieldName: 'UF_CRM_7_PRES_RESULT',
                fieldType: 'string',
            }),
        ]);

        await repository.save(
            makeInput([
                makeItemInput({
                    channel: EnumQuestionnaireChannel.smart,
                    targetMode: EnumQuestionnaireTargetMode.entity,
                    targetEntity: EnumQuestionnaireTargetEntity.smart,
                    smartId: 13,
                    smartEntityTypeId: 181,
                    fieldName: 'UF_CRM_7_PRES_RESULT',
                    control: EnumQuestionnaireControl.string,
                    fieldType: 'string',
                }),
            ]),
        );

        const calls = prisma.portalQuestionnaireItem.update.mock
            .calls as ItemWriteCall[];
        expect(calls[0][0].data.fieldStatus).toBe(
            EnumQuestionnaireFieldStatus.ok,
        );
        expect(calls[0][0].data.fieldCheckedAt).toBeNull();
        // Адрес смарта уезжает в БД BigInt'ом: колонка unsigned bigint.
        expect(calls[0][0].data.smartId).toBe(BigInt(13));
        expect(calls[0][0].data.smartEntityTypeId).toBe(BigInt(181));
    });

    it('вариант справочника тоже гасится, а его id сохраняется', async () => {
        prisma.portalQuestionnaireItem.findMany.mockResolvedValue([
            makeStoredItem({
                code: 'decision',
                fieldType: 'enumeration',
                options: [
                    { id: 'opt-1', code: 'yes' },
                    { id: 'opt-2', code: 'no' },
                ],
            }),
        ]);

        await repository.save(
            makeInput([
                makeItemInput({
                    code: 'decision',
                    control: EnumQuestionnaireControl.enumeration,
                    fieldType: 'enumeration',
                    options: [makeOptionInput()],
                }),
            ]),
        );

        const optionCalls = prisma.portalQuestionnaireItemOption.update.mock
            .calls as ItemWriteCall[];
        expect(optionCalls).toHaveLength(1);
        expect(optionCalls[0][0].where).toEqual({ id: 'opt-1' });
        expect(
            prisma.portalQuestionnaireItemOption.create,
        ).not.toHaveBeenCalled();
        expect(
            prisma.portalQuestionnaireItemOption.updateMany,
        ).toHaveBeenCalledWith({
            where: { id: { in: ['opt-2'] } },
            data: { isActive: false, updatedAt: expect.any(Date) as Date },
        });
    });

    it('новый пункт создаётся со своим uuid и вердиктом из тела', async () => {
        prisma.portalQuestionnaireItem.findMany.mockResolvedValue([]);

        await repository.save(makeInput([makeItemInput()]));

        const calls = prisma.portalQuestionnaireItem.create.mock
            .calls as ItemWriteCall[];
        expect(calls).toHaveLength(1);
        expect(calls[0][0].data.id).toEqual(expect.any(String));
        expect(calls[0][0].data.fieldStatus).toBe(
            EnumQuestionnaireFieldStatus.ok,
        );
        expect(calls[0][0].data.fieldCheckedAt).toBeNull();
        expect(
            prisma.portalQuestionnaireItem.updateMany,
        ).not.toHaveBeenCalled();
    });
});

/**
 * Спека применения расхождений («Подтянуть из Битрикса»). Проверяется то,
 * ради чего маршрут вообще отдельный: ТЕКСТЫ пишутся только сюда, новый
 * вариант заводится ВМЕСТЕ с bitrixId, а версия анкеты растёт — иначе
 * фрейм показывал бы прежние подписи до протухания кэша.
 */
describe('PortalQuestionnairesPrismaRepository.applyFieldSync', () => {
    let prisma: PrismaMock;
    let repository: PortalQuestionnairesPrismaRepository;

    beforeEach(() => {
        prisma = {
            portalQuestionnaire: {
                findUnique: jest.fn(),
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            portalQuestionnaireItem: {
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            portalQuestionnaireItemOption: {
                findMany: jest.fn(),
                create: jest.fn(),
                createMany: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn(),
                deleteMany: jest.fn(),
            },
            $transaction: jest.fn(),
        };
        prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
            cb(prisma),
        );
        repository = new PortalQuestionnairesPrismaRepository(
            prisma as unknown as PrismaService,
        );
    });

    it('подписи и новый вариант пишутся одной транзакцией, версия растёт', async () => {
        await repository.applyFieldSync('q-1', [
            {
                itemId: 'item-1',
                title: 'Тип сотрудничества',
                renamedOptions: [
                    { optionId: 'opt-1', title: 'Тендер (44-ФЗ)' },
                ],
                newOptions: [
                    {
                        code: 'sub',
                        title: 'Субподряд',
                        bitrixId: 301,
                        xmlId: 'SUB',
                        sort: 500,
                    },
                ],
            },
        ]);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        const itemCalls = prisma.portalQuestionnaireItem.update.mock
            .calls as ItemWriteCall[];
        expect(itemCalls[0][0].where).toEqual({ id: 'item-1' });
        expect(itemCalls[0][0].data.title).toBe('Тип сотрудничества');

        const renameCalls = prisma.portalQuestionnaireItemOption.update.mock
            .calls as ItemWriteCall[];
        expect(renameCalls[0][0].where).toEqual({ id: 'opt-1' });
        expect(renameCalls[0][0].data.title).toBe('Тендер (44-ФЗ)');

        const createCalls = prisma.portalQuestionnaireItemOption.create.mock
            .calls as ItemWriteCall[];
        expect(createCalls[0][0].data).toEqual(
            expect.objectContaining({
                id: expect.any(String) as string,
                itemId: 'item-1',
                code: 'sub',
                title: 'Субподряд',
                // Без идентификатора элемента списка вариант бесполезен.
                bitrixId: 301,
                xmlId: 'SUB',
                isActive: true,
            }),
        );

        expect(prisma.portalQuestionnaire.update).toHaveBeenCalledWith({
            where: { id: 'q-1' },
            data: {
                version: { increment: 1 },
                updatedAt: expect.any(Date) as Date,
            },
        });
    });

    it('подпись вопроса без выбора владельца не переписывается', async () => {
        await repository.applyFieldSync('q-1', [
            {
                itemId: 'item-1',
                renamedOptions: [],
                newOptions: [
                    {
                        code: 'sub',
                        title: 'Субподряд',
                        bitrixId: 301,
                        xmlId: null,
                        sort: 500,
                    },
                ],
            },
        ]);

        expect(prisma.portalQuestionnaireItem.update).not.toHaveBeenCalled();
    });

    it('слепок принятого пишется и без подписи вопроса', async () => {
        const meta = {
            rows: 3,
            bitrixField: {
                live: null,
                accepted: {
                    title: 'Тип сотрудничества',
                    type: 'enumeration',
                    options: [],
                    at: '2026-08-28T10:00:00.000Z',
                },
            },
        };

        await repository.applyFieldSync('q-1', [
            {
                itemId: 'item-1',
                renamedOptions: [],
                newOptions: [],
                meta,
            },
        ]);

        // Владелец взял только варианты — подпись не трогаем, а слепок
        // обновить обязаны: иначе следующая сверка покажет применённое.
        const itemCalls = prisma.portalQuestionnaireItem.update.mock
            .calls as ItemWriteCall[];
        expect(itemCalls[0][0].data).not.toHaveProperty('title');
        expect(itemCalls[0][0].data.meta).toEqual(meta);
    });

    it('пустая пачка в БД не ходит', async () => {
        await repository.applyFieldSync('q-1', []);

        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.portalQuestionnaire.update).not.toHaveBeenCalled();
    });
});
