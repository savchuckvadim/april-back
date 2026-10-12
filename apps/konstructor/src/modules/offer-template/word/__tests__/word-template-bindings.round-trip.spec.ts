import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import type { StorageService } from '@lib/core/storage/storage.service';
import type { OfferTemplate } from '../../offer-template/entities/offer-template.entity';
import type { OfferTemplateRepository } from '../../offer-template/repositories/offer-template.repository';
import type { OfferTemplatePortalRepository } from '../../portal/repositories/offer-template-portal.repository';
import type { UserSelectedTemplateRepository } from '../../user-selected/repositories/user-selected-template.repository';
import { CreateWordTemplateServerDto } from '../dtos/create-word-template.dto';
import { WordTemplateService } from '../services/word-template.service';

/**
 * Круговой проход create → read по НОВЫМ полям привязки
 * (agent_id / client_types / supply_types).
 *
 * Зачем отдельный тест именно на это. Оба способа потерять поле —
 * МОЛЧАЛИВЫЕ и по коду не читаются:
 *  1. `whitelist: true` в глобальном ValidationPipe выкидывает поле без
 *     class-validator-декоратора — запрос проходит, поле просто исчезает;
 *  2. забытое поле в `select`-проекции репозитория возвращает `undefined` —
 *     ни ошибки компиляции, ни ошибки рантайма.
 * Поэтому проверяем, что значение доезжает до БД в сериализованном виде
 * и возвращается наружу уже разобранным массивом.
 *
 * Инфраструктуру НЕ поднимаем: настоящий PortalStoreModule открывает
 * Redis/БД и подвешивает jest. Все зависимости — моки.
 */

const DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * DOCX — это ZIP, и валидатор сверяет магические байты `PK\x03\x04`.
 * Без них он падает раньше, чем тест дойдёт до привязок.
 */
function docxBuffer(): Buffer {
    const body = Buffer.alloc(1024, 1);
    body.set([0x50, 0x4b, 0x03, 0x04], 0);
    return body;
}

function docxFile(): Express.Multer.File {
    return {
        fieldname: 'file',
        originalname: 'template.docx',
        encoding: '7bit',
        mimetype: DOCX_MIME,
        size: 1024,
        buffer: docxBuffer(),
        stream: undefined as unknown as Express.Multer.File['stream'],
        destination: '',
        filename: '',
        path: '',
    };
}

function serverDto(
    overrides: Partial<CreateWordTemplateServerDto> = {},
): CreateWordTemplateServerDto {
    const dto = new CreateWordTemplateServerDto();
    Object.assign(dto, {
        name: 'Шаблон КП',
        code: 'word-1',
        portal_id: 7,
        user_id: 42,
        ...overrides,
    });
    return dto;
}

