import { ConflictException, NotFoundException } from '@nestjs/common';
import { Portal, User } from 'generated/prisma';
import { ClientWithRelations } from '../entity/client.entity';
import { ClientRepository } from '../repositories/client.repository';
import { ClientService } from '../services/client.service';

const client = (
    overrides: Partial<ClientWithRelations> = {},
): ClientWithRelations =>
    ({
        id: 6n,
        name: 'Альфа-Центр',
        email: null,
        status: 'active',
        is_active: true,
        created_at: null,
        updated_at: null,
        portal: null,
        users: [],
        ...overrides,
    }) as ClientWithRelations;

function setup(found: ClientWithRelations | null) {
    const repository = {
        findByIdWithRelations: jest.fn().mockResolvedValue(found),
        delete: jest.fn().mockResolvedValue(true),
    };
    const service = new ClientService(
        repository as unknown as ClientRepository,
    );
    return { service, repository };
}

describe('ClientService.delete', () => {
    it('пустая организация удаляется', async () => {
        const { service, repository } = setup(client());
        await service.delete(6);
        expect(repository.delete).toHaveBeenCalledWith(6);
    });

    it('с порталом — отказ: каскад в БД снёс бы портал', async () => {
        const { service, repository } = setup(
            client({ portal: { id: 12n } as Portal }),
        );
        await expect(service.delete(6)).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(repository.delete).not.toHaveBeenCalled();
    });

    it('с учётками кабинета — отказ', async () => {
        const { service, repository } = setup(
            client({ users: [{ id: 41n } as User] }),
        );
        await expect(service.delete(6)).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(repository.delete).not.toHaveBeenCalled();
    });

    it('нет организации — 404', async () => {
        const { service } = setup(null);
        await expect(service.delete(99)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
