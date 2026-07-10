import { CallV3ApiService } from '../../../../core/base/call-v3-api.service';
import {
    EBxHrNodeType,
    IBXHrNode,
    IBXHrNodeTree,
    IBXHrNodeWithMembers,
    THrNodeField,
} from '../../interfaces/hr.interface';
import { HR_NODE, THrNodeListItem } from '../schema/hr-node.schema';
import { BxV3MethodMap } from '../../../../core/schema/bx-v3-method-map';

const ALL_FIELDS_WITH_MEMBERS: THrNodeField[] = [
    'id',
    'name',
    'type',
    'structureId',
    'parentId',
    'description',
    'accessCode',
    'userCount',
    'colorName',
    'xmlId',
    'createdAt',
    'updatedAt',
    'members',
];

/**
 * Отделы и команды структуры компании (humanresources.node.*).
 * Не injectable — создаётся на конкретный портал через BitrixV3Service.
 */
export class BxHrNodeService {
    constructor(private readonly api: CallV3ApiService) {}

    /** Список узлов типа (одна страница, максимум 200) */
    async list(
        request: BxV3MethodMap[typeof HR_NODE.LIST]['request'],
    ): Promise<THrNodeListItem[]> {
        const { items } = await this.api.call(HR_NODE.LIST, request);
        return items;
    }

    /** ВСЕ узлы типа (пагинация выкачивается целиком) */
    async getAll(
        type: EBxHrNodeType,
        select?: THrNodeField[],
    ): Promise<THrNodeListItem[]> {
        return await this.api.callAll(HR_NODE.LIST, { type, select });
    }

    /** Все команды портала */
    async getTeams(select?: THrNodeField[]): Promise<THrNodeListItem[]> {
        return await this.getAll(EBxHrNodeType.TEAM, select);
    }

    /** Все отделы портала */
    async getDepartments(select?: THrNodeField[]): Promise<THrNodeListItem[]> {
        return await this.getAll(EBxHrNodeType.DEPARTMENT, select);
    }

    /** Узел по id */
    async getById(
        id: number,
        select?: THrNodeField[],
    ): Promise<THrNodeListItem> {
        const { item } = await this.api.call(HR_NODE.GET, { id, select });
        return item;
    }

    /** Узел по id со всеми полями и участниками */
    async getWithMembers(id: number): Promise<IBXHrNodeWithMembers> {
        const item = await this.getById(id, ALL_FIELDS_WITH_MEMBERS);
        return { ...item, members: item.members ?? [] };
    }

    /** Дочерние узлы */
    async getChildren(id: number): Promise<IBXHrNode[]> {
        const { items } = await this.api.call(HR_NODE.CHILDREN, { id });
        return items;
    }

    /** Поиск узлов по части названия */
    async search(
        type: EBxHrNodeType,
        name: string,
        parentId?: number,
    ): Promise<IBXHrNode[]> {
        const { items } = await this.api.call(HR_NODE.SEARCH, {
            type,
            name,
            parentId,
        });
        return items;
    }

    /** Количество отделов и команд на портале */
    async count(): Promise<{ departments: number; teams: number }> {
        return await this.api.call(HR_NODE.COUNT, {});
    }

    /** Создать отдел или команду */
    async add(
        request: BxV3MethodMap[typeof HR_NODE.ADD]['request'],
    ): Promise<IBXHrNodeWithMembers> {
        return await this.api.call(HR_NODE.ADD, request);
    }

    /** Изменить название/описание/цвет узла */
    async edit(
        request: BxV3MethodMap[typeof HR_NODE.EDIT]['request'],
    ): Promise<IBXHrNode> {
        return await this.api.call(HR_NODE.EDIT, request);
    }

    /** Переместить узел к новому родителю */
    async move(id: number, parentId: number): Promise<IBXHrNode> {
        return await this.api.call(HR_NODE.MOVE, { id, parentId });
    }

    /**
     * Поддерево узла с участниками на каждом уровне.
     * Например: команда ЦУП -> команды территорий -> группы.
     * Уровни обходятся параллельно (Promise.all), batch в v3 не нужен.
     */
    async getSubtreeWithMembers(rootId: number): Promise<IBXHrNodeTree> {
        const [node, children] = await Promise.all([
            this.getWithMembers(rootId),
            this.getChildren(rootId),
        ]);
        const childTrees = await Promise.all(
            children.map(child => this.getSubtreeWithMembers(child.id)),
        );
        return { node, children: childTrees };
    }
}
