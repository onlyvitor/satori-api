import { randomUUID, UUID } from "crypto";

export class BookEntity {
    private readonly id: UUID;
    constructor(
        private title:string,
        private author:string,
        private coverURL: string,
        private description:string,
        private bookProviderId?: unknown
    ){
        this.id = randomUUID();
    }

    public create(
        title:string,
        author:string,
        coverURL:string,
        description:string,
        bookProviderId:unknown
    ):BookEntity{
        return new BookEntity(
            title,
            author,
            coverURL,
            description
        );
    }
}