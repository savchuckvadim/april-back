import { NotFoundException } from '@nestjs/common';
import { TranscriptionStoreService } from '../../transcription/services/transcription.store.service';
import { AdminCallPageLinkController } from '../call-page-link.admin.controller';
import { CallPageLinkService } from '../call-page-link.service';

function build(row: { id: string; domain: string | null } | null) {
    const urlFor = jest.fn((id: string) =>
        Promise.resolve(`https://kpi-sales.april-app.ru/call/token-${id}`),
    );
    const revoke = jest.fn(() => Promise.resolve('new-token'));
    const findPipelineById = jest.fn(() =>
        row === null
            ? Promise.reject(new NotFoundException('Transcription not found'))
            : Promise.resolve(row),
    );
    const controller = new AdminCallPageLinkController(
        { urlFor, revoke } as unknown as CallPageLinkService,
        { findPipelineById } as unknown as TranscriptionStoreService,
    );
    return { controller, urlFor, revoke };
}

describe('AdminCallPageLinkController', () => {
    it('отдаёт действующую ссылку звонка', async () => {
        const { controller, revoke } = build({
            id: '42',
            domain: 'portal.bitrix24.ru',
        });
        expect(await controller.link('42')).toEqual({
            url: 'https://kpi-sales.april-app.ru/call/token-42',
        });
        expect(revoke).not.toHaveBeenCalled();
    });

    it('отзыв: метка звонка меняется, в ответе — новая ссылка', async () => {
        const { controller, revoke, urlFor } = build({
            id: '42',
            domain: 'portal.bitrix24.ru',
        });
        const result = await controller.revoke('42');
        expect(revoke).toHaveBeenCalledWith('42', 'portal.bitrix24.ru');
        expect(urlFor.mock.invocationCallOrder[0]).toBeGreaterThan(
            revoke.mock.invocationCallOrder[0],
        );
        expect(result.url).toContain('/call/');
    });

    it('расшифровки нет — 404, ссылка не выпускается и не отзывается', async () => {
        const { controller, revoke, urlFor } = build(null);
        await expect(controller.link('999')).rejects.toThrow(NotFoundException);
        await expect(controller.revoke('999')).rejects.toThrow(
            NotFoundException,
        );
        expect(urlFor).not.toHaveBeenCalled();
        expect(revoke).not.toHaveBeenCalled();
    });
});
