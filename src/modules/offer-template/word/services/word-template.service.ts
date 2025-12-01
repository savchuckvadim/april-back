import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { OfferTemplateRepository } from '../../offer-template/repositories/offer-template.repository';
import { OfferTemplatePortalRepository } from '../../portal/repositories/offer-template-portal.repository';
import { UserSelectedTemplateRepository } from '../../user-selected/repositories/user-selected-template.repository';
import { StorageService, StorageType } from '../../../../core/storage/storage.service';
import { WordTemplate, WordTemplateSummary } from '../entities/word-template.entity';
import { CreateWordTemplateRequestDto } from '../dtos/create-word-template.dto';
import { UpdateWordTemplateDto } from '../dtos/update-word-template.dto';
import { OfferTemplate, OfferTemplateSummary } from '../../offer-template/entities/offer-template.entity';
import { validateDocxFile } from '../lib/file-validator';
import { offer_templates_visibility } from 'generated/prisma';
import { UserSelectedTemplate } from '../../user-selected';

@Injectable()
export class WordTemplateService {
    constructor(
        private readonly offerTemplateRepository: OfferTemplateRepository,
        private readonly offerTemplatePortalRepository: OfferTemplatePortalRepository,
        private readonly userSelectedTemplateRepository: UserSelectedTemplateRepository,
        private readonly storageService: StorageService,
    ) { }

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
    async findMany(filters?: {
        visibility?: 'public' | 'private' | 'user';
        portal_id?: bigint;
        is_active?: boolean;
        search?: string;
    }): Promise<WordTemplateSummary[]> {
        const templates = await this.offerTemplateRepository.findMany({
            ...filters,
        });

        // Фильтруем только Word шаблоны
        // Для получения file_path нужно загрузить полные данные шаблона
        const wordTemplates: WordTemplateSummary[] = [];

        for (const t of templates) {
            if (t.type === 'word') {
                // Загружаем полные данные для получения file_path
                const fullTemplate = await this.offerTemplateRepository.findById(BigInt(t.id));
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
    async findPublic(): Promise<WordTemplateSummary[]> {
        const templates = await this.offerTemplateRepository.findPublic();
        const wordTemplates: WordTemplateSummary[] = [];

        for (const t of templates) {
            if (t.type === 'word') {
                const fullTemplate = await this.offerTemplateRepository.findById(BigInt(t.id));
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
    async findPortalTemplates(portal_id: bigint): Promise<WordTemplateSummary[]> {
        const templates = await this.offerTemplateRepository.findMany({
            portal_id: portal_id,
            visibility: offer_templates_visibility.portal,
        });

        const fullTemplates: OfferTemplate[] = [];
        for (const t of templates) {
            const fullTemplate = await this.offerTemplateRepository.findById(BigInt(t.id));
            fullTemplate && fullTemplates.push(fullTemplate);
        }
        const wordTemplates: WordTemplateSummary[] = await this.getWordTemplates(fullTemplates);
        return wordTemplates;
        // const wordTemplates: WordTemplateSummary[] = [];

        // for (const t of templates) {
        //     if (t.type === 'word') {
        //         const fullTemplate = await this.offerTemplateRepository.findById(BigInt(t.id));
        //         const summary = new WordTemplateSummary({
        //             id: t.id,
        //             name: t.name,
        //             visibility: t.visibility,
        //             is_default: t.is_default,
        //             type: t.type,
        //             code: t.code,
        //             is_active: t.is_active,
        //             counter: t.counter,
        //             created_at: t.created_at,
        //         });
        //         if (fullTemplate?.file_path) {
        //             summary.template_url = this.getTemplateUrl(
        //                 fullTemplate.file_path,
        //                 String(t.id),
        //             );
        //         }
        //         wordTemplates.push(summary);
        //     }
        // }

        // return wordTemplates;
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
        const templates = await this.offerTemplateRepository.findFullUserTemplates(
            user_id,
            portal_id,
        );

        const wordTemplates: WordTemplateSummary[] = await this.getWordTemplates(templates);
        const selectedTemplates = await this.userSelectedTemplateRepository.findByUser(user_id, portal_id);
        return {
            templates: wordTemplates,
            selected: selectedTemplates,
        };
    }
    private async getWordTemplates(templates: OfferTemplate[]): Promise<WordTemplateSummary[]> {
        return Promise.all(templates
            .filter(t => t.type === 'word')
            .map(t => this.getWordTemplateSummary(t)));
    }
    private async getWordTemplateSummary(template: OfferTemplate): Promise<WordTemplateSummary> {


        const summary = new WordTemplateSummary({
            id: template.id,
            name: template.name,
            visibility: template.visibility,
            is_default: template.is_default,
            type: template.type,
            code: template.code,
            is_active: template.is_active,
            counter: template.counter,
            created_at: template.created_at,

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
        createDto: CreateWordTemplateRequestDto,
        file?: Express.Multer.File,
    ): Promise<WordTemplate> {
        //
        /**
         * Если visibility portal делаем связь  с portal
         * но также должны засунуть userSelectedTemplates связь с пользователем
         * чтобы имел пометку выбран пользователем
         */


        // Валидируем файл (тип, размер)
        validateDocxFile(file, {
            maxSize: 10 * 1024 * 1024, // 10 MB
        });

        // После валидации файл гарантированно существует
        if (!file) {
            throw new BadRequestException('DOCX file is required');
        }

        // Сохраняем файл в хранилище
        const fileName = `${Date.now()}_${file.originalname}`;
        const subPath = 'word-templates';
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
            counter: 0,
        };

        const createdTemplate = await this.offerTemplateRepository.create(
            templateData,
        );

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
            const existing = await this.userSelectedTemplateRepository.findByUserAndTemplate(
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
        return wordTemplate;
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

        const updateData: Partial<OfferTemplate> = {
            ...updateDto,
        };

        // Если загружен новый файл, сохраняем его
        if (file) {
            // Валидируем файл (тип, размер)
            validateDocxFile(file, {
                maxSize: 10 * 1024 * 1024, // 10 MB
            });

            // Удаляем старый файл, если он существует
            if (existingTemplate.file_path) {
                try {
                    await this.storageService.deleteFile(
                        existingTemplate.file_path,
                    );
                } catch (error) {
                    // Игнорируем ошибки удаления
                }
            }

            // Сохраняем новый файл
            const fileName = `${Date.now()}_${file.originalname}`;
            const subPath = 'word-templates';
            const filePath = await this.storageService.saveFile(
                file.buffer,
                fileName,
                StorageType.PUBLIC,
                subPath,
            );
            updateData.file_path = filePath;
        }

        const updatedTemplate = await this.offerTemplateRepository.update(
            id,
            updateData,
        );

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
    async delete(id: bigint): Promise<void> {
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
            } catch (error) {
                // Игнорируем ошибки удаления файла
            }
        }

        // Удаляем шаблон из БД
        await this.offerTemplateRepository.delete(id);
    }

    /**
     * Устанавливает шаблон как активный/неактивный
     */
    async setActive(id: bigint, is_active: boolean): Promise<WordTemplate> {
        const template = await this.findById(id);
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
        if (is_default) {
            const otherTemplates = await this.offerTemplateRepository.findMany({
                visibility: template.visibility,
            });

            for (const otherTemplate of otherTemplates) {
                if (
                    String(otherTemplate.id) !== String(id) &&
                    otherTemplate.type === 'word' &&
                    otherTemplate.is_default
                ) {
                    await this.offerTemplateRepository.update(
                        BigInt(otherTemplate.id),
                        {
                            is_default: false,
                        },
                    );
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
        return `/api/files/word-templates/${filePath.split('/').pop()}`;
    }
}

