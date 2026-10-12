import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { OfferTemplateRepository } from '../../offer-template/repositories/offer-template.repository';
import { OfferTemplatePortalRepository } from '../../portal/repositories/offer-template-portal.repository';
import { UserSelectedTemplateRepository } from '../../user-selected/repositories/user-selected-template.repository';
import { StorageService, StorageType } from '@lib/core/storage/storage.service';
import { serializeTemplateList } from '@lib/portal-lib/konstructor/document-template';
import {
    WordTemplate,
    WordTemplateSummary,
} from '../entities/word-template.entity';
import {
    CreateWordTemplateResponseDto,
    CreateWordTemplateServerDto,
} from '../dtos/create-word-template.dto';
import { UpdateWordTemplateDto } from '../dtos/update-word-template.dto';
import { OfferTemplate } from '../../offer-template/entities/offer-template.entity';
import { OfferTemplatePortal } from '../../portal/entities/offer-template-portal.entity';
import { validateDocxFile } from '../lib/file-validator';
import { offer_templates_visibility } from 'generated/prisma';
import { UserSelectedTemplate } from '../../user-selected';
import { WordTemplateQueryDto } from '../dtos/find-all-word-template.dto';
import { WordTemplateSummaryDto } from '../dtos';
import { toWordTemplateBindings } from '../lib/word-template-bindings.util';

@Injectable()
export class WordTemplateService {
    constructor(
        private readonly offerTemplateRepository: OfferTemplateRepository,
        private readonly offerTemplatePortalRepository: OfferTemplatePortalRepository,
        private readonly userSelectedTemplateRepository: UserSelectedTemplateRepository,
        private readonly storageService: StorageService,
    ) {}

    private isTooLongPrismaError(error: unknown): boolean {
        if (!(error instanceof Error)) return false;
        return error.message.includes(
            "The provided value for the column is too long for the column's type",
        );
    }

    /**
     * Находит Word шаблон по ID
     */
    async findById(id: bigint): Promise<WordTemplate> {
        const template = await this.offerTemplateRepository.findById(id);
        if (!template) {
            throw new NotFoundException(
                `Word template with ID ${id} not found`,
            );
        }

        // Проверяем, что это Word шаблон
        if (template.type !== 'word') {
            throw new BadRequestException(
                `Template with ID ${id} is not a word template`,
            );
        }

        const wordTemplate = WordTemplate.fromOfferTemplate(template);
        wordTemplate.template_url = this.getTemplateUrl(
            template.file_path,
            template.id,
        );
        return wordTemplate;
    }

    /**
     * Находит все Word шаблоны с фильтрами
     */
    async findMany(
        filters?: Partial<WordTemplateQueryDto>,
    ): Promise<WordTemplateSummary[]> {
        const templates = await this.offerTemplateRepository.findMany({
            visibility: filters?.visibility as offer_templates_visibility,
            portal_id: filters?.portal_id
                ? BigInt(filters.portal_id)
                : undefined,
            is_active: filters?.is_active,
            search: filters?.search,
            agent_id: filters?.agent_id ? BigInt(filters.agent_id) : undefined,
            client_type: filters?.client_type,
            supply_type: filters?.supply_type,
        });

        // Фильтруем только Word шаблоны
        // Для получения file_path нужно загрузить полные данные шаблона
        const wordTemplates: WordTemplateSummary[] = [];

        for (const t of templates) {
            if (t.type === 'word') {
                // Загружаем полные данные для получения file_path
                const fullTemplate =
                    await this.offerTemplateRepository.findById(BigInt(t.id));
                const summary = new WordTemplateSummary({
                    id: t.id,
                    name: t.name,
                    visibility: t.visibility,
                    is_default: t.is_default,
                    type: t.type,
                    code: t.code,
                    is_active: t.is_active,
                    counter: t.counter,
                    created_at: t.created_at,
                    ...toWordTemplateBindings(t),
                });
                if (fullTemplate?.file_path) {
                    summary.template_url = this.getTemplateUrl(
                        fullTemplate.file_path,
                        String(t.id),
                    );
                }
                wordTemplates.push(summary);
            }
        }

        return wordTemplates;
    }

