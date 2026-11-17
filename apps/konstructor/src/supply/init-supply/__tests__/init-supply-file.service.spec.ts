import axios from 'axios';
import { InitSupplyFileService } from '../services/file/init-supply-file.service';

jest.mock('axios');
const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

/**
 * Имя файла отчёта для поля RPA «Текущий отчёт о поставке».
 * Ссылка Nest — `/api/files/<iv:data>`: хвост URL не имя файла (gsr, 17.11.2026).
 */
describe('InitSupplyFileService.downloadFileAndConvertToBase64', () => {
    const service = new InitSupplyFileService();
    const content = Buffer.from('docx-bytes');
    // так res.download (content-disposition) подписывает кириллическое имя
    const disposition =
        "attachment; filename=\"?????_?_???????_3393eac1.docx\"; filename*=UTF-8''%D0%9E%D1%82%D1%87%D0%B5%D1%82_%D0%BE_%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D0%B6%D0%B5_3393eac1.docx";

    beforeEach(() => mockedGet.mockReset());

    it('ссылка Nest с токеном: имя из Content-Disposition, содержимое как есть', async () => {
        mockedGet.mockResolvedValue({
            data: content,
            headers: { 'content-disposition': disposition },
        });

        const [name, base64] = await service.downloadFileAndConvertToBase64(
            'https://api.konstructor.april-app.ru/api/files/b95e35d8:9b8ecb83',
        );

        expect(name).toBe('Отчет_о_продаже_3393eac1.docx');
        expect(Buffer.from(base64, 'base64').toString()).toBe('docx-bytes');
    });

    it('без заголовка — по-старому хвост URL (ссылки Laravel кончались именем)', async () => {
        mockedGet.mockResolvedValue({ data: content, headers: {} });

        const [name] = await service.downloadFileAndConvertToBase64(
            'https://garant-app.ru/file-supply-report/x/%D0%9E%D1%82%D1%87%D0%B5%D1%82.docx',
        );

        expect(name).toBe('Отчет.docx');
    });

    it('явное имя сильнее заголовка', async () => {
        mockedGet.mockResolvedValue({
            data: content,
            headers: { 'content-disposition': disposition },
        });

        const [name] = await service.downloadFileAndConvertToBase64(
            'https://api.konstructor.april-app.ru/api/files/t',
            'Свой.docx',
        );

        expect(name).toBe('Свой.docx');
    });
});