describe('WordTemplateService — круговой проход привязок', () => {
    const createMock = jest.fn<
        Promise<OfferTemplate>,
        [Partial<OfferTemplate>]
    >();
    const updateMock = jest.fn<
        Promise<OfferTemplate>,
        [bigint, Partial<OfferTemplate>]
    >();
    const findByIdMock = jest.fn<Promise<OfferTemplate | null>, [bigint]>();
    const saveFileMock = jest.fn<Promise<string>, unknown[]>();
    const portalCreateMock = jest.fn<Promise<unknown>, unknown[]>();
    const findByUserAndTemplateMock = jest.fn<Promise<unknown>, unknown[]>();
    const selectedCreateMock = jest.fn<Promise<unknown>, unknown[]>();

    function buildService(): WordTemplateService {
        const offerTemplateRepository = {
            create: createMock,
            update: updateMock,
            findById: findByIdMock,
        } as unknown as OfferTemplateRepository;
        const portalRepository = {
            create: portalCreateMock,
        } as unknown as OfferTemplatePortalRepository;
        const userSelectedRepository = {
            findByUserAndTemplate: findByUserAndTemplateMock,
            create: selectedCreateMock,
        } as unknown as UserSelectedTemplateRepository;
        const storageService = {
            saveFile: saveFileMock,
        } as unknown as StorageService;

        return new WordTemplateService(
            offerTemplateRepository,
            portalRepository,
            userSelectedRepository,
            storageService,
        );
    }

    beforeEach(() => {
        jest.resetAllMocks();
        saveFileMock.mockResolvedValue('konstructor/word-templates/t.docx');
        portalCreateMock.mockResolvedValue(undefined);
        findByUserAndTemplateMock.mockResolvedValue(null);
        selectedCreateMock.mockResolvedValue(undefined);
    });

    it('create сериализует привязки в JSON-строку и отдаёт их наружу массивом', async () => {
        // Репозиторий отвечает ровно тем, что ему передали: так тест ловит
        // и потерю поля на записи, и потерю на чтении.
        createMock.mockImplementation(data =>
            Promise.resolve({
                ...data,
                id: '15',
            } as OfferTemplate),
        );

        const service = buildService();
        const result = await service.create(
            serverDto({
                agent_id: '12',
                client_types: [ClientTypeEnum.ORG_STATE, ClientTypeEnum.IP],
                supply_types: [SupplyTypeEnum.INTERNET],
            }),
            docxFile(),
        );

        // На записи — сериализованная JSON-строка и bigint.
        expect(createMock).toHaveBeenCalledTimes(1);
        const written = createMock.mock.calls[0][0];
        expect(written.agent_id).toBe(12n);
        expect(written.client_types).toBe('["org_state","ip"]');
        expect(written.supply_types).toBe('["internet"]');

        // На чтении — разобранные массивы и строковый agent_id.
        expect(result.agent_id).toBe('12');
        expect(result.client_types).toEqual([
            ClientTypeEnum.ORG_STATE,
            ClientTypeEnum.IP,
        ]);
        expect(result.supply_types).toEqual([SupplyTypeEnum.INTERNET]);
    });

    it('пустой список и отсутствие поля пишутся как NULL — «годится любому»', async () => {
        createMock.mockImplementation(data =>
            Promise.resolve({ ...data, id: '16' } as OfferTemplate),
        );

        const service = buildService();
        const result = await service.create(
            serverDto({ client_types: [] }),
            docxFile(),
        );

        const written = createMock.mock.calls[0][0];
        expect(written.client_types).toBeNull();
        expect(written.supply_types).toBeNull();
        expect(written.agent_id).toBeNull();

        expect(result.client_types).toBeNull();
        expect(result.supply_types).toBeNull();
        expect(result.agent_id).toBeNull();
    });

    it('create всегда передаёт counter: колонка Int NOT NULL без @default', async () => {
        createMock.mockImplementation(data =>
            Promise.resolve({ ...data, id: '17' } as OfferTemplate),
        );

        const service = buildService();
        await service.create(serverDto(), docxFile());

        expect(createMock.mock.calls[0][0].counter).toBe(0);
    });

    it('update не трогает привязку, если поле не передано, и сбрасывает её пустым массивом', async () => {
        const existing = {
            id: '15',
            type: 'word',
            file_path: 'konstructor/word-templates/t.docx',
            agent_id: 12n,
            client_types: '["org_state"]',
            supply_types: '["internet"]',
        } as OfferTemplate;
        findByIdMock.mockResolvedValue(existing);
        updateMock.mockImplementation((_id, data) =>
            Promise.resolve({ ...existing, ...data } as OfferTemplate),
        );

        const service = buildService();

        // Привязки не переданы — в payload их быть не должно вовсе.
        await service.update(15n, { name: 'Новое имя' });
        const untouched = updateMock.mock.calls[0][1];
        expect('client_types' in untouched).toBe(false);
        expect('supply_types' in untouched).toBe(false);
        expect('agent_id' in untouched).toBe(false);

        // Пустой массив — явный сброс в NULL.
        const reset = await service.update(15n, { client_types: [] });
        expect(updateMock.mock.calls[1][1].client_types).toBeNull();
        expect(reset.client_types).toBeNull();
        // Непереданная привязка осталась прежней.
        expect(reset.supply_types).toEqual([SupplyTypeEnum.INTERNET]);
    });
});
