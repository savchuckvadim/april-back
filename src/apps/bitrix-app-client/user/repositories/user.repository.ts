import { User } from '../entities/user.entity';

export abstract class UserRepository {
    abstract create(user: Partial<User>): Promise<User | null>;
    abstract findById(id: number): Promise<User | null>;
    abstract findByEmail(email: string): Promise<User | null>;
    abstract findByClientId(clientId: number): Promise<User[] | null>;
    abstract findByBitrixId(bitrixId: string): Promise<User | null>;
    abstract findMany(): Promise<User[] | null>;
    abstract update(id: number, user: Partial<User>): Promise<User | null>;
    abstract updateByEmail(email: string, user: Partial<User>): Promise<User | null>;
    abstract delete(id: number): Promise<boolean>;
    abstract findOwnerByClientId(clientId: number): Promise<User | null>;
    abstract findByRoleId(roleId: number): Promise<User[] | null>;
    abstract findActiveUsersByClientId(clientId: number): Promise<User[] | null>;
}