    /**
     * Находит публичные Word шаблоны
     */
    async findPublic(): Promise<WordTemplateSummaryDto[]> {
        const templates = await this.offerTemplateRepository.findPublic();
        const wordTemplates: WordTemplateSummaryDto[] = [];

        for (const t of templates) {
            if (t.type === 'word') {
                const fullTemplate =
                    await this.offerTemplateRepository.findById(BigInt(t.id));
                const summary = new WordTemplateSummaryDto({
                    id: t.id,
                    name: t.name,
                    visibility: t.visibility,
                    is_default: t.is_default,
                    type: t.type,
                    code: t.code,
                    is_active: t.is_active,
                    counter: t.counter,
                    created_at: t.created_at,
                    ...toWordTemplateBindings(t),
                });
                if (fullTemplate?.file_path) {
                    summary.template_url = this.getTemplateUrl(
                        fullTemplate.file_path,
                        String(t.id),
                    );
                }
                wordTemplates.push(summary);
            }
        }

        return wordTemplates;
    }

    // /**
    //  * Находит Word шаблоны c определенным портал id
    //  */
    // async findByPortal(portal_id: bigint): Promise<WordTemplateSummary[]> {
    //     const templates = await this.offerTemplateRepository.findByPortal(portal_id);
    //     const wordTemplates: WordTemplateSummary[] = [];

    //     for (const t of templates) {
    //         if (t.type === 'word') {
    //             const fullTemplate = await this.offerTemplateRepository.findById(BigInt(t.id));
    //             const summary = new WordTemplateSummary({
    //                 id: t.id,
    //                 name: t.name,
    //                 visibility: t.visibility,
    //                 is_default: t.is_default,
    //                 type: t.type,
    //                 code: t.code,
    //                 is_active: t.is_active,
    //                 counter: t.counter,
    //                 created_at: t.created_at,
    //             });
    //             if (fullTemplate?.file_path) {
    //                 summary.template_url = this.getTemplateUrl(
    //                     fullTemplate.file_path,
    //                     String(t.id),
    //                 );
    //             }
    //             wordTemplates.push(summary);
    //         }
    //     }

    //     return wordTemplates;
    // }

    /**
     * Находит Word шаблоны для портала
     */
    async findPortalTemplates(
        portal_id: bigint,
    ): Promise<WordTemplateSummaryDto[]> {
        const templates = await this.offerTemplateRepository.findMany({
            portal_id: portal_id,
            visibility: offer_templates_visibility.private,
        });

        const fullTemplates: OfferTemplate[] = [];
        for (const t of templates) {
            const fullTemplate = await this.offerTemplateRepository.findById(
                BigInt(t.id),
            );
            if (fullTemplate) {
                fullTemplates.push(fullTemplate);
            }
        }

        const wordTemplates: WordTemplateSummary[] =
            this.getWordTemplates(fullTemplates);
        const result = wordTemplates.map(
            t =>
                new WordTemplateSummaryDto({
                    ...t,
                    portal_id: Number(portal_id.toString()),
                }),
        );
        return result;
    }

