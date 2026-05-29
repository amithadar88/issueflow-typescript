import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { User } from '../users/user.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  content: string;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE' })
  ticket: Ticket;

  @Column()
  ticketId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  author: User;

  @Column()
  authorId: number;

  // Resolved from @username tokens in content; re-evaluated on every save.
  @ManyToMany(() => User)
  @JoinTable({ name: 'comment_mentions' })
  mentionedUsers: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Optimistic locking: TypeORM adds AND version = N to every UPDATE so two
  // concurrent edits of the same comment are detected at the DB level.
  @VersionColumn()
  version: number;
}
