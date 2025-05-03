import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect, WebSocketServer } from '@nestjs/websockets';
import { WsService } from './ws.service';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';


@WebSocketGateway({ cors: true })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly wsService: WsService
  ) { }

  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WsGateway.name);

  afterInit(server: Server) {
    this.wsService.setServer(server);
  }

  handleConnection(client: Socket) {
    this.wsService.registerClient(client);
  }

  handleDisconnect(client: Socket) {
    this.wsService.removeClient(client.id);
  }

  // handleConnection(client: Socket, ...args: any[]): void {
  //   this.logger.log(`Client connected: ${client.id}`);
  // }

  // handleDisconnect(client: Socket): void {
  //   this.logger.log(`Client disconnected: ${client.id}`);
  // }

  // @SubscribeMessage('createW')
  // create(@MessageBody() createWDto: CreateWDto) {
  //   return this.wsService.create(createWDto);
  // }

  // @SubscribeMessage('findAllWs')
  // findAll() {
  //   return this.wsService.findAll();
  // }

  // @SubscribeMessage('findOneW')
  // findOne(@MessageBody() id: number) {
  //   return this.wsService.findOne(id);
  // }

  // @SubscribeMessage('updateW')
  // update(@MessageBody() updateWDto: UpdateWDto) {
  //   return this.wsService.update(updateWDto.id, updateWDto);
  // }

  // @SubscribeMessage('removeW')
  // remove(@MessageBody() id: number) {
  //   return this.wsService.remove(id);
  // }
}
