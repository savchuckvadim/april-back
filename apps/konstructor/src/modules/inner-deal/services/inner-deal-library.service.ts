import {
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { BxDocumentDeal } from 'generated/prisma';
import { BxDepartmentStructureService } from '@lib/bx-department';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { InnerDealRepository } from '../repositories/inner-deal.repository';
import {
    InnerDealLibraryCreateDto,
    InnerDealLibraryItemDto,
    InnerDealLibraryPatchDto,
    InnerDealLibraryRightsDto,
} from '../dto/inner-deal-library.dto';
import {
    allowedVisibilities,
    authorOf,
    canEdit,
    effectiveKind,
    effectiveVisibility,
    isVisibleTo,
    LibraryActor,
    LibraryKind,
} from '../lib/library-visibility.util';

/**
 * Библиотека заготовок (избранное + акции). Роль пользователя — из структуры
 * отделов продаж портала: сотрудник, руководитель (HEADS/настройки), суперпользователь
 * вендора. Портал без структуры продаж (сервисный отдел и т.п.) — все сотрудники.
 */
@Injectable()
export class InnerDealLibraryService {
    private readonly logger = new Logger(InnerDealLibraryService.name);

    constructor(
        private readonly repository: InnerDealRepository,
        private readonly structure: BxDepartmentStructureService,
    ) {}

    async rights(
        domain: string,
        userId: number,
    ): Promise<InnerDealLibraryRightsDto> {
        const actor = await this.resolveActor(domain, userId);
        return {
            isHead: actor.isHead,
            isSuperUser: actor.isSuperUser,
            departmentId: actor.departmentId,
            favoriteVisibilities: allowedVisibilities(actor, 'favorite'),
            promotionVisibilities: allowedVisibilities(actor, 'promotion'),
        };
    }

    /** Всё, что видно пользователю: своё + отдел + портал + глобальные акции. */
    async list(
        domain: string,
        userId: number,
        kind?: LibraryKind,
    ): Promise<InnerDealLibraryItemDto[]> {
        const [actor, portalId] = await Promise.all([
            this.resolveActor(domain, userId),
            this.repository.findPortalIdByDomain(domain),
        ]);
        const rows = await this.repository.listLibrary(portalId);
        return rows
            .filter(row => isVisibleTo(row, actor))
            .filter(row => !kind || effectiveKind(row) === kind)
            .map(row => this.toItem(row, actor));
    }

    /** Полный слепок заготовки — для загрузки в конструктор. Чужое невидимое — 404. */
    async get(
        domain: string,
        userId: number,
        id: number,
    ): Promise<BxDocumentDeal> {
        const [actor, row] = await Promise.all([
            this.resolveActor(domain, userId),
            this.repository.findById(BigInt(id)),
        ]);
        if (!row || effectiveKind(row) === null || !isVisibleTo(row, actor)) {
            throw new NotFoundException(`Заготовка ${id} не найдена`);
        }
        return row;
    }

    async create(dto: InnerDealLibraryCreateDto): Promise<BxDocumentDeal> {
        const actor = await this.resolveActor(dto.domain, dto.userId);
        if (!allowedVisibilities(actor, dto.kind).includes(dto.visibility)) {
            throw new ForbiddenException(
                `Видимость «${dto.visibility}» для ${dto.kind} недоступна пользователю ${dto.userId}`,
            );
        }
        const portalId = await this.repository.findPortalIdByDomain(dto.domain);
        const { snapshot } = dto;
        return this.repository.create({
            portalId,
            domain: dto.domain,
            dealId: null,
            serviceSmartId: null,
            smartId: null,
            userId: dto.userId,
            creatorBxUserId: dto.userId,
            kind: dto.kind,
            visibility: dto.visibility,
            title: dto.title,
            department:
                dto.visibility === 'department' && actor.departmentId !== null
                    ? String(actor.departmentId)
                    : null,
            // Laravel-избранное читает по isFavorite — оставляем совместимость
            isFavorite: dto.kind === 'favorite' ? true : null,
            isActive: true,
            isArchived: false,
            templateId:
                snapshot.templateId === null ||
                snapshot.templateId === undefined
                    ? null
                    : BigInt(snapshot.templateId),
            dealName: snapshot.dealName ?? null,
            app: snapshot.app ?? null,
            global: snapshot.global ?? null,
            currentComplect: snapshot.currentComplect ?? null,
            od: snapshot.od ?? null,
            result: snapshot.result ?? null,
            contract: snapshot.contract ?? null,
            product: snapshot.product ?? null,
            rows: snapshot.rows ?? null,
            regions: snapshot.regions ?? null,
            iskraConfig: snapshot.iskraConfig ?? null,
            ltOther: snapshot.ltOther ?? null,
        });
    }

    async patch(
        id: number,
        dto: InnerDealLibraryPatchDto,
    ): Promise<BxDocumentDeal> {
        const { actor, row } = await this.requireEditable(
            dto.domain,
            dto.userId,
            id,
        );
        const data: Partial<BxDocumentDeal> = {};
        if (dto.title !== undefined) data.title = dto.title;
        if (dto.visibility !== undefined) {
            const kind = effectiveKind(row) ?? 'favorite';
            if (!allowedVisibilities(actor, kind).includes(dto.visibility)) {
                throw new ForbiddenException(
                    `Видимость «${dto.visibility}» недоступна пользователю ${dto.userId}`,
                );
            }
            data.visibility = dto.visibility;
            data.department =
                dto.visibility === 'department' && actor.departmentId !== null
                    ? String(actor.departmentId)
                    : null;
        }
        if (dto.isArchived !== undefined) {
            data.isArchived = dto.isArchived;
            data.archivedAt = dto.isArchived ? new Date() : null;
        }
        // легаси-строке проставляем kind, чтобы дальше читалась без isFavorite-эвристики
        if (row.kind === null) data.kind = effectiveKind(row);
        return this.repository.update(row.id, data);
    }

    async delete(domain: string, userId: number, id: number): Promise<boolean> {
        const { row } = await this.requireEditable(domain, userId, id);
        return this.repository.delete(row.id);
    }

    private async requireEditable(
        domain: string,
        userId: number,
        id: number,
    ): Promise<{ actor: LibraryActor; row: BxDocumentDeal }> {
        const [actor, row] = await Promise.all([
            this.resolveActor(domain, userId),
            this.repository.findById(BigInt(id)),
        ]);
        if (!row || effectiveKind(row) === null) {
            throw new NotFoundException(`Заготовка ${id} не найдена`);
        }
        if (!canEdit(row, actor)) {
            throw new ForbiddenException(
                `Заготовку ${id} может править только автор или руководитель`,
            );
        }
        return { actor, row };
    }

    private toItem(
        row: BxDocumentDeal,
        actor: LibraryActor,
    ): InnerDealLibraryItemDto {
        return {
            id: Number(row.id),
            kind: effectiveKind(row) ?? 'favorite',
            visibility: effectiveVisibility(row),
            title: row.title ?? null,
            dealName: row.dealName ?? null,
            authorId: authorOf(row),
            departmentId: row.department ?? null,
            canEdit: canEdit(row, actor),
            isArchived: row.isArchived,
            createdAt: row.created_at?.toISOString() ?? null,
            updatedAt: row.updated_at?.toISOString() ?? null,
        };
    }

    /**
     * Роль из структуры отделов продаж. Структуры нет (портал без ОП,
     * сервисный отдел, REST недоступен) — обычный сотрудник без отдела:
     * библиотека работает, просто без отдельских заготовок.
     */
    private async resolveActor(
        domain: string,
        userId: number,
    ): Promise<LibraryActor> {
        try {
            const structure = await this.structure.getStructure(
                domain,
                EDepartamentGroup.sales,
                userId,
            );
            const current = structure.currentUser;
            const ownDepartment =
                structure.salesDepartments.find(sales =>
                    sales.allUsers.some(user => Number(user.ID) === userId),
                )?.department.ID ?? null;
            const departmentId =
                ownDepartment ??
                (structure.department.department > 0
                    ? structure.department.department
                    : null);
            return {
                userId,
                departmentId,
                isHead:
                    current.isHead ||
                    current.visibility === 'department' ||
                    current.visibility === 'all',
                isSuperUser: current.isSuperUser,
            };
        } catch (error) {
            this.logger.warn(
                `${domain} user ${userId}: структура отделов недоступна, роль — сотрудник (${
                    error instanceof Error ? error.message : String(error)
                })`,
            );
            return {
                userId,
                departmentId: null,
                isHead: false,
                isSuperUser: false,
            };
        }
    }
}
