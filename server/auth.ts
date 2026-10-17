import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response, Router } from "express";
import express from "express";
import type { Storage, User } from "./storage";

const SESSION_DAYS = 30;
const COOKIE = "jdg_sid";

function scryptAsync(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64"));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function setSessionCookie(req: Request, res: Response, token: string, maxAgeSec: number) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`);
}

// Prosta ochrona przed zgadywaniem haseł: max 8 nieudanych prób na 15 minut (adres IP + e-mail)
const attempts = new Map<string, { count: number; until: number }>();
function tooManyAttempts(key: string) {
  const a = attempts.get(key);
  return !!a && a.until > Date.now() && a.count >= 8;
}
function registerFailure(key: string) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { count: 1, until: Date.now() + 15 * 60_000 });
  else a.count++;
}

const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name });
const normalizeEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();

export interface AuthedRequest extends Request {
  user?: User;
  sessionToken?: string;
}

export function authRouter(storage: Storage): { router: Router; requireAuth: (req: AuthedRequest, res: Response, next: NextFunction) => void } {
  const router = express.Router();
  const registrationOpen = async () => (await storage.countUsers()) === 0 || process.env.ALLOW_REGISTRATION === "true";

  const startSession = async (req: Request, res: Response, user: User) => {
    const token = randomBytes(32).toString("base64url");
    await storage.createSession({ token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString() });
    setSessionCookie(req, res, token, SESSION_DAYS * 86400);
  };

  const loadUser = async (req: AuthedRequest) => {
    const token = readCookie(req, COOKIE);
    if (!token) return;
    const session = await storage.getSession(token);
    if (!session) return;
    req.user = await storage.getUserById(session.userId);
    req.sessionToken = token;
  };

  const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
    loadUser(req)
      .then(() => (req.user ? next() : res.status(401).json({ ok: false, message: "Zaloguj się ponownie." })))
      .catch(next);
  };

  router.get("/me", async (req: AuthedRequest, res, next) => {
    try {
      await loadUser(req);
      res.json({ ok: true, user: req.user ? publicUser(req.user) : null, registrationOpen: await registrationOpen(), storage: storage.kind });
    } catch (e) { next(e); }
  });

  router.post("/register", async (req, res, next) => {
    try {
      if (!(await registrationOpen())) return res.status(403).json({ ok: false, message: "Rejestracja nowych kont jest wyłączona." });
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password ?? "");
      const name = String(req.body?.name ?? "").trim().slice(0, 100);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, message: "Podaj poprawny adres e-mail." });
      if (password.length < 8) return res.status(400).json({ ok: false, message: "Hasło musi mieć co najmniej 8 znaków." });
      if (await storage.getUserByEmail(email)) return res.status(409).json({ ok: false, message: "Konto z tym adresem już istnieje." });
      const user: User = { id: randomUUID(), email, name, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
      await storage.createUser(user);
      await startSession(req, res, user);
      res.json({ ok: true, user: publicUser(user) });
    } catch (e) { next(e); }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const key = `${req.ip}|${email}`;
      if (tooManyAttempts(key)) return res.status(429).json({ ok: false, message: "Zbyt wiele prób logowania. Spróbuj za kilkanaście minut." });
      const user = await storage.getUserByEmail(email);
      const ok = user ? await verifyPassword(String(req.body?.password ?? ""), user.passwordHash) : false;
      if (!user || !ok) {
        registerFailure(key);
        return res.status(401).json({ ok: false, message: "Nieprawidłowy e-mail lub hasło." });
      }
      attempts.delete(key);
      await startSession(req, res, user);
      res.json({ ok: true, user: publicUser(user) });
    } catch (e) { next(e); }
  });

  router.post("/logout", async (req: AuthedRequest, res, next) => {
    try {
      const token = readCookie(req, COOKIE);
      if (token) await storage.deleteSession(token);
      setSessionCookie(req, res, "", 0);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.post("/password", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const current = String(req.body?.current ?? "");
      const next_ = String(req.body?.password ?? "");
      if (!(await verifyPassword(current, req.user!.passwordHash))) return res.status(400).json({ ok: false, message: "Obecne hasło jest nieprawidłowe." });
      if (next_.length < 8) return res.status(400).json({ ok: false, message: "Nowe hasło musi mieć co najmniej 8 znaków." });
      await storage.updatePassword(req.user!.id, await hashPassword(next_));
      await storage.deleteUserSessions(req.user!.id, req.sessionToken);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return { router, requireAuth };
}
