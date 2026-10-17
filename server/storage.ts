import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface StoredState {
  state: unknown;
  updatedAt: string;
}

/** Magazyn danych: użytkownicy, sesje i stan księgowości (jeden dokument JSON na użytkownika) */
export interface Storage {
  kind: "postgres" | "plik";
  init(): Promise<void>;
  countUsers(): Promise<number>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUser(u: User): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  createSession(s: Session): Promise<void>;
  getSession(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;
  deleteUserSessions(userId: string, exceptToken?: string): Promise<void>;
  getState(userId: string): Promise<StoredState | undefined>;
  putState(userId: string, state: unknown): Promise<StoredState>;
}

class PostgresStorage implements Storage {
  kind = "postgres" as const;
  private pool: pg.Pool;
  constructor(url: string) {
    const local = /localhost|127\.0\.0\.1|\.railway\.internal/.test(url);
    this.pool = new pg.Pool({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
  }
  async init() {
    await this.pool.query(`
      create table if not exists users (
        id text primary key, email text unique not null, name text not null default '',
        password_hash text not null, created_at timestamptz not null default now());
      create table if not exists sessions (
        token text primary key, user_id text not null references users(id) on delete cascade,
        expires_at timestamptz not null);
      create table if not exists app_state (
        user_id text primary key references users(id) on delete cascade,
        state jsonb not null, updated_at timestamptz not null default now());
    `);
    await this.pool.query("delete from sessions where expires_at < now()");
  }
  async countUsers() {
    const r = await this.pool.query("select count(*)::int as n from users");
    return r.rows[0].n as number;
  }
  private toUser(r: Record<string, unknown> | undefined): User | undefined {
    if (!r) return undefined;
    return { id: r.id as string, email: r.email as string, name: r.name as string, passwordHash: r.password_hash as string, createdAt: new Date(r.created_at as string).toISOString() };
  }
  async getUserByEmail(email: string) {
    return this.toUser((await this.pool.query("select * from users where email = $1", [email])).rows[0]);
  }
  async getUserById(id: string) {
    return this.toUser((await this.pool.query("select * from users where id = $1", [id])).rows[0]);
  }
  async createUser(u: User) {
    await this.pool.query("insert into users (id, email, name, password_hash, created_at) values ($1,$2,$3,$4,$5)", [u.id, u.email, u.name, u.passwordHash, u.createdAt]);
  }
  async updatePassword(userId: string, hash: string) {
    await this.pool.query("update users set password_hash = $2 where id = $1", [userId, hash]);
  }
  async createSession(s: Session) {
    await this.pool.query("insert into sessions (token, user_id, expires_at) values ($1,$2,$3)", [s.token, s.userId, s.expiresAt]);
  }
  async getSession(token: string) {
    const r = (await this.pool.query("select * from sessions where token = $1 and expires_at > now()", [token])).rows[0];
    return r ? { token: r.token, userId: r.user_id, expiresAt: new Date(r.expires_at).toISOString() } : undefined;
  }
  async deleteSession(token: string) {
    await this.pool.query("delete from sessions where token = $1", [token]);
  }
  async deleteUserSessions(userId: string, exceptToken?: string) {
    await this.pool.query("delete from sessions where user_id = $1 and token <> coalesce($2, '')", [userId, exceptToken ?? null]);
  }
  async getState(userId: string) {
    const r = (await this.pool.query("select state, updated_at from app_state where user_id = $1", [userId])).rows[0];
    return r ? { state: r.state, updatedAt: new Date(r.updated_at).toISOString() } : undefined;
  }
  async putState(userId: string, state: unknown) {
    const r = await this.pool.query(
      `insert into app_state (user_id, state, updated_at) values ($1, $2, now())
       on conflict (user_id) do update set state = excluded.state, updated_at = now() returning updated_at`,
      [userId, JSON.stringify(state)],
    );
    return { state, updatedAt: new Date(r.rows[0].updated_at).toISOString() };
  }
}

interface FileDb {
  users: User[];
  sessions: Session[];
  states: Record<string, StoredState>;
}

/** Zapis w pliku JSON — do pracy lokalnej. Na Railway bez wolumenu dane znikają przy każdym wdrożeniu. */
class FileStorage implements Storage {
  kind = "plik" as const;
  private file: string;
  private db: FileDb = { users: [], sessions: [], states: {} };
  private writing = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, "db.json");
  }
  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      this.db = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch {
      await this.flush();
    }
    const now = new Date().toISOString();
    this.db.sessions = this.db.sessions.filter((s) => s.expiresAt > now);
  }
  private flush() {
    // zapis przez plik tymczasowy, żeby nie uszkodzić bazy przy przerwaniu
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(this.db));
      await fs.rename(tmp, this.file);
    });
    return this.writing;
  }
  async countUsers() { return this.db.users.length; }
  async getUserByEmail(email: string) { return this.db.users.find((u) => u.email === email); }
  async getUserById(id: string) { return this.db.users.find((u) => u.id === id); }
  async createUser(u: User) { this.db.users.push(u); await this.flush(); }
  async updatePassword(userId: string, hash: string) {
    const u = this.db.users.find((x) => x.id === userId);
    if (u) u.passwordHash = hash;
    await this.flush();
  }
  async createSession(s: Session) { this.db.sessions.push(s); await this.flush(); }
  async getSession(token: string) {
    const now = new Date().toISOString();
    return this.db.sessions.find((s) => s.token === token && s.expiresAt > now);
  }
  async deleteSession(token: string) { this.db.sessions = this.db.sessions.filter((s) => s.token !== token); await this.flush(); }
  async deleteUserSessions(userId: string, exceptToken?: string) {
    this.db.sessions = this.db.sessions.filter((s) => s.userId !== userId || s.token === exceptToken);
    await this.flush();
  }
  async getState(userId: string) { return this.db.states[userId]; }
  async putState(userId: string, state: unknown) {
    const st = { state, updatedAt: new Date().toISOString() };
    this.db.states[userId] = st;
    await this.flush();
    return st;
  }
}

export function createStorage(): Storage {
  if (process.env.DATABASE_URL) return new PostgresStorage(process.env.DATABASE_URL);
  return new FileStorage(process.env.DATA_DIR || path.resolve(process.cwd(), "data"));
}
