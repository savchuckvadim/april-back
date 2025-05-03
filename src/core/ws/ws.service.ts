import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@Injectable()
export class WsService {
  private server: Server;
  private clients = new Map<string, Socket>();

  constructor() { }


  registerClient(client: Socket) {
    this.clients.set(client.id, client);
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId);
  }

  setServer(server: Server) {
    this.server = server;
  }

  sendToClient(socketId: string, payload: any) {
    const client = this.clients.get(socketId);
    Logger.log(`sendToClient ${socketId}`)
    if (client) {
      Logger.log(`sendToClient client+ ${socketId}`)
      Logger.log(`sendToClient client+ ${payload.event}`)
      client.emit(payload.event, payload.data);
    }
  }

  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }

  emitToAll(event: string, payload: any) {
    this.server?.emit(event, payload);
  }

  emitToClient(clientId: string, event: string, payload: any) {
    const client = this.server?.sockets.sockets.get(clientId);
    if (client) {
      client.emit(event, payload);
    }
  }

  // emitToAll(event: string, payload: any) {
  //   this.gateway.server.emit(event, payload);
  // }

  // emitToClient(clientId: string, event: string, payload: any) {
  //   const client = this.gateway.server.sockets.sockets.get(clientId);
  //   if (client) client.emit(event, payload);
  // }
  // create(createWDto: CreateWDto) {
  //   return 'This action adds a new w';
  // }

  // findAll() {
  //   return `This action returns all ws`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} w`;
  // }

  // update(id: number, updateWDto: UpdateWDto) {
  //   return `This action updates a #${id} w`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} w`;
  // }
}
