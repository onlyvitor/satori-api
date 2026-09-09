import { randomUUID, UUID } from "crypto";

export class BookEntity {
    private readonly id: UUID;
    private readonly bookProviderId:unknown;
    constructor(
        private title:string,
        private author:string,
        private description:string ,
        bookProviderId?: unknown
    ){
        this.id = randomUUID();
        this.bookProviderId;
    }
}