import 'reflect-metadata';
import { TranscriptionModule } from '../transcription.module';

/**
 * Поверхность API модуля транскрибации (ai/rules/app-api-surface.md).
 * До 16.11.2026 модуль публиковал во все приложения открытый CRUD
 * `transcription-store`: без проверки отдавал, менял и удалял расшифровки
 * любого портала. Тест не даёт вернуть его случайно.
 */
describe('TranscriptionModule: поверхность API', () => {
    it('открытого CRUD по расшифровкам в модуле нет', () => {
        const controllers = (
            Reflect.getMetadata('controllers', TranscriptionModule) as {
                name: string;
            }[]
        ).map(controller => controller.name);
        expect(controllers).toEqual(['TranscriptionController']);
    });
});