    /**
     * Находит Word шаблоны пользователя
     */
    async findUserTemplates(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<{
        templates: WordTemplateSummary[];
        selected: UserSelectedTemplate[];
    }> {
        const templates =
            await this.offerTemplateRepository.findFullUserTemplates(
                user_id,
                portal_id,
            );

        const wordTemplates: WordTemplateSummary[] =
            this.getWordTemplates(templates);

        const selectedTemplates =
            await this.userSelectedTemplateRepository.findByUser(
                user_id,
                portal_id,
            );

        return {
            templates: wordTemplates,
            selected: selectedTemplates,
        };
    }
    private getWordTemplates(
        templates: OfferTemplate[],
    ): WordTemplateSummary[] {
        return templates
            .filter(t => t.type === 'word')
            .map(t => this.getWordTemplateSummary(t));
    }
    private getWordTemplateSummary(
        template: OfferTemplate,
    ): WordTemplateSummary {
        const summary = new WordTemplateSummary({
            id: template.id,
            name: template.name,
            visibility: template.visibility,
            is_default: template.is_default,
            type: template.type,
            code: template.code,
            is_active: template.is_active,
            is_archived: template.is_archived,
            user_id: template.creator_bitrix_user_id
                ? Number(template.creator_bitrix_user_id.toString())
                : undefined,
            portal_id: template.portal_id
                ? Number(template.portal_id.toString())
                : undefined,
            counter: template.counter,
            created_at: template.created_at,
            tags: template.tags,
            ...toWordTemplateBindings(template),
        });
        if (template?.file_path) {
            summary.template_url = this.getTemplateUrl(
                template.file_path,
                String(template.id),
            );
        }
        return summary;
    }
    /**
     * Создает новый Word шаблон с загрузкой docx файла
     */
    async create(
        createDto: CreateWordTemplateServerDto,
        file?: Express.Multer.File,
    ): Promise<CreateWordTemplateResponseDto> {
        //
        /**
         * Если visibility portal(private)  делаем связь  с portal
         * но также должны засунуть userSelectedTemplates связь с пользователем
         * чтобы имел пометку выбран пользователем
         */

        // Валидируем файл (тип, размер)
        validateDocxFile(file);

        // После валидации файл гарантированно существует
        if (!file) {
            throw new BadRequestException('DOCX file is required');
        }

        // Сохраняем файл в хранилище
        const fileName = `${Date.now()}_${file.originalname}`;
        const subPath = 'konstructor/word-templates';
        const filePath = await this.storageService.saveFile(
            file.buffer,
            fileName,
            StorageType.PUBLIC,
            subPath,
        );
        // Создаем шаблон в БД
        const templateData: Partial<OfferTemplate> = {
            name: createDto.name,
            visibility: createDto.visibility || offer_templates_visibility.user,
            is_default: createDto.is_default || false,
            file_path: filePath,
            type: 'word',
            code: createDto.code,
            tags: createDto.tags,
            is_active: createDto.is_active || false,
            // counter в схеме Int NOT NULL без @default — передаём явно.
            counter: 0,
            // Привязки шаблона: массивы из DTO сериализуются в JSON-строку,
            // пустой список и отсутствие поля → NULL («годится любому»).
            agent_id:
                createDto.agent_id != null ? BigInt(createDto.agent_id) : null,
            client_types: serializeTemplateList(createDto.client_types),
            supply_types: serializeTemplateList(createDto.supply_types),
        };

        if (createDto.user_id) {
            templateData.creator_bitrix_user_id = BigInt(createDto.user_id);
        }

        let createdTemplate: OfferTemplate;
        try {
            createdTemplate =
                await this.offerTemplateRepository.create(templateData);
        } catch (error) {
            if (this.isTooLongPrismaError(error)) {
                throw new BadRequestException(
                    'One of the fields is too long (name/tags). Max length is 255 characters.',
                );
            }
            throw error;
        }

        // Если указан portal_id, создаем связь с порталом
        if (createDto.portal_id) {
            await this.offerTemplatePortalRepository.create({
                offer_template_id: BigInt(createdTemplate.id!),
                portal_id: BigInt(createDto.portal_id),
                is_default: createDto.is_default || false,
                is_active: true,
            });
        }

        // Если указан user_id, создаем связь с пользователем
        if (createDto.user_id && createDto.portal_id) {
            // Проверяем, не существует ли уже такая связь
            const existing =
                await this.userSelectedTemplateRepository.findByUserAndTemplate(
                    BigInt(createDto.user_id),
                    BigInt(createDto.portal_id),
                    BigInt(createdTemplate.id!),
                );

            if (!existing) {
                await this.userSelectedTemplateRepository.create({
                    bitrix_user_id: BigInt(createDto.user_id),
                    portal_id: BigInt(createDto.portal_id),
                    offer_template_id: BigInt(createdTemplate.id!),
                    is_current: createDto.is_default || false,
                    is_favorite: false,
                    is_active: true,
                });
            }
        }

        const wordTemplate = WordTemplate.fromOfferTemplate(createdTemplate);
        wordTemplate.template_url = this.getTemplateUrl(
            filePath,
            createdTemplate.id,
        );
        return new CreateWordTemplateResponseDto(wordTemplate);
    }

    /**
     * Обновляет Word шаблон
     */
    async update(
        id: bigint,
        updateDto: UpdateWordTemplateDto,
        file?: Express.Multer.File,
    ): Promise<WordTemplate> {
        const existingTemplate =
            await this.offerTemplateRepository.findById(id);
        if (!existingTemplate) {
            throw new NotFoundException(
                `Word template with ID ${id} not found`,
            );
        }

        // Проверяем, что это Word шаблон
        if (existingTemplate.type !== 'word') {
            throw new BadRequestException(
                `Template with ID ${id} is not a word template`,
            );
        }

        // Привязки отделяем от остальных полей: в DTO они массивы/строка,
        // а в сущности БД — JSON-строка и bigint, так что спред напрямую
        // положил бы в сущность неверный тип.
        const {
            agent_id: agentId,
            client_types: clientTypes,
            supply_types: supplyTypes,
            ...rest
        } = updateDto;

        const updateData: Partial<OfferTemplate> = { ...rest };

        // Поле не передано — не трогаем; передан пустой массив — сбрасываем
        // в NULL («годится любому»).
        if (agentId !== undefined) {
            updateData.agent_id = agentId != null ? BigInt(agentId) : null;
        }
        if (clientTypes !== undefined) {
            updateData.client_types = serializeTemplateList(clientTypes);
        }
        if (supplyTypes !== undefined) {
            updateData.supply_types = serializeTemplateList(supplyTypes);
        }

        // Если загружен новый файл, сохраняем его
        if (file) {
            // Валидируем файл (тип, размер)
            validateDocxFile(file, {
                maxSize: 25 * 1024 * 1024, // 25 MB
            });

            // Удаляем старый файл, если он существует
            if (existingTemplate.file_path) {
                try {
                    await this.storageService.deleteFile(
                        existingTemplate.file_path,
                    );
                } catch {
                    // Игнорируем ошибки удаления
                }
            }

            // Сохраняем новый файл
            const fileName = `${Date.now()}_${file.originalname}`;
            const subPath = 'konstructor/word-templates';
            const filePath = await this.storageService.saveFile(
                file.buffer,
                fileName,
                StorageType.PUBLIC,
                subPath,
            );
            updateData.file_path = filePath;
        }

        let updatedTemplate: OfferTemplate;
        try {
            updatedTemplate = await this.offerTemplateRepository.update(
                id,
                updateData,
            );
        } catch (error) {
            if (this.isTooLongPrismaError(error)) {
                throw new BadRequestException(
                    'One of the fields is too long (name/tags). Max length is 255 characters.',
                );
            }
            throw error;
        }

        const wordTemplate = WordTemplate.fromOfferTemplate(updatedTemplate);
        wordTemplate.template_url = this.getTemplateUrl(
            updatedTemplate.file_path,
            updatedTemplate.id,
        );
        return wordTemplate;
    }

    /**
     * Удаляет Word шаблон
     */
    async delete(id: bigint): Promise<boolean> {
        const existingTemplate =
            await this.offerTemplateRepository.findById(id);
        if (!existingTemplate) {
            throw new NotFoundException(
                `Word template with ID ${id} not found`,
            );
        }

        // Проверяем, что это Word шаблон
        if (existingTemplate.type !== 'word') {
            throw new BadRequestException(
                `Template with ID ${id} is not a word template`,
            );
        }

        // Удаляем файл из хранилища
        if (existingTemplate.file_path) {
            try {
                await this.storageService.deleteFile(
                    existingTemplate.file_path,
                );
            } catch {
                // Игнорируем ошибки удаления файла
            }
        }

        // Удаляем шаблон из БД
        await this.offerTemplateRepository.delete(id);
        return true;
    }

    async archive(id: bigint): Promise<boolean> {
        const existingTemplate =
            await this.offerTemplateRepository.findById(id);
        if (!existingTemplate) {
            throw new NotFoundException(
                `Word template with ID ${id} not found`,
            );
        }
        await this.offerTemplateRepository.update(id, {
            is_archived: true,
            is_active: true,
            archived_at: new Date(),
        });
        return true;
    }

    async unarchive(id: bigint): Promise<boolean> {
        const existingTemplate =
            await this.offerTemplateRepository.findById(id);
        if (!existingTemplate) {
            throw new NotFoundException(
                `Word template with ID ${id} not found`,
            );
        }
        await this.offerTemplateRepository.update(id, {
            is_archived: false,
            is_active: false,
            archived_at: undefined,
        });
        return true;
    }
    /**
     * Устанавливает шаблон как активный/неактивный
     */
    async setActive(id: bigint, is_active: boolean): Promise<WordTemplate> {
        await this.findById(id); // ensure correct type/checks
        const updatedTemplate = await this.offerTemplateRepository.update(id, {
            is_active,
        });
        const wordTemplate = WordTemplate.fromOfferTemplate(updatedTemplate);
        wordTemplate.template_url = this.getTemplateUrl(
            updatedTemplate.file_path,
            updatedTemplate.id,
        );
        return wordTemplate;
    }

    /**
     * Устанавливает шаблон как шаблон по умолчанию
     */
    async setDefault(id: bigint, is_default: boolean): Promise<WordTemplate> {
        const template = await this.findById(id);

        // Если устанавливаем как default, снимаем default с других шаблонов
        // ТОЙ ЖЕ ОБЛАСТИ. Раньше область была только visibility, то есть
        // default у портального шаблона снимал default у шаблонов ВСЕХ
        // порталов разом (у offer_templates нет portal_id — привязка
        // в join-таблице, и фильтр по visibility её не учитывал).
        if (is_default) {
            const scopeIds = await this.collectDefaultScopeIds(id, template);
            for (const otherId of scopeIds) {
                if (otherId !== String(id)) {
                    await this.offerTemplateRepository.update(BigInt(otherId), {
                        is_default: false,
                    });
                }
            }
        }

        const updatedTemplate = await this.offerTemplateRepository.update(id, {
            is_default,
        });
        const wordTemplate = WordTemplate.fromOfferTemplate(updatedTemplate);
        wordTemplate.template_url = this.getTemplateUrl(
            updatedTemplate.file_path,
            updatedTemplate.id,
        );
        return wordTemplate;
    }

    /**
     * id word-шаблонов с is_default = true в той же области, что и .
     *
     *  - public  → все публичные word-шаблоны (как и раньше: один общий
     *              default на всех);
     *  - private → шаблоны, привязанные к ТЕМ ЖЕ порталам, что и этот
     *              (через offer_template_portal). Шаблон может быть привязан
     *              к нескольким порталам — область объединяется по всем;
     *  - user    → шаблоны того же создателя на тех же порталах.
     *
     * Шаблон без единой привязки к порталу (сирота) области не имеет —
     * у него не снимается ничего, кроме как у самого себя.
     */
    private async collectDefaultScopeIds(
        id: bigint,
        template: WordTemplate,
    ): Promise<string[]> {
        const isWordDefault = (candidate: {
            id: bigint | string;
            type: string;
            is_default: boolean;
        }): boolean => candidate.type === 'word' && candidate.is_default;

        if (template.visibility === offer_templates_visibility.public) {
            const publicTemplates = await this.offerTemplateRepository.findMany(
                {
                    visibility: offer_templates_visibility.public,
                },
            );
            return publicTemplates
                .filter(isWordDefault)
                .map(candidate => String(candidate.id));
        }

        const bindings =
            await this.offerTemplatePortalRepository.findByTemplate(id);
        const portalIds = [...new Set(bindings.map(b => String(b.portal_id)))];
        const ids = new Set<string>();

        for (const portalId of portalIds) {
            const scoped =
                template.visibility === offer_templates_visibility.user &&
                template.user_id != null
                    ? await this.offerTemplateRepository.findUserTemplates(
                          BigInt(template.user_id),
                          BigInt(portalId),
                      )
                    : await this.offerTemplateRepository.findByPortal(
                          BigInt(portalId),
                      );
            for (const candidate of scoped.filter(isWordDefault)) {
                ids.add(String(candidate.id));
            }
        }
        return [...ids];
    }

    /**
     * Синхронизация привязок шаблона к порталам под мультиселект админки.
     *
     * Принимает ПОЛНЫЙ желаемый список: недостающие привязки создаются,
     * лишние удаляются, существующие не трогаются (их is_default/is_active
     * сохраняются). Новая привязка создаётся АКТИВНОЙ: в join-таблице
     * is_active по умолчанию false, и без этого свежепривязанный шаблон
     * был бы невидим на портале — ровно та ловушка, из-за которой
     * страничные шаблоны КП сегодня не видны ни одному порталу.
     */
    async syncPortals(
        id: bigint,
        portalIds: readonly string[],
    ): Promise<OfferTemplatePortal[]> {
        await this.findById(id);

        const wanted = new Set(portalIds.map(value => String(BigInt(value))));
        const existing =
            await this.offerTemplatePortalRepository.findByTemplate(id);
        const existingByPortal = new Map(
            existing.map(binding => [String(binding.portal_id), binding]),
        );

        for (const binding of existing) {
            if (!wanted.has(String(binding.portal_id))) {
                await this.offerTemplatePortalRepository.delete(binding.id);
            }
        }

        for (const portalId of wanted) {
            if (!existingByPortal.has(portalId)) {
                await this.offerTemplatePortalRepository.create({
                    offer_template_id: id,
                    portal_id: BigInt(portalId),
                    is_default: false,
                    is_active: true,
                });
            }
        }

        return this.offerTemplatePortalRepository.findByTemplate(id);
    }

    private async getPortalIdByTemplateId(
        templateId: bigint,
    ): Promise<number | undefined> {
        const portalTemplate =
            await this.offerTemplatePortalRepository.findByTemplate(templateId);
        if (!portalTemplate) {
            return undefined;
        }
        const portalId =
            Number(portalTemplate[0].portal_id.toString()) || undefined;
        return portalId;
    }

    /**
     * Получает URL для доступа к шаблону
     * Генерирует публичный URL для скачивания шаблона через API
     * @param filePath - путь к файлу в хранилище
     * @param templateId - ID шаблона (опционально, для генерации URL через API)
     */
    private getTemplateUrl(filePath: string, templateId?: string): string {
        if (templateId) {
            // Генерируем URL через API эндпоинт для скачивания
            return `/api/word-templates/${String(templateId)}/download`;
        }
        // Если ID не передан, возвращаем путь к файлу (для обратной совместимости)
        return `/api/files/konstructor/word-templates/${filePath.split('/').pop()}`;
    }
}
