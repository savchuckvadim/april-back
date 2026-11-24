import {
    normalizeLegacyPath,
    normalizeUploadPath,
} from '../lib/legacy-path.util';

const PATH = 'clients/portal.test/rq/7/stamp/7_stamp_stamp_5f1c.png';

describe('пути файлов легаси', () => {
    describe('normalizeUploadPath', () => {
        it('путь, начинающийся с clients/, остаётся как есть', () => {
            expect(normalizeUploadPath(PATH)).toBe(PATH);
        });

        it('всё до clients/ отрезается', () => {
            expect(normalizeUploadPath(`backup/2026/${PATH}`)).toBe(PATH);
            expect(normalizeUploadPath(`./${PATH}`)).toBe(PATH);
            expect(normalizeUploadPath(`/${PATH}`)).toBe(PATH);
        });

        it('обратные слэши и повторные слэши нормализуются', () => {
            expect(
                normalizeUploadPath(
                    'D:\\legacy\\clients\\portal.test\\rq\\7\\stamp\\7_stamp_stamp_5f1c.png',
                ),
            ).toBe(PATH);
            expect(
                normalizeUploadPath(`clients//portal.test///rq/7/stamp/a.png`),
            ).toBe('clients/portal.test/rq/7/stamp/a.png');
        });

        it('clients внутри имени папки за границу не считается', () => {
            expect(normalizeUploadPath('myclients/portal.test/a.png')).toBe(
                'myclients/portal.test/a.png',
            );
        });

        it('имя без clients/ остаётся путём без ведущих ./ и /', () => {
            expect(normalizeUploadPath('./logo.png')).toBe('logo.png');
            expect(normalizeUploadPath('/tmp/logo.png')).toBe('tmp/logo.png');
        });

        it('кириллица, которую multer прислал в latin1, восстанавливается', () => {
            const latin1 = Buffer.from(
                'clients/ромашка.рф/rq/7/stamp/a.png',
                'utf8',
            ).toString('latin1');
            expect(normalizeUploadPath(latin1)).toBe(
                'clients/ромашка.рф/rq/7/stamp/a.png',
            );
        });
    });

    describe('normalizeLegacyPath', () => {
        it('слэши нормализуются, ведущий слэш убирается', () => {
            expect(normalizeLegacyPath(`/${PATH}`)).toBe(PATH);
            expect(normalizeLegacyPath(PATH.replace(/\//g, '\\'))).toBe(PATH);
        });
    });
});
