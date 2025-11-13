import type { Room } from "./room";

export type RoomFactory = (id: string) => Room;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private makeRoom: RoomFactory;
  constructor(makeRoom: RoomFactory) {
    this.makeRoom = makeRoom;
  }

  get(id: string): Room {
    let room = this.rooms.get(id);
    if (!room) {
      room = this.makeRoom(id);
      this.rooms.set(id, room);
    }
    return room;
  }

  withRoom<T>(id: string, fn: (room: Room) => T): T | undefined {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    return fn(room);
  }

  delete(id: string): boolean {
    return this.rooms.delete(id);
  }

  deleteIfEmpty(id: string): boolean {
    const room = this.rooms.get(id);
    if (room && room.isEmpty()) {
      this.rooms.delete(id);
      return true;
    }
    return false;
  }

  size(): number {
    return this.rooms.size;
  }
}
