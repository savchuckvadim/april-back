import { ComplectEntity } from '../complect.entity';

export abstract class ComplectRepository {
    abstract create(
        complect: Partial<ComplectEntity>,
    ): Promise<ComplectEntity | null>;
    abstract update(
        complect: Partial<ComplectEntity>,
    ): Promise<ComplectEntity | null>;
    abstract findById(id: string): Promise<ComplectEntity | null>;
    abstract findMany(): Promise<ComplectEntity[] | null>;
    abstract findByCode(code: string): Promise<ComplectEntity | null>;

    // Методы для управления связями с инфоблоками
    abstract addInfoblocks(
        complectId: string,
        infoblockIds: string[],
    ): Promise<ComplectEntity | null>;
    abstract removeInfoblocks(
        complectId: string,
        infoblockIds: string[],
    ): Promise<ComplectEntity | null>;
    abstract removeInfoblock(
        complectId: string,
        infoblockId: string,
    ): Promise<ComplectEntity | null>;
    abstract setInfoblocks(
        complectId: string,
        infoblockIds: string[],
    ): Promise<ComplectEntity | null>;
}
