import { INestApplication } from '@nestjs/common';
import {
    DocumentBuilder,
    SwaggerDocumentOptions,
    SwaggerModule,
} from '@nestjs/swagger';

export const getSwaggerConfig = (app: INestApplication) => {
    const config = new DocumentBuilder()
        .setTitle('April backend')
        .setDescription('API for april-bitrix  hooks and  frontends')
        .setVersion('1.0')
        .addTag('april-bitrix')
        .build();

    const options: SwaggerDocumentOptions = {
        operationIdFactory: (controllerKey: string, methodKey: string) => {
            const cleanController = controllerKey.replace(/Controller$/i, '');
            return `${cleanController}_${methodKey}`;
        },
    };
    const documentFactory = () =>
        SwaggerModule.createDocument(app, config, options);


    SwaggerModule.setup('docs/api', app, documentFactory);
};
