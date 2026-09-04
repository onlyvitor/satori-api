import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
import { Rating } from "src/rating/entities/rating.entity";
import { OneToMany } from "typeorm";
import { Exclude } from 'class-transformer';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string;

    @Column({ unique: true })
    email: string;

    @Column({ select: false })
    @Exclude({ toPlainOnly: true })
    password: string;

    @Column({ default: false })
    isAdmin: boolean;

    @OneToMany(() => Rating, (rating) => rating.user)
    ratings: Rating[];
}
