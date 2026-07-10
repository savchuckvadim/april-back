import { IBitrixV3Pagination } from '../../../../core/interface/bitrix-v3-response.interface';
import {
    EBxHrNodeType,
    IBXHrNode,
    IBXHrNodeMember,
    IBXHrNodeWithMembers,
    TBxHrTeamColor,
    THrMemberRoleMap,
    THrNodeField,
    THrNodeFilterTuple,
    THrNodeOrder,
} from '../../interfaces/hr.interface';

/** Константы методов узлов структуры (отделы и команды) */
export const HR_NODE = {
    LIST: 'humanresources.node.list',
    GET: 'humanresources.node.get',
    CHILDREN: 'humanresources.node.children',
    SEARCH: 'humanresources.node.search',
    COUNT: 'humanresources.node.count',
    ADD: 'humanresources.node.add',
    EDIT: 'humanresources.node.edit',
    MOVE: 'humanresources.node.move',
} as const;

/** Узел в списочных ответах: members присутствует, если запрошен в select */
export type THrNodeListItem = IBXHrNode & { members?: IBXHrNodeMember[] };

/** Схема методов humanresources.node.* (формы сверены с живым порталом 07.2026) */
export interface HrNodeMethods {
    'humanresources.node.list': {
        request: {
            type: EBxHrNodeType;
            select?: THrNodeField[];
            order?: THrNodeOrder;
            /** см. предупреждение в THrNodeFilterTuple */
            filter?: THrNodeFilterTuple[];
            pagination?: IBitrixV3Pagination;
        };
        response: { items: THrNodeListItem[] };
    };
    'humanresources.node.get': {
        request: { id: number; select?: THrNodeField[] };
        response: { item: THrNodeListItem };
    };
    'humanresources.node.children': {
        request: {
            id: number;
            select?: Exclude<THrNodeField, 'members'>[];
        };
        response: { items: IBXHrNode[] };
    };
    'humanresources.node.search': {
        request: {
            type: EBxHrNodeType;
            /** Поиск по части названия */
            name: string;
            parentId?: number;
            pagination?: IBitrixV3Pagination;
        };
        response: { items: IBXHrNode[] };
    };
    'humanresources.node.count': {
        request: { type?: EBxHrNodeType };
        response: { departments: number; teams: number };
    };
    'humanresources.node.add': {
        request: {
            type: EBxHrNodeType;
            name: string;
            parentId: number;
            description?: string;
            colorName?: TBxHrTeamColor;
            userIds?: THrMemberRoleMap;
            /** Только для DEPARTMENT: перевести пользователей из прежнего отдела */
            moveUsersToNode?: boolean;
            createChat?: boolean;
            bindingChatIds?: number[];
            createChannel?: boolean;
        };
        response: IBXHrNodeWithMembers;
    };
    'humanresources.node.edit': {
        request: {
            id: number;
            name?: string;
            description?: string;
            colorName?: TBxHrTeamColor;
        };
        response: IBXHrNode;
    };
    'humanresources.node.move': {
        request: { id: number; parentId: number };
        response: IBXHrNode;
    };
}
