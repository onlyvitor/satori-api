import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { Status } from "../status.enum";
import { User } from "src/users/entities/user.entity";
import { ManyToOne } from "typeorm";


@Entity()
export class Rating {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    score: number;

    @Column()
    comment: string;

    @Column({ type: 'enum', enum: Status, default: Status.NOT_READ })
    status: Status;

    @ManyToOne(() => User, (user) => user.ratings)
    user: User;

    @Column()
    userId: number;

    @Column()
    googleBookId: string;
}
