type ChatMemoryResource = 'Chat' | 'Live session';

export class ChatMemoryNotFoundError extends Error {
  constructor(resource: ChatMemoryResource, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'ChatMemoryNotFoundError';
  }
}

export class ChatMemoryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatMemoryInputError';
  }
}
