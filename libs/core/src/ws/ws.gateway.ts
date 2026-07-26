import {
    WebSocketGateway,
    OnGatewayConnection,
    OnGatewayDisconnect,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { WsService } from './ws.service';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    constructor(private readonly wsService: WsService) {}

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

    /**
     * Generic-примитив комнат socket.io — ADDITIVE, существующие
     * per-socketId потоки (finance/user-report) не затрагивает.
     * Клиент вступает в комнату, чтобы получать её броадкасты
     * (напр. presence публичных ссылок). Данные в presence-событиях —
     * только счётчики, не отчёт.
     */
    @SubscribeMessage('room:join')
    handleJoinRoom(
        @MessageBody() room: string,
        @ConnectedSocket() client: Socket,
    ): void {
        if (typeof room === 'string' && room.length > 0 && room.length < 200) {
            client.join(room);
            this.logger.log(`room:join ${client.id} → ${room}`);
        }
    }

    @SubscribeMessage('room:leave')
    handleLeaveRoom(
        @MessageBody() room: string,
        @ConnectedSocket() client: Socket,
    ): void {
        if (typeof room === 'string') {
            client.leave(room);
            this.logger.log(`room:leave ${client.id} ← ${room}`);
        }
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
