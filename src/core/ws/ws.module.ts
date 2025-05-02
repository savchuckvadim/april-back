import { Global, Module } from '@nestjs/common';
import { WsService } from './ws.service';
import { WsGateway } from './ws.gateway';


@Global() // чтобы можно было импортировать один раз на весь проект
@Module({
  providers: [WsGateway, WsService],
  exports: [WsService], // только сервис экспортируем
})
export class WsModule {}
