import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();
import express, { Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import Stripe from 'stripe';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient, Role } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { GoogleGenerativeAI } from '@google/generative-ai';
import bcrypt from 'bcryptjs';
import {
  authenticateToken,
  requireCoach,
  generateToken,
  AuthenticatedRequest,
} from './auth';
import { saveUploadedImage, saveUploadedMedia, uploadsDir } from './storage';
import { extractAndParseJson } from './aiUtils';
import { notifyUser, notifyCoachesOfClient, sendExpoPushNotification } from './notifications';
import { sendPasswordResetEmail } from './email';
import { renderLegalPage, privacyPolicyHtml, termsOfServiceHtml } from './legalPages';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(
  express.json({
    limit: '50mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Diretório estático para servir ficheiros e imagens públicas (fotos de perfil, refeições)
app.use('/uploads', express.static(uploadsDir));

// Registo de pedidos para auditoria e depuração
app.use((req, res, next) => {
  console.log(`\n[${req.method}] ${req.url}`);
  next();
});

// Health check e monitorização de uptime (Render, Railway, Fly.io, etc.)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Raiz do servidor - Informações da API
app.get('/', (_req, res) => {
  res.status(200).json({
    name: 'Fit Coach Hub API',
    version: '1.0.0',
    status: 'online',
    legal: {
      privacy: '/privacy',
      terms: '/terms',
    },
  });
});

// Páginas públicas exigidas pela Apple App Store e Google Play Console
app.get('/privacy', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderLegalPage('Política de Privacidade', privacyPolicyHtml));
});

app.get('/terms', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderLegalPage('Termos de Serviço', termsOfServiceHtml));
});

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const googleClient = new OAuth2Client();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

console.log("Base de dados conectada:", process.env.DATABASE_URL ? "Sim" : "Não");
console.log("Stripe integrado:", stripe ? "Sim (Live/Test Key)" : "Não (Modo Simulação Dev)");
const emailProvider = process.env.EMAIL_SERVICE === 'gmail' && process.env.GMAIL_USER ? `Gmail SMTP (${process.env.GMAIL_USER})` : (process.env.RESEND_API_KEY ? 'Resend' : 'Modo Simulação Dev');
console.log("Serviço de Email:", emailProvider);

// Helper para gerar código de convite seguro (ex: PT-7K2X)
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PT-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper para extrair string limpa de req.params ou req.query no Express 5
function toStr(val: any): string {
  if (Array.isArray(val)) return val[0] || '';
  return typeof val === 'string' ? val : (val ? String(val) : '');
}

// Helper para calcular info do período de testes e subscrição (PT SaaS)
function getTrialInfo(user: { role: Role; trialEndsAt: Date | null; subscriptionStatus: string | null }) {
  if (user.role !== 'COACH') return null;
  const now = new Date();
  const endsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;
  const isSubscribed = user.subscriptionStatus === 'active';
  const isExpired = isSubscribed ? false : (endsAt ? now > endsAt : true);
  return {
    trialEndsAt: endsAt,
    daysLeft,
    isExpired,
    isSubscribed,
    status: user.subscriptionStatus || (isExpired ? 'expired' : 'trialing'),
  };
}

// Helper para verificar se um PT tem subscrição/trial ativo
async function hasActiveCoachAccess(userId: string): Promise<boolean> {
  const coach = await prisma.user.findUnique({
    where: { id: userId },
    select: { trialEndsAt: true, subscriptionStatus: true },
  });
  if (!coach) return false;
  const now = new Date();
  const isTrialActive = coach.trialEndsAt ? new Date(coach.trialEndsAt) > now : false;
  const isSubscribed = coach.subscriptionStatus === 'active';
  return isTrialActive || isSubscribed;
}

// Helper para verificar se um PT é treinador de um cliente
async function isCoachOfClient(coachId: string, clientId: string): Promise<boolean> {
  const relation = await prisma.coachClient.findUnique({
    where: {
      coachId_clientId: { coachId, clientId },
    },
  });
  return !!relation;
}

// Middleware: Garante que o treinador tem perfil ativo e subscrição/trial válidos
async function requireActiveCoach(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'COACH') {
    return res.status(403).json({ error: 'Acesso reservado exclusivamente a Personal Trainers.' });
  }

  try {
    const isAllowed = await hasActiveCoachAccess(req.user.id);
    if (!isAllowed) {
      return res.status(403).json({
        error: 'O seu período de avaliação terminou. Por favor regularize a sua subscrição para continuar a utilizar as funcionalidades de Personal Trainer.',
        isExpired: true,
        subscriptionRequired: true,
      });
    }

    next();
  } catch (error) {
    console.error('Erro na validação da subscrição de treinador:', error);
    res.status(500).json({ error: 'Erro interno ao validar subscrição.' });
  }
}

// Helper para validar permissão sobre um treino (Dono ou o seu Treinador)
async function canAccessWorkout(callerId: string, callerRole: Role, workoutId: string): Promise<boolean> {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { userId: true, assignedById: true },
  });
  if (!workout) return false;
  if (workout.userId === callerId) return true;
  if (callerRole === 'COACH' && (await isCoachOfClient(callerId, workout.userId))) return true;
  return false;
}

// Helper para validar permissão sobre um exercício (Dono do treino ou o seu Treinador)
async function canAccessExercise(
  callerId: string,
  callerRole: Role,
  exerciseId: string
): Promise<{ allowed: boolean; workoutId?: string; isAssignedByCoach?: boolean }> {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: { workoutId: true, workout: { select: { userId: true, assignedById: true } } },
  });
  if (!exercise) return { allowed: false };
  const isAssignedByCoach = !!exercise.workout.assignedById;
  if (exercise.workout.userId === callerId) return { allowed: true, workoutId: exercise.workoutId, isAssignedByCoach };
  if (callerRole === 'COACH' && (await isCoachOfClient(callerId, exercise.workout.userId))) {
    return { allowed: true, workoutId: exercise.workoutId, isAssignedByCoach };
  }
  return { allowed: false };
}

// Endpoint para upload seguro de imagens (fotos de perfil, refeições, etc.)
app.post('/api/uploads', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Dados da imagem em base64 não fornecidos.' });
    }

    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol || 'http';

    const result = await saveUploadedImage(imageBase64, host, protocol);
    res.status(201).json(result);
  } catch (error) {
    console.error('Erro no upload de ficheiro:', error);
    res.status(500).json({ error: 'Não foi possível guardar a imagem.' });
  }
});

// ==========================================
// ROTAS DE AUTENTICAÇÃO (AUTH & JWT)
// ==========================================

// Registo de Conta Local (Email & Password)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPass = String(password || '');

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: 'Por favor, introduz um nome válido (mínimo 2 caracteres).' });
    }

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return res.status(400).json({ error: 'Por favor, introduz um endereço de email válido.' });
    }

    if (!cleanPass || cleanPass.length < 6) {
      return res.status(400).json({ error: 'A palavra-passe deve ter pelo menos 6 caracteres.' });
    }

    const selectedRole: Role = role === 'COACH' ? 'COACH' : 'CLIENT';

    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Já existe uma conta associada a este email.' });
    }

    const hashedPassword = await bcrypt.hash(cleanPass, 10);
    const trialEndsAt = selectedRole === 'COACH' ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null;

    const user = await prisma.user.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        password: hashedPassword,
        role: selectedRole,
        trialEndsAt,
        subscriptionStatus: selectedRole === 'COACH' ? 'trialing' : undefined,
        weeklyGoal: 3,
      },
    });

    const jwtToken = generateToken(user);
    console.log(`✅ Nova conta registada: ${user.name} (${user.email}) - Perfil: ${user.role}`);

    res.status(201).json({
      message: 'Conta criada com sucesso!',
      user,
      token: jwtToken,
      coach: null,
      trial: getTrialInfo(user),
    });
  } catch (error) {
    console.error('❌ Erro no registo:', error);
    res.status(500).json({ error: 'Erro ao criar conta. Tenta novamente.' });
  }
});

// Login de Conta Local (Email & Password)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPass = String(password || '');

    if (!cleanEmail || !cleanPass) {
      return res.status(400).json({ error: 'Por favor, introduz o teu email e a tua palavra-passe.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user) {
      return res.status(400).json({ error: 'Email ou palavra-passe incorretos.' });
    }

    if (!user.password) {
      return res.status(400).json({
        error: 'Esta conta foi registada através da Google. Por favor, clica em "Continuar com Google" ou usa a opção "Esqueci-me da palavra-passe".',
      });
    }

    const isMatch = await bcrypt.compare(cleanPass, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Email ou palavra-passe incorretos.' });
    }

    let coach = null;
    if (user.role === 'CLIENT') {
      const relation = await prisma.coachClient.findFirst({
        where: { clientId: user.id },
        include: {
          coach: {
            select: { id: true, name: true, email: true, picture: true, coachBrandName: true },
          },
        },
      });
      coach = relation?.coach || null;
    }

    const jwtToken = generateToken(user);
    console.log(`✅ Login com password realizado: ${user.name} (${user.role})`);

    res.status(200).json({
      message: 'Sessão iniciada com sucesso!',
      user,
      token: jwtToken,
      coach,
      trial: getTrialInfo(user),
    });
  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.status(500).json({ error: 'Erro ao iniciar sessão.' });
  }
});

// Recuperação de Password - Pedido de Código
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ error: 'Por favor, introduz um email válido.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user) {
      return res.status(200).json({
        message: 'Se este email estiver registado, enviámos um código de recuperação.',
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: code,
        resetTokenExpiry: expiry,
      },
    });

    console.log(`\n======================================================`);
    console.log(`🔑 [CÓDIGO DE RECUPERAÇÃO DE PASSWORD]`);
    console.log(`👤 Para: ${cleanEmail}`);
    console.log(`🔢 Código: ${code}`);
    console.log(`⏳ Válido até: ${expiry.toLocaleTimeString()}`);
    console.log(`======================================================\n`);

    const emailResult = await sendPasswordResetEmail(cleanEmail, code, user.name);

    res.status(200).json({
      message: 'Código de recuperação enviado para o teu email!',
      devCode: emailResult.mode === 'dev' ? code : undefined,
      emailMode: emailResult.mode,
    });
  } catch (error) {
    console.error('❌ Erro no forgot-password:', error);
    res.status(500).json({ error: 'Erro ao processar pedido de recuperação.' });
  }
});

// Recuperação de Password - Validação do Código e Redefinição
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCode = String(code || '').trim();
    const cleanNewPass = String(newPassword || '');

    if (!cleanEmail || !cleanCode || !cleanNewPass) {
      return res.status(400).json({ error: 'Preenche todos os campos (email, código e nova palavra-passe).' });
    }

    if (cleanNewPass.length < 6) {
      return res.status(400).json({ error: 'A nova palavra-passe deve ter pelo menos 6 caracteres.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user || !user.resetToken || !user.resetTokenExpiry) {
      return res.status(400).json({ error: 'Código de recuperação inválido ou expirado.' });
    }

    if (user.resetToken !== cleanCode) {
      return res.status(400).json({ error: 'Código de recuperação incorreto.' });
    }

    if (new Date() > user.resetTokenExpiry) {
      return res.status(400).json({ error: 'O código de recuperação expirou. Pede um novo código.' });
    }

    const hashedPassword = await bcrypt.hash(cleanNewPass, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    console.log(`✅ Palavra-passe redefinida com sucesso para: ${user.email}`);

    res.status(200).json({
      message: 'Palavra-passe alterada com sucesso! Podes agora iniciar sessão.',
    });
  } catch (error) {
    console.error('❌ Erro no reset-password:', error);
    res.status(500).json({ error: 'Erro ao redefinir palavra-passe.' });
  }
});

// Eliminar conta do utilizador e dados associados (DELETE) - Diretriz Apple 5.1.1(v)
app.delete('/api/users/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    console.log(`⚠️ Pedido de eliminação de conta para utilizador ID: ${userId}`);

    await prisma.user.delete({
      where: { id: userId },
    });

    console.log(`🗑️ Conta eliminada com sucesso (ID: ${userId})`);
    res.status(200).json({ success: true, message: 'Conta eliminada permanentemente com sucesso.' });
  } catch (error) {
    console.error('❌ Erro ao eliminar conta:', error);
    res.status(500).json({ error: 'Erro ao eliminar a conta. Tenta novamente mais tarde.' });
  }
});

// Autenticação Google com devolução de JWT { user, token }
app.post('/api/auth/google', async (req, res) => {
  console.log("📦 Body Recebido do Frontend:", req.body);
  const { token, role } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Nenhum token fornecido!' });
  }

  try {
    let payload: { sub: string; email?: string; name?: string; picture?: string } | null = null;

    // 1. Tentar validação como JWT ID Token
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: [
          process.env.GOOGLE_CLIENT_ID,
          '715283938816-4hio2kbp5u27nifolr33ot4d1fr5s8m8.apps.googleusercontent.com',
          '715283938816-qv35s088tbu2npb5am41i76qmtkl986r.apps.googleusercontent.com',
        ].filter(Boolean) as string[],
      });

      const p = ticket.getPayload();
      if (p && p.sub) {
        payload = {
          sub: p.sub,
          email: p.email,
          name: p.name,
          picture: p.picture,
        };
      }
    } catch (jwtErr: any) {
      console.warn("⚠️ verifyIdToken falhou, a tentar endpoint userinfo da Google:", jwtErr?.message);
    }

    // 2. Se não for ID Token ou se falhou a audiência, validar via Google UserInfo API (suporta Access Token)
    if (!payload) {
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (userInfoRes.ok) {
          const uInfo: any = await userInfoRes.json();
          if (uInfo && uInfo.sub) {
            payload = {
              sub: uInfo.sub,
              email: uInfo.email,
              name: uInfo.name,
              picture: uInfo.picture,
            };
          }
        }
      } catch (userInfoErr) {
        console.error("❌ Erro ao validar token com endpoint userinfo da Google:", userInfoErr);
      }
    }

    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({ error: 'Token inválido ou expirado!' });
    }

    const selectedRole: Role = role === 'COACH' ? 'COACH' : 'CLIENT';
    const trialEndsAt = selectedRole === 'COACH' ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null;

    const user = await prisma.user.upsert({
      where: { googleId: payload.sub },
      update: {},
      create: {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        picture: payload.picture,
        role: selectedRole,
        trialEndsAt: trialEndsAt,
      },
    });

    const jwtToken = generateToken(user);

    let coach = null;
    if (user.role === 'CLIENT') {
      const relation = await prisma.coachClient.findFirst({
        where: { clientId: user.id },
        include: {
          coach: {
            select: { id: true, name: true, email: true, picture: true, coachBrandName: true },
          },
        },
      });
      coach = relation?.coach || null;
    }

    console.log(`✅ Utilizador autenticado via Google: ${user.name} (${user.role})`);
    res.status(200).json({
      message: 'Sucesso!',
      user,
      token: jwtToken,
      coach,
      trial: getTrialInfo(user),
    });

  } catch (error) {
    console.error("Erro na autenticação:", error);
    res.status(401).json({ error: 'Token inválido!' });
  }
});

// Login de Desenvolvimento (Dev Login) para testes rápidos sem depender de Google OAuth
app.post('/api/auth/dev-login', async (req, res) => {
  try {
    const { role = 'COACH' } = req.body;
    const targetRole: Role = role === 'CLIENT' ? 'CLIENT' : 'COACH';
    const email = targetRole === 'COACH' ? 'coach.demo@fit.ai' : 'client.demo@fit.ai';
    const name = targetRole === 'COACH' ? 'Treinador Demo' : 'Cliente Demo';

    const trialEndsAt = targetRole === 'COACH' ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null;

    const user = await prisma.user.upsert({
      where: { email },
      update: { role: targetRole },
      create: {
        email,
        name,
        role: targetRole,
        trialEndsAt,
        weeklyGoal: 4,
      },
    });

    const jwtToken = generateToken(user);

    let coach = null;
    if (user.role === 'CLIENT') {
      const relation = await prisma.coachClient.findFirst({
        where: { clientId: user.id },
        include: {
          coach: {
            select: { id: true, name: true, email: true, picture: true, coachBrandName: true },
          },
        },
      });
      coach = relation?.coach || null;
    }

    console.log(`🧪 Dev Login realizado: ${user.name} (${user.role})`);

    res.status(200).json({
      message: 'Dev login com sucesso!',
      user,
      token: jwtToken,
      coach,
      trial: getTrialInfo(user),
    });
  } catch (error) {
    console.error('❌ Erro no dev-login:', error);
    res.status(500).json({ error: 'Erro no dev login.' });
  }
});

// Obter dados da sessão atual do utilizador autenticado
app.get('/api/auth/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        coaches: {
          include: {
            coach: {
              select: { id: true, name: true, email: true, picture: true },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }

    const assignedCoach = user.coaches.length > 0 ? user.coaches[0].coach : null;

    res.status(200).json({
      user,
      coach: assignedCoach,
      trial: getTrialInfo(user),
    });
  } catch (error) {
    console.error('❌ Erro no /api/auth/me:', error);
    res.status(500).json({ error: 'Erro ao obter dados do utilizador.' });
  }
});

// Alternar papel entre COACH e CLIENT (restrito a ambiente de desenvolvimento para segurança do SaaS)
app.post('/api/auth/switch-role', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'A alteração para o perfil de Personal Trainer requer ativação de subscrição comercial.',
      });
    }

    const userId = req.user!.id;
    const { targetRole } = req.body;

    const newRole: Role = targetRole === 'COACH' ? 'COACH' : 'CLIENT';
    const trialEndsAt = newRole === 'COACH' ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : undefined;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        role: newRole,
        ...(trialEndsAt ? { trialEndsAt } : {}),
      },
    });

    const newToken = generateToken(updatedUser);

    console.log(`Utilizador ${updatedUser.name} mudou para o papel: ${newRole}`);
    res.status(200).json({
      message: 'Papel atualizado com sucesso.',
      user: updatedUser,
      token: newToken,
      trial: getTrialInfo(updatedUser),
    });
  } catch (error) {
    console.error('Erro ao alternar papel:', error);
    res.status(500).json({ error: 'Erro ao alternar papel do utilizador.' });
  }
});

// ==========================================
// ROTAS DE PERSONAL TRAINER (COACH API)
// ==========================================

// Criar convite de cliente (PT gera código seguro com validade)
app.post('/api/coach/invites', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { clientEmail } = req.body;

    // Gerar código único
    let code = generateInviteCode();
    let existing = await prisma.coachInvite.findUnique({ where: { code } });
    while (existing) {
      code = generateInviteCode();
      existing = await prisma.coachInvite.findUnique({ where: { code } });
    }

    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 dias de validade

    const invite = await prisma.coachInvite.create({
      data: {
        code,
        coachId,
        clientEmail: clientEmail || null,
        expiresAt,
      },
      include: {
        coach: { select: { id: true, name: true } },
      },
    });

    console.log(`Convite gerado por ${req.user!.name || coachId}: Código ${code}`);
    res.status(201).json(invite);
  } catch (error) {
    console.error('Erro ao criar convite:', error);
    res.status(500).json({ error: 'Erro ao criar convite.' });
  }
});

// Cliente aceita convite usando o código do PT
app.post('/api/coach/accept-invite', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user!.id;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'O código do convite é obrigatório.' });
    }

    const invite = await prisma.coachInvite.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { coach: true },
    });

    if (!invite) {
      return res.status(404).json({ error: 'Código de convite inválido ou inexistente.' });
    }

    if (new Date() > invite.expiresAt) {
      return res.status(400).json({ error: 'Este código de convite já expirou.' });
    }

    if (invite.coachId === clientId) {
      return res.status(400).json({ error: 'Não te podes convidar a ti próprio!' });
    }

    // Associar Cliente ao PT
    const coachClient = await prisma.coachClient.upsert({
      where: {
        coachId_clientId: {
          coachId: invite.coachId,
          clientId: clientId,
        },
      },
      update: {},
      create: {
        coachId: invite.coachId,
        clientId: clientId,
      },
    });

    // Atualizar status do convite
    await prisma.coachInvite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED' },
    });

    console.log(`🤝 Cliente ${clientId} associado com sucesso ao PT ${invite.coach.name}!`);
    res.status(200).json({
      message: `Associado com sucesso ao treinador ${invite.coach.name}!`,
      coach: {
        id: invite.coach.id,
        name: invite.coach.name,
        email: invite.coach.email,
        picture: invite.coach.picture,
      },
    });
  } catch (error) {
    console.error('❌ Erro ao aceitar convite:', error);
    res.status(500).json({ error: 'Erro ao aceitar convite.' });
  }
});

// Listar todos os clientes de um Personal Trainer
app.get('/api/coach/clients', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;

    // Obter os clientes do PT
    const relations = await prisma.coachClient.findMany({
      where: { coachId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            picture: true,
            weeklyGoal: true,
            currentStreak: true,
            createdAt: true,
            workouts: {
              where: { assignedById: coachId },
              select: { id: true, name: true },
            },
            logs: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: { id: true, createdAt: true, durationMinutes: true },
            },
            bodyMetrics: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { weight: true, createdAt: true },
            },
            meals: {
              where: {
                createdAt: {
                  gte: new Date(new Date().setHours(0, 0, 0, 0)),
                },
              },
              select: { id: true, name: true, calories: true, imageUri: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calcular estatísticas da semana e alertas de retenção para cada cliente
    const now = new Date();
    const dayOfWeek = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1);
    monday.setHours(0, 0, 0, 0);

    const clientsWithStats = relations.map((r) => {
      const c = r.client;
      const weeklyLogs = c.logs.filter((l) => new Date(l.createdAt) >= monday).length;
      const lastWorkout = c.logs[0] ? new Date(c.logs[0].createdAt) : null;
      let daysSinceLastWorkout: number | null = null;
      let retentionStatus: 'active' | 'warning' | 'at_risk' = 'at_risk';

      if (lastWorkout) {
        daysSinceLastWorkout = Math.max(0, Math.floor((now.getTime() - lastWorkout.getTime()) / (1000 * 60 * 60 * 24)));
        if (daysSinceLastWorkout <= 3) {
          retentionStatus = 'active';
        } else if (daysSinceLastWorkout <= 6) {
          retentionStatus = 'warning';
        } else {
          retentionStatus = 'at_risk';
        }
      }

      return {
        id: c.id,
        name: c.name,
        email: c.email,
        picture: c.picture,
        weeklyGoal: c.weeklyGoal,
        currentStreak: c.currentStreak,
        joinedAt: r.createdAt,
        assignedWorkoutsCount: c.workouts.length,
        weeklyWorkoutsCount: weeklyLogs,
        latestWeight: c.bodyMetrics[0]?.weight || null,
        lastWorkoutDate: lastWorkout ? lastWorkout.toISOString() : null,
        daysSinceLastWorkout,
        retentionStatus,
        weeklyGoalMet: weeklyLogs >= c.weeklyGoal,
        todayMealsCount: c.meals.length,
      };
    });

    res.status(200).json(clientsWithStats);
  } catch (error) {
    console.error('Erro ao listar clientes do PT:', error);
    res.status(500).json({ error: 'Erro ao listar clientes.' });
  }
});

// Atualizar metas do aluno pelo Treinador (Nutrição & Frequência de Treino)
app.put('/api/coach/clients/:clientId/goals', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;
    const clientId = toStr(req.params.clientId);
    const { dailyCalories, dailyProtein, dailyCarbs, dailyFat, weeklyGoal } = req.body;

    const isAuthorized = await isCoachOfClient(coachId, clientId);
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Este aluno não está associado à sua conta de treinador.' });
    }

    const updated = await prisma.user.update({
      where: { id: clientId },
      data: {
        ...(dailyCalories !== undefined ? { dailyCalories: Number(dailyCalories) } : {}),
        ...(dailyProtein !== undefined ? { dailyProtein: Number(dailyProtein) } : {}),
        ...(dailyCarbs !== undefined ? { dailyCarbs: Number(dailyCarbs) } : {}),
        ...(dailyFat !== undefined ? { dailyFat: Number(dailyFat) } : {}),
        ...(weeklyGoal !== undefined ? { weeklyGoal: Math.max(1, Number(weeklyGoal)) } : {}),
      },
      select: {
        id: true,
        name: true,
        dailyCalories: true,
        dailyProtein: true,
        dailyCarbs: true,
        dailyFat: true,
        weeklyGoal: true,
      },
    });

    console.log(`Metas do aluno ${clientId} atualizadas pelo treinador ${coachId}`);
    res.status(200).json(updated);
  } catch (error) {
    console.error('Erro ao atualizar metas do aluno:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar metas do aluno.' });
  }
});

// Listar templates de treino do Personal Trainer
app.get('/api/coach/templates', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;

    const templates = await prisma.workout.findMany({
      where: {
        userId: coachId,
        isTemplate: true,
      },
      include: {
        exercises: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(templates);
  } catch (error) {
    console.error('Erro ao obter templates do treinador:', error);
    res.status(500).json({ error: 'Erro interno ao obter templates.' });
  }
});

// Criar um novo template de treino reutilizável
app.post('/api/coach/templates', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { name, description, category, routineTag, programName, exercises } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'O nome do modelo de treino é obrigatório.' });
    }

    const template = await prisma.workout.create({
      data: {
        name,
        description: description || null,
        category: category || null,
        routineTag: routineTag ? String(routineTag).trim().toUpperCase() : null,
        programName: programName ? String(programName).trim() : null,
        userId: coachId,
        isTemplate: true,
        exercises: exercises && exercises.length > 0 ? {
          create: exercises.map((ex: any) => ({
            name: ex.name,
            sets: Number(ex.sets) || 3,
            reps: Number(ex.reps) || 10,
            weight: ex.weight ? Number(ex.weight) : null,
            restSeconds: Number(ex.restSeconds) || 90,
            notes: ex.notes ? String(ex.notes).trim() : null,
            isCardio: !!ex.isCardio,
            durationMinutes: ex.durationMinutes ? Number(ex.durationMinutes) : null,
            intensity: ex.intensity ? String(ex.intensity).trim() : null,
            videoUrl: ex.videoUrl ? String(ex.videoUrl).trim() : null,
          })),
        } : undefined,
      },
      include: { exercises: true },
    });

    console.log(`Template de treino "${name}" criado pelo treinador ${coachId}`);
    res.status(201).json(template);
  } catch (error) {
    console.error('Erro ao criar template:', error);
    res.status(500).json({ error: 'Erro interno ao criar modelo de treino.' });
  }
});

// Eliminar um template de treino
app.delete('/api/coach/templates/:templateId', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;
    const templateId = toStr(req.params.templateId);

    const template = await prisma.workout.findUnique({ where: { id: templateId } });
    if (!template || template.userId !== coachId || !template.isTemplate) {
      return res.status(404).json({ error: 'Modelo de treino não encontrado ou sem permissão.' });
    }

    await prisma.exercise.deleteMany({ where: { workoutId: templateId } });
    await prisma.workout.delete({ where: { id: templateId } });

    console.log(`Template ${templateId} eliminado pelo treinador ${coachId}`);
    res.status(200).json({ message: 'Modelo de treino eliminado com sucesso.' });
  } catch (error) {
    console.error('Erro ao apagar template:', error);
    res.status(500).json({ error: 'Erro ao eliminar modelo de treino.' });
  }
});

// Obter dados detalhados de um cliente específico para o PT
app.get('/api/coach/clients/:clientId', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;
    const clientId = toStr(req.params.clientId);

    const isAuthorized = await isCoachOfClient(coachId, clientId);
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Este cliente não está associado à tua conta de PT.' });
    }

    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        email: true,
        picture: true,
        weeklyGoal: true,
        currentStreak: true,
        dailyCalories: true,
        dailyProtein: true,
        dailyCarbs: true,
        dailyFat: true,
        createdAt: true,
        workouts: {
          include: { exercises: { orderBy: { createdAt: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        },
        logs: {
          include: {
            workout: true,
            setLogs: { orderBy: { setNumber: 'asc' } },
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        bodyMetrics: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        meals: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    res.status(200).json(client);
  } catch (error) {
    console.error('Erro ao obter detalhe do cliente:', error);
    res.status(500).json({ error: 'Erro ao obter dados do cliente.' });
  }
});

// Atribuir um treino a um cliente (clona ou cria novo treino associado)
app.post('/api/coach/assign-workout', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { clientId, workoutId, name, description, exercises, routineTag, programName } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'O ID do cliente é obrigatório.' });
    }

    const isAuthorized = await isCoachOfClient(coachId, clientId);
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Este cliente não está associado ao teu perfil de PT.' });
    }

    let assignedWorkout;

    // Caso 1: Atribuir a partir de um treino/template existente
    if (workoutId) {
      const source = await prisma.workout.findUnique({
        where: { id: workoutId },
        include: { exercises: true },
      });

      if (!source) {
        return res.status(404).json({ error: 'Treino de origem não encontrado.' });
      }

      // Validação de segurança: apenas treinos do próprio PT ou templates podem ser atribuídos
      if (source.userId !== coachId && source.assignedById !== coachId && !source.isTemplate) {
        return res.status(403).json({ error: 'Não tens permissão para usar este plano como base.' });
      }

      assignedWorkout = await prisma.workout.create({
        data: {
          name: source.name,
          description: source.description,
          routineTag: routineTag || source.routineTag || null,
          programName: programName || source.programName || null,
          userId: clientId, // Dono do treino passa a ser o cliente
          assignedById: coachId,
          exercises: {
            create: source.exercises.map((ex) => ({
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              weight: ex.weight,
              restSeconds: ex.restSeconds || 90,
              notes: ex.notes || null,
              isCardio: ex.isCardio,
              durationMinutes: ex.durationMinutes,
              intensity: ex.intensity,
              videoUrl: ex.videoUrl,
              audioUrl: ex.audioUrl,
            })),
          },
        },
        include: { exercises: true },
      });
    } 
    // Caso 2: Criar novo treino diretamente para o cliente
    else if (name) {
      assignedWorkout = await prisma.workout.create({
        data: {
          name,
          description: description || null,
          routineTag: routineTag || null,
          programName: programName || null,
          userId: clientId,
          assignedById: coachId,
          exercises: exercises && exercises.length > 0 ? {
            create: exercises.map((ex: any) => ({
              name: ex.name,
              sets: ex.sets || 3,
              reps: ex.reps || 10,
              weight: ex.weight || null,
              restSeconds: ex.restSeconds || 90,
              notes: ex.notes || null,
              isCardio: !!ex.isCardio,
              durationMinutes: ex.durationMinutes ? Number(ex.durationMinutes) : null,
              intensity: ex.intensity ? String(ex.intensity).trim() : null,
              videoUrl: ex.videoUrl ? String(ex.videoUrl).trim() : null,
              audioUrl: ex.audioUrl ? String(ex.audioUrl).trim() : null,
            })),
          } : undefined,
        },
        include: { exercises: true },
      });
    } else {
      return res.status(400).json({ error: 'Fornece um workoutId existente ou nome para criar novo treino.' });
    }

    console.log(`Treino "${assignedWorkout.name}" atribuído ao cliente ${clientId} pelo PT ${coachId}`);

    // Notificar o aluno que recebeu um novo treino do treinador
    const coachUser = await prisma.user.findUnique({ where: { id: coachId }, select: { name: true } });
    notifyUser(
      prisma,
      clientId,
      '🏋️ Novo Treino Prescrito!',
      `O teu treinador ${coachUser?.name || 'PT'} prescreveu-te o treino "${assignedWorkout.name}".`,
      { type: 'WORKOUT_ASSIGNED', workoutId: assignedWorkout.id }
    ).catch((err) => console.error('Falha push workout assign:', err));

    res.status(201).json(assignedWorkout);
  } catch (error) {
    console.error('Erro ao atribuir treino ao cliente:', error);
    res.status(500).json({ error: 'Erro ao atribuir treino.' });
  }
});

// Remover cliente da lista do PT
app.delete('/api/coach/clients/:clientId', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;
    const clientId = toStr(req.params.clientId);

    await prisma.coachClient.deleteMany({
      where: { coachId, clientId },
    });

    console.log(`Cliente ${clientId} desassociado do PT ${coachId}`);
    res.status(200).json({ message: 'Cliente desassociado com sucesso.' });
  } catch (error) {
    console.error('Erro ao desassociar cliente:', error);
    res.status(500).json({ error: 'Erro ao desassociar cliente.' });
  }
});

// ==========================================
// ROTAS DE TREINOS (WORKOUTS)
// ==========================================

// Criar um novo treino (POST) - Autenticado
app.post('/api/workouts', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const { name, description, targetClientId, isTemplate, routineTag, programName } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'O nome do treino é obrigatório!' });
    }

    if (callerRole === 'COACH') {
      const isAllowed = await hasActiveCoachAccess(callerId);
      if (!isAllowed) {
        return res.status(403).json({
          error: 'Subscrição inativa. Regularize a sua mensalidade de Personal Trainer para criar ou prescrever treinos.',
          isExpired: true,
          subscriptionRequired: true,
        });
      }
    }

    let targetUserId = callerId;
    let assignedById: string | null = null;

    // Se um PT estiver a criar para um cliente específico:
    if (callerRole === 'COACH' && targetClientId) {
      const isCoach = await isCoachOfClient(callerId, targetClientId);
      if (!isCoach) {
        return res.status(403).json({ error: 'Não podes criar treinos para clientes que não são teus.' });
      }
      targetUserId = targetClientId;
      assignedById = callerId;
    }

    const newWorkout = await prisma.workout.create({
      data: {
        name,
        description,
        routineTag: routineTag ? String(routineTag).trim().toUpperCase() : null,
        programName: programName ? String(programName).trim() : null,
        userId: targetUserId,
        assignedById,
        isTemplate: callerRole === 'COACH' && !targetClientId ? (isTemplate !== undefined ? !!isTemplate : true) : false,
      },
      include: {
        exercises: true,
        assignedBy: { select: { id: true, name: true } },
      },
    });

    console.log(`✅ Treino "${name}" criado com sucesso para o utilizador ${targetUserId}!`);
    res.status(201).json(newWorkout);
  } catch (error) {
    console.error('❌ Erro ao criar treino:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao criar o treino.' });
  }
});

// Buscar todos os treinos (GET) - Autenticado e com proteção de dados
// Clientes vêem apenas os seus treinos (atribuídos). PTs vêem os seus templates ou treinos do cliente especificado.
app.get('/api/workouts', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const clientId = req.query.clientId ? toStr(req.query.clientId) : undefined;

    let targetUserId = callerId;

    if (callerRole === 'COACH' && clientId) {
      const isCoach = await isCoachOfClient(callerId, clientId);
      if (!isCoach) {
        return res.status(403).json({ error: 'Não tens permissão para aceder aos treinos deste cliente.' });
      }
      targetUserId = clientId;
    }

    const userWorkouts = await prisma.workout.findMany({
      where: {
        userId: targetUserId,
      },
      include: {
        exercises: { orderBy: { createdAt: 'asc' } },
        assignedBy: { select: { id: true, name: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json(userWorkouts);
  } catch (error) {
    console.error('❌ Erro ao buscar treinos:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar os treinos.' });
  }
});

// Buscar todos os treinos de um utilizador específico (compatibilidade retroativa protegida)
app.get('/api/workouts/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const userId = toStr(req.params.userId);

    // Regra de Isolamento: Apenas o próprio ou o seu PT podem ver
    if (callerId !== userId) {
      if (callerRole !== 'COACH' || !(await isCoachOfClient(callerId, userId))) {
        return res.status(403).json({ error: 'Acesso negado aos dados deste utilizador.' });
      }
    }

    const userWorkouts = await prisma.workout.findMany({
      where: {
        userId: userId,
      },
      include: {
        exercises: { orderBy: { createdAt: 'asc' } },
        assignedBy: { select: { id: true, name: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json(userWorkouts);
  } catch (error) {
    console.error('❌ Erro ao buscar treinos:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar os treinos.' });
  }
});

// Buscar um treino específico e todos os seus exercícios (GET) - Protegido
app.get('/api/workouts/detail/:workoutId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const workoutId = toStr(req.params.workoutId);

    const workoutDetails = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        exercises: {
          orderBy: { createdAt: 'asc' },
        },
        assignedBy: { select: { id: true, name: true } },
      },
    });

    if (!workoutDetails) {
      return res.status(404).json({ error: 'Treino não encontrado.' });
    }

    // Validação de acesso
    if (workoutDetails.userId !== callerId) {
      const isCoach = callerRole === 'COACH' && (await isCoachOfClient(callerId, workoutDetails.userId));
      if (!isCoach) {
        return res.status(403).json({ error: 'Não tens permissão para aceder a este treino.' });
      }
    }

    res.status(200).json(workoutDetails);
  } catch (error) {
    console.error('❌ Erro ao buscar detalhes do treino:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar os detalhes.' });
  }
});

// Clonar um treino existente e os seus exercícios (POST) - Protegido
app.post('/api/workouts/:workoutId/clone', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const workoutId = toStr(req.params.workoutId);

    const hasAccess = await canAccessWorkout(callerId, callerRole, workoutId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Não tens permissão para aceder ou duplicar este treino.' });
    }

    const originalWorkout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: { exercises: true },
    });

    if (!originalWorkout) {
      return res.status(404).json({ error: 'Treino original não encontrado.' });
    }

    const clonedWorkout = await prisma.workout.create({
      data: {
        name: `${originalWorkout.name} (Cópia)`,
        description: originalWorkout.description,
        userId: callerId,
        exercises: {
          create: originalWorkout.exercises.map((ex) => ({
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight,
            restSeconds: ex.restSeconds || 90,
            notes: ex.notes || null,
            isCardio: ex.isCardio,
            durationMinutes: ex.durationMinutes,
            intensity: ex.intensity,
            videoUrl: ex.videoUrl,
            audioUrl: ex.audioUrl,
          })),
        },
      },
      include: { exercises: true },
    });

    console.log(`Treino "${originalWorkout.name}" duplicado por ${callerId}`);
    res.status(201).json(clonedWorkout);
  } catch (error) {
    console.error('Erro ao clonar treino:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao clonar o treino.' });
  }
});

// Apagar um treino inteiro e os seus exercícios (DELETE) - Protegido
app.delete('/api/workouts/:workoutId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const workoutId = toStr(req.params.workoutId);

    const workout = await prisma.workout.findUnique({ where: { id: workoutId } });
    if (!workout) {
      return res.status(404).json({ error: 'Treino não encontrado.' });
    }

    if (workout.userId !== callerId) {
      const isCoach = callerRole === 'COACH' && (await isCoachOfClient(callerId, workout.userId));
      if (!isCoach) {
        return res.status(403).json({ error: 'Não tens permissão para apagar este treino.' });
      }
    }

    if (workout.assignedById && callerRole !== 'COACH') {
      return res.status(403).json({ error: 'Não é permitido ao aluno apagar um treino prescrito pelo seu treinador.' });
    }

    await prisma.exercise.deleteMany({ where: { workoutId } });
    await prisma.workout.delete({ where: { id: workoutId } });

    console.log(`Treino ${workoutId} e exercícios eliminados`);
    res.status(200).json({ message: 'Treino apagado com sucesso.' });
  } catch (error) {
    console.error('Erro ao apagar treino:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao apagar o treino.' });
  }
});

// ==========================================
// ROTAS DE EXERCÍCIOS (EXERCISES)
// ==========================================

// Criar um novo exercício num treino (POST) - Protegido
app.post('/api/exercises', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const { name, sets, reps, weight, restSeconds, notes, videoUrl, isCardio, durationMinutes, intensity, workoutId } = req.body;

    if (!name || !workoutId) {
      return res.status(400).json({ error: 'O nome do exercício e o ID do treino são obrigatórios.' });
    }

    const hasAccess = await canAccessWorkout(callerId, callerRole, workoutId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Não tens permissão para adicionar exercícios a este treino.' });
    }

    // Se o treino foi prescrito pelo treinador, o aluno não pode adicionar exercícios
    const targetWorkout = await prisma.workout.findUnique({
      where: { id: workoutId },
      select: { assignedById: true },
    });
    if (targetWorkout?.assignedById && callerRole !== 'COACH') {
      return res.status(403).json({
        error: 'Não é permitido ao aluno adicionar exercícios a um plano prescrito pelo treinador.',
      });
    }

    const newExercise = await prisma.exercise.create({
      data: {
        name,
        sets: sets ? Number(sets) : (isCardio ? 1 : 3),
        reps: reps ? Number(reps) : (isCardio ? 1 : 10),
        weight: weight !== undefined && weight !== null ? Number(weight) : null,
        restSeconds: restSeconds ? Number(restSeconds) : (isCardio ? 0 : 90),
        notes: notes ? String(notes).trim() : null,
        videoUrl: videoUrl ? String(videoUrl).trim() : null,
        isCardio: !!isCardio,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        intensity: intensity ? String(intensity).trim() : null,
        workoutId,
      },
    });

    console.log(`Exercício "${name}" adicionado ao treino ${workoutId}`);
    res.status(201).json(newExercise);
  } catch (error) {
    console.error('Erro ao criar exercício:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao criar o exercício.' });
  }
});

// Atualizar um exercício específico (PUT) - Protegido
app.put('/api/exercises/:exerciseId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const exerciseId = toStr(req.params.exerciseId);
    const { name, sets, reps, weight, restSeconds, notes, videoUrl, isCardio, durationMinutes, intensity } = req.body;

    const accessCheck = await canAccessExercise(callerId, callerRole, exerciseId);
    if (!accessCheck.allowed) {
      return res.status(403).json({ error: 'Não tens permissão para atualizar este exercício.' });
    }

    // Se o treino foi prescrito pelo treinador e quem está a editar é o aluno (não é COACH):
    // Só é permitida a troca/substituição do exercício (nome e opcionalmente videoUrl)!
    // Não pode alterar sets, reps, weight base do plano, restSeconds, ou notes prescritas pelo PT.
    if (accessCheck.isAssignedByCoach && callerRole !== 'COACH') {
      const hasStructureEdit =
        sets !== undefined ||
        reps !== undefined ||
        weight !== undefined ||
        restSeconds !== undefined ||
        notes !== undefined ||
        durationMinutes !== undefined ||
        intensity !== undefined;

      if (hasStructureEdit && name === undefined) {
        return res.status(403).json({
          error: 'Não é permitido ao aluno alterar os parâmetros prescritos pelo treinador. Apenas é permitida a substituição do exercício.',
        });
      }
    }

    const updateData: any = {};
    if (accessCheck.isAssignedByCoach && callerRole !== 'COACH') {
      if (name !== undefined) updateData.name = name;
      if (videoUrl !== undefined) updateData.videoUrl = videoUrl ? String(videoUrl).trim() : null;
    } else {
      if (name !== undefined) updateData.name = name;
      if (sets !== undefined) updateData.sets = Number(sets);
      if (reps !== undefined) updateData.reps = Number(reps);
      if (weight !== undefined) updateData.weight = weight !== null ? Number(weight) : null;
      if (restSeconds !== undefined) updateData.restSeconds = Number(restSeconds);
      if (notes !== undefined) updateData.notes = notes ? String(notes).trim() : null;
      if (videoUrl !== undefined) updateData.videoUrl = videoUrl ? String(videoUrl).trim() : null;
      if (isCardio !== undefined) updateData.isCardio = !!isCardio;
      if (durationMinutes !== undefined) updateData.durationMinutes = durationMinutes ? Number(durationMinutes) : null;
      if (intensity !== undefined) updateData.intensity = intensity ? String(intensity).trim() : null;
    }

    const updatedExercise = await prisma.exercise.update({
      where: { id: exerciseId },
      data: updateData,
    });

    console.log(`Exercício ${exerciseId} atualizado`);
    res.status(200).json(updatedExercise);
  } catch (error) {
    console.error('Erro ao atualizar exercício:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao atualizar o exercício.' });
  }
});

// Apagar um exercício específico (DELETE) - Protegido
app.delete('/api/exercises/:exerciseId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const exerciseId = toStr(req.params.exerciseId);

    const accessCheck = await canAccessExercise(callerId, callerRole, exerciseId);
    if (!accessCheck.allowed) {
      return res.status(403).json({ error: 'Não tens permissão para eliminar este exercício.' });
    }

    if (accessCheck.isAssignedByCoach && callerRole !== 'COACH') {
      return res.status(403).json({
        error: 'Não é permitido ao aluno eliminar exercícios de um plano prescrito pelo treinador.',
      });
    }

    await prisma.exercise.delete({ where: { id: exerciseId } });

    console.log(`Exercício ${exerciseId} eliminado`);
    res.status(200).json({ message: 'Exercício apagado com sucesso.' });
  } catch (error) {
    console.error('Erro ao apagar exercício:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao apagar o exercício.' });
  }
});

// Obter Recorde Pessoal (PR) de um exercício específico (GET) - Protegido
app.get('/api/exercises/:userId/pr/:exerciseName', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const userId = toStr(req.params.userId);
    const exerciseName = decodeURIComponent(toStr(req.params.exerciseName));

    if (callerId !== userId) {
      if (callerRole !== 'COACH' || !(await isCoachOfClient(callerId, userId))) {
        return res.status(403).json({ error: 'Acesso negado aos registos deste utilizador.' });
      }
    }

    // 1. Procurar nas séries reais concluídas nos treinos executados
    const bestSetLog = await prisma.workoutSetLog.findFirst({
      where: {
        exerciseName: { equals: exerciseName, mode: 'insensitive' },
        workoutLog: { userId },
        completed: true,
        weight: { gt: 0 },
      },
      orderBy: { weight: 'desc' },
      select: { weight: true, reps: true, createdAt: true },
    });

    if (bestSetLog && bestSetLog.weight) {
      return res.status(200).json({
        pr: bestSetLog.weight,
        reps: bestSetLog.reps,
        date: bestSetLog.createdAt,
      });
    }

    // 2. Fallback para planos cadastrados
    const prExercise = await prisma.exercise.findFirst({
      where: {
        name: { equals: exerciseName, mode: 'insensitive' },
        workout: { userId },
        weight: { not: null, gt: 0 },
      },
      orderBy: { weight: 'desc' },
      select: { weight: true, reps: true },
    });

    res.status(200).json({
      pr: prExercise?.weight || 0,
      reps: prExercise?.reps || 0,
    });
  } catch (error) {
    console.error('Erro ao buscar PR do exercício:', error);
    res.status(500).json({ error: 'Erro ao obter o recorde pessoal.' });
  }
});

// Obter histórico de desempenho anterior para múltiplos exercícios (POST) - Protegido
app.post('/api/exercises/previous-performance', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const { exerciseNames, targetUserId } = req.body;
    const userId = targetUserId || callerId;

    if (!Array.isArray(exerciseNames) || exerciseNames.length === 0) {
      return res.status(200).json({});
    }

    const result: Record<string, { date: string; sets: Array<{ setNumber: number; weight: number | null; reps: number; setType: string }> }> = {};

    await Promise.all(
      exerciseNames.map(async (rawName) => {
        const name = String(rawName).trim();
        if (!name) return;

        // Encontrar a sessão mais recente que tenha séries concluídas deste exercício para este utilizador
        const lastSetLog = await prisma.workoutSetLog.findFirst({
          where: {
            exerciseName: { equals: name, mode: 'insensitive' },
            workoutLog: { userId },
            completed: true,
          },
          orderBy: { createdAt: 'desc' },
          select: { workoutLogId: true, createdAt: true },
        });

        if (!lastSetLog) return;

        // Buscar todas as séries desse mesmo treino para manter a ordem
        const sessionSets = await prisma.workoutSetLog.findMany({
          where: {
            workoutLogId: lastSetLog.workoutLogId,
            exerciseName: { equals: name, mode: 'insensitive' },
            completed: true,
          },
          orderBy: { setNumber: 'asc' },
          select: { setNumber: true, weight: true, reps: true, setType: true },
        });

        if (sessionSets.length > 0) {
          result[name] = {
            date: lastSetLog.createdAt.toISOString(),
            sets: sessionSets.map((s) => ({
              setNumber: s.setNumber,
              weight: s.weight,
              reps: s.reps,
              setType: s.setType || 'NORMAL',
            })),
          };
        }
      })
    );

    res.status(200).json(result);
  } catch (error) {
    console.error('Erro ao buscar desempenho anterior dos exercícios:', error);
    res.status(500).json({ error: 'Erro ao obter histórico de desempenho anterior.' });
  }
});

// ==========================================
// ROTAS DE HISTÓRICO DE TREINOS (LOGS)
// ==========================================

// Registar um treino concluído com detalhe de séries (POST) - Protegido
app.post('/api/logs', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { workoutId, durationMinutes, notes, rating, rpe, painJoints, painLevel, sets } = req.body;

    if (!workoutId) {
      return res.status(400).json({ error: 'O identificador do treino é obrigatório.' });
    }

    const calculatedRpe = rpe ? Number(rpe) : (rating ? Number(rating) * 2 : null);
    const parsedPainLevel = painLevel !== undefined && painLevel !== null ? Number(painLevel) : (painJoints && painJoints !== 'Nenhum' ? 5 : 0);

    const newLog = await prisma.workoutLog.create({
      data: {
        userId,
        workoutId,
        durationMinutes: durationMinutes ? Number(durationMinutes) : 0,
        notes: notes ? String(notes).trim() : null,
        rating: rating ? Number(rating) : (calculatedRpe ? Math.round(calculatedRpe / 2) : null),
        rpe: calculatedRpe,
        painJoints: painJoints ? String(painJoints).trim() : null,
        painLevel: parsedPainLevel,
        setLogs: Array.isArray(sets) && sets.length > 0 ? {
          create: sets.map((s: any, idx: number) => ({
            exerciseId: s.exerciseId || null,
            exerciseName: s.exerciseName || 'Exercício',
            setNumber: s.setNumber ? Number(s.setNumber) : idx + 1,
            reps: Number(s.reps) || 0,
            weight: s.weight !== undefined && s.weight !== null ? Number(s.weight) : null,
            completed: s.completed !== false,
            rpe: s.rpe ? Number(s.rpe) : null,
            setType: s.setType || 'NORMAL',
            durationMinutes: s.durationMinutes ? Number(s.durationMinutes) : null,
            intensity: s.intensity ? String(s.intensity).trim() : null,
          })),
        } : undefined,
      },
      include: {
        workout: true,
        setLogs: { orderBy: { setNumber: 'asc' } },
      },
    });

    // Atualização de Streak Semanal
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const now = new Date();
      const dayOfWeek = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const weeklyLogsCount = await prisma.workoutLog.count({
        where: {
          userId: userId,
          createdAt: { gte: monday, lte: sunday },
        },
      });

      if (weeklyLogsCount === user.weeklyGoal) {
        await prisma.user.update({
          where: { id: userId },
          data: { currentStreak: user.currentStreak + 1 },
        });
      }
    }

    console.log(`Treino ${workoutId} concluído por ${userId} (${durationMinutes} min, RPE ${calculatedRpe || '-'})`);

    // Notificar treinadores da conclusão do treino
    const studentUser = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const studentName = studentUser?.name || 'Aluno';
    const workoutName = newLog.workout?.name || 'Treino';
    
    // Verificar queixa de dor articular ou nota de desconforto
    const hasReportedPain = (painJoints && painJoints !== 'Nenhum' && painJoints.length > 0) ||
      (parsedPainLevel > 0) ||
      (rating && rating <= 2) ||
      (notes && /dor|dói|les[aã]o|ombro|joelho|coluna|articular|pain|hurt/i.test(notes));
    
    if (hasReportedPain) {
      const painDesc = painJoints && painJoints !== 'Nenhum' ? `⚠️ Queixa de dor: ${painJoints} (Nível ${parsedPainLevel}/10). ` : '';
      notifyCoachesOfClient(
        prisma,
        userId,
        `⚠️ Alerta de Dor / Desconforto: ${studentName}`,
        `${studentName} concluiu "${workoutName}" com alerta de desconforto. ${painDesc}Esforço: ${calculatedRpe || rating || '-'}/10. "${notes || 'Sem detalhes adicionais'}"`,
        { type: 'WORKOUT_PAIN_ALERT', workoutLogId: newLog.id }
      ).catch((err) => console.error('Falha push dor:', err));
    } else {
      notifyCoachesOfClient(
        prisma,
        userId,
        `💪 Treino Concluído: ${studentName}`,
        `${studentName} completou "${workoutName}" (${durationMinutes || 0} min, Esforço RPE ${calculatedRpe || 7}/10).`,
        { type: 'WORKOUT_COMPLETED', workoutLogId: newLog.id }
      ).catch((err) => console.error('Falha push workout complete:', err));
    }

    res.status(201).json(newLog);
  } catch (error) {
    console.error('Erro ao registar sessão de treino:', error);
    res.status(500).json({ error: 'Erro ao registar o treino concluído.' });
  }
});

// Obter o histórico de treinos de um utilizador com séries (GET) - Protegido
app.get('/api/logs/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const userId = toStr(req.params.userId);

    // Regra de segurança: Apenas o próprio ou o seu PT
    if (callerId !== userId) {
      if (callerRole !== 'COACH' || !(await isCoachOfClient(callerId, userId))) {
        return res.status(403).json({ error: 'Acesso negado aos registos deste utilizador.' });
      }
    }

    const historyLogs = await prisma.workoutLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        workout: true,
        setLogs: { orderBy: { setNumber: 'asc' } },
      },
    });

    res.status(200).json(historyLogs);
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({ error: 'Erro interno ao obter o histórico.' });
  }
});

// ==========================================
// ROTAS DE MÉTRICAS CORPORAIS (PESO)
// ==========================================

// Registar peso (POST) - Protegido
app.post('/api/metrics/weight', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { weight } = req.body;

    if (!weight) {
      return res.status(400).json({ error: 'O valor do peso é obrigatório.' });
    }

    const newMetric = await prisma.bodyMetric.create({
      data: {
        userId,
        weight: parseFloat(weight),
      },
    });

    console.log(`⚖️ Peso registado para ${userId}: ${weight}kg`);
    res.status(201).json(newMetric);
  } catch (error) {
    console.error('❌ Erro ao registar peso:', error);
    res.status(500).json({ error: 'Erro ao registar a métrica corporal.' });
  }
});

// Obter histórico de peso (GET) - Protegido
app.get('/api/metrics/weight/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const userId = toStr(req.params.userId);

    if (callerId !== userId) {
      if (callerRole !== 'COACH' || !(await isCoachOfClient(callerId, userId))) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
    }

    const metrics = await prisma.bodyMetric.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(metrics);
  } catch (error) {
    console.error('Erro ao buscar métricas:', error);
    res.status(500).json({ error: 'Erro ao obter as métricas.' });
  }
});

// Registar avaliação física completa (peso, perímetros corporais e fotos de evolução)
app.post('/api/metrics/assessment', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const { targetUserId, weight, chest, waist, arms, thighs, bodyFat, photoUrl, notes } = req.body;

    let userId = callerId;
    if (callerRole === 'COACH' && targetUserId) {
      const isAllowed = await hasActiveCoachAccess(callerId);
      if (!isAllowed) {
        return res.status(403).json({
          error: 'Subscrição inativa. Regularize a sua mensalidade de Personal Trainer para registar avaliações físicas.',
          isExpired: true,
          subscriptionRequired: true,
        });
      }

      const isCoach = await isCoachOfClient(callerId, targetUserId);
      if (!isCoach) {
        return res.status(403).json({ error: 'Não tens autorização para registar avaliações deste aluno.' });
      }
      userId = targetUserId;
    }

    if (!weight) {
      return res.status(400).json({ error: 'O peso corporal é obrigatório para registar a avaliação.' });
    }

    const assessment = await prisma.bodyMetric.create({
      data: {
        userId,
        weight: Number(weight),
        chest: chest !== undefined && chest !== '' ? Number(chest) : null,
        waist: waist !== undefined && waist !== '' ? Number(waist) : null,
        arms: arms !== undefined && arms !== '' ? Number(arms) : null,
        thighs: thighs !== undefined && thighs !== '' ? Number(thighs) : null,
        bodyFat: bodyFat !== undefined && bodyFat !== '' ? Number(bodyFat) : null,
        photoUrl: photoUrl ? String(photoUrl) : null,
        notes: notes ? String(notes).trim() : null,
      },
    });

    console.log(`Avaliação física registada para ${userId}: ${weight}kg`);
    res.status(201).json(assessment);
  } catch (error) {
    console.error('Erro ao registar avaliação física:', error);
    res.status(500).json({ error: 'Erro interno ao registar a avaliação física.' });
  }
});

// Obter histórico de avaliações físicas e evolução corporal
app.get('/api/metrics/assessment/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const userId = toStr(req.params.userId);

    if (callerId !== userId) {
      if (callerRole !== 'COACH' || !(await isCoachOfClient(callerId, userId))) {
        return res.status(403).json({ error: 'Acesso negado às avaliações deste utilizador.' });
      }
    }

    const assessments = await prisma.bodyMetric.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(assessments);
  } catch (error) {
    console.error('Erro ao obter avaliações físicas:', error);
    res.status(500).json({ error: 'Erro interno ao obter histórico de avaliações.' });
  }
});

// ==========================================
// ROTAS DE NOTIFICAÇÕES PUSH (EXPO) 📱
// ==========================================

// Registar ou atualizar Expo Push Token do utilizador
app.post('/api/users/push-token', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { pushToken } = req.body;

    if (!pushToken || typeof pushToken !== 'string') {
      return res.status(400).json({ error: 'pushToken é obrigatório.' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { pushToken: pushToken.trim() },
    });

    console.log(`📱 Push token atualizado para o utilizador ${userId}`);
    res.status(200).json({ success: true, message: 'Push token registado com sucesso.' });
  } catch (error) {
    console.error('Erro ao guardar push token:', error);
    res.status(500).json({ error: 'Erro ao registar push token.' });
  }
});

// Enviar lembrete / push de incentivo a aluno inativo
app.post('/api/coach/notify-inactive', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { clientId, message } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId é obrigatório.' });
    }

    const isCoach = await isCoachOfClient(coachId, clientId);
    if (!isCoach) {
      return res.status(403).json({ error: 'Não tens autorização para contactar este aluno.' });
    }

    const coach = await prisma.user.findUnique({ where: { id: coachId }, select: { name: true } });
    const customMsg = message || 'Sentimos a tua falta nos treinos! Vamos manter a consistência e treinar hoje? 💪';

    const sent = await notifyUser(
      prisma,
      clientId,
      `🏋️ Mensagem do Treinador ${coach?.name || 'PT'}`,
      customMsg,
      { type: 'INACTIVITY_REMINDER', coachId }
    );

    res.status(200).json({ success: true, sent, message: 'Lembrete enviado com sucesso.' });
  } catch (error) {
    console.error('Erro ao enviar lembrete:', error);
    res.status(500).json({ error: 'Erro ao enviar lembrete de inatividade.' });
  }
});

// ==========================================
// ROTAS DE CHECK-IN SEMANAL AUTOMATIZADO 📋
// ==========================================

// Submeter Check-in Semanal pelo Aluno (POST) - Protegido
app.post('/api/checkins', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';

    const {
      weight,
      energyLevel,
      dietAdherence,
      sleepQuality,
      painLevel,
      painNotes,
      notes,
      frontPhotoBase64,
      backPhotoBase64,
      sidePhotoBase64,
      frontPhotoUrl: initialFrontPhoto,
      backPhotoUrl: initialBackPhoto,
      sidePhotoUrl: initialSidePhoto,
    } = req.body;

    if (!weight) {
      return res.status(400).json({ error: 'O peso em jejum é obrigatório para o check-in.' });
    }

    let frontPhotoUrl = initialFrontPhoto || null;
    let backPhotoUrl = initialBackPhoto || null;
    let sidePhotoUrl = initialSidePhoto || null;

    if (frontPhotoBase64 && frontPhotoBase64.length > 50) {
      const saved = await saveUploadedImage(frontPhotoBase64, host, protocol);
      frontPhotoUrl = saved.url;
    }
    if (backPhotoBase64 && backPhotoBase64.length > 50) {
      const saved = await saveUploadedImage(backPhotoBase64, host, protocol);
      backPhotoUrl = saved.url;
    }
    if (sidePhotoBase64 && sidePhotoBase64.length > 50) {
      const saved = await saveUploadedImage(sidePhotoBase64, host, protocol);
      sidePhotoUrl = saved.url;
    }

    const checkIn = await prisma.weeklyCheckIn.create({
      data: {
        userId,
        weight: Number(weight),
        energyLevel: energyLevel ? Number(energyLevel) : 7,
        dietAdherence: dietAdherence ? Number(dietAdherence) : 8,
        sleepQuality: sleepQuality ? Number(sleepQuality) : 7,
        painLevel: painLevel !== undefined ? Number(painLevel) : 0,
        painNotes: painNotes ? String(painNotes).trim() : null,
        notes: notes ? String(notes).trim() : null,
        frontPhotoUrl,
        backPhotoUrl,
        sidePhotoUrl,
      },
    });

    // Também adiciona ao histórico de BodyMetric para refletir no peso geral
    await prisma.bodyMetric.create({
      data: {
        userId,
        weight: Number(weight),
        photoUrl: frontPhotoUrl || undefined,
        notes: `Check-in Semanal (Adesão: ${dietAdherence || 8}/10, Energia: ${energyLevel || 7}/10)`,
      },
    });

    // Notificar treinadores do aluno via Push
    const student = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const studentName = student?.name || 'Aluno';
    const hasPain = checkIn.painLevel && checkIn.painLevel > 0;

    if (hasPain) {
      notifyCoachesOfClient(
        prisma,
        userId,
        `⚠️ Check-in com Dor: ${studentName}`,
        `${studentName} reportou nível de dor ${checkIn.painLevel}/10: "${checkIn.painNotes || 'Sem detalhes'}"`,
        { type: 'CHECKIN_PAIN_ALERT', checkInId: checkIn.id }
      ).catch((e) => console.error('Erro push dor check-in:', e));
    } else {
      notifyCoachesOfClient(
        prisma,
        userId,
        `📋 Novo Check-in Semanal: ${studentName}`,
        `${studentName} enviou o check-in semanal (${checkIn.weight}kg, Adesão dieta: ${checkIn.dietAdherence}/10).`,
        { type: 'CHECKIN_SUBMITTED', checkInId: checkIn.id }
      ).catch((e) => console.error('Erro push check-in:', e));
    }

    console.log(`✅ Check-in semanal registado para ${userId}: ${weight}kg`);
    res.status(201).json(checkIn);
  } catch (error) {
    console.error('Erro ao submeter check-in semanal:', error);
    res.status(500).json({ error: 'Erro interno ao submeter o check-in semanal.' });
  }
});

// Obter os meus Check-ins (Aluno) (GET) - Protegido
app.get('/api/checkins/my', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const checkIns = await prisma.weeklyCheckIn.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(checkIns);
  } catch (error) {
    console.error('Erro ao listar check-ins do aluno:', error);
    res.status(500).json({ error: 'Erro ao carregar check-ins.' });
  }
});

// Obter Check-ins de um aluno (Treinador) (GET) - Protegido
app.get('/api/checkins/client/:clientId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const clientId = toStr(req.params.clientId);

    if (callerId !== clientId) {
      if (callerRole !== 'COACH' || !(await isCoachOfClient(callerId, clientId))) {
        return res.status(403).json({ error: 'Acesso negado aos check-ins deste aluno.' });
      }
    }

    const checkIns = await prisma.weeklyCheckIn.findMany({
      where: { userId: clientId },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(checkIns);
  } catch (error) {
    console.error('Erro ao obter check-ins do cliente:', error);
    res.status(500).json({ error: 'Erro ao obter check-ins do aluno.' });
  }
});

// Personal Trainer envia feedback ao Check-in (PATCH) - Protegido
app.patch('/api/checkins/:checkInId/feedback', authenticateToken, requireActiveCoach, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.id;
    const checkInId = toStr(req.params.checkInId);
    const { coachFeedback } = req.body;

    if (!coachFeedback || !String(coachFeedback).trim()) {
      return res.status(400).json({ error: 'O texto de feedback é obrigatório.' });
    }

    const checkIn = await prisma.weeklyCheckIn.findUnique({
      where: { id: checkInId },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!checkIn) {
      return res.status(404).json({ error: 'Check-in não encontrado.' });
    }

    const isCoach = await isCoachOfClient(coachId, checkIn.userId);
    if (!isCoach) {
      return res.status(403).json({ error: 'Não tens autorização para rever este check-in.' });
    }

    const updated = await prisma.weeklyCheckIn.update({
      where: { id: checkInId },
      data: {
        coachFeedback: String(coachFeedback).trim(),
        reviewedAt: new Date(),
      },
    });

    const coach = await prisma.user.findUnique({ where: { id: coachId }, select: { name: true } });
    notifyUser(
      prisma,
      checkIn.userId,
      '💬 Feedback do Treinador!',
      `${coach?.name || 'O teu treinador'} respondeu ao teu check-in semanal: "${coachFeedback.slice(0, 80)}..."`,
      { type: 'CHECKIN_FEEDBACK', checkInId }
    ).catch((e) => console.error('Erro push feedback checkin:', e));

    console.log(`💬 Feedback de check-in guardado para ${checkIn.userId}`);
    res.status(200).json(updated);
  } catch (error) {
    console.error('Erro ao enviar feedback de check-in:', error);
    res.status(500).json({ error: 'Erro ao registar feedback.' });
  }
});

// ==========================================
// ROTAS DE ANALYTICS & GRÁFICOS DE EVOLUÇÃO 📊
// ==========================================

// Obter dados agregados para gráficos de Peso e Carga Máxima/1RM (GET) - Protegido
app.get('/api/analytics/progress/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const userId = toStr(req.params.userId);

    if (callerId !== userId) {
      if (callerRole !== 'COACH' || !(await isCoachOfClient(callerId, userId))) {
        return res.status(403).json({ error: 'Acesso negado aos gráficos deste utilizador.' });
      }
    }

    // 1. Histórico de Peso (combina BodyMetric e WeeklyCheckIn)
    const [bodyMetrics, checkIns] = await Promise.all([
      prisma.bodyMetric.findMany({
        where: { userId },
        select: { createdAt: true, weight: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.weeklyCheckIn.findMany({
        where: { userId },
        select: { createdAt: true, weight: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Unificar e ordenar por data
    const weightMap = new Map<string, number>();
    for (const m of bodyMetrics) {
      const dateStr = m.createdAt.toISOString().split('T')[0];
      weightMap.set(dateStr, m.weight);
    }
    for (const c of checkIns) {
      const dateStr = c.createdAt.toISOString().split('T')[0];
      weightMap.set(dateStr, c.weight);
    }

    const weightHistory = Array.from(weightMap.entries())
      .map(([date, weight]) => ({ date, weight }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 2. Histórico de 1RM e Cargas por Exercício
    const setLogs = await prisma.workoutSetLog.findMany({
      where: {
        completed: true,
        weight: { gt: 0 },
        reps: { gt: 0 },
        workoutLog: { userId },
      },
      select: {
        exerciseName: true,
        weight: true,
        reps: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const exerciseMap: Record<string, Map<string, { maxWeight: number; reps: number; estimated1RM: number }>> = {};

    for (const set of setLogs) {
      const exName = set.exerciseName.trim();
      if (!exName) continue;

      const dateStr = set.createdAt.toISOString().split('T')[0];
      const weight = set.weight || 0;
      const reps = set.reps || 1;
      const estimated1RM = Math.round((weight * (1 + reps / 30)) * 10) / 10;

      if (!exerciseMap[exName]) {
        exerciseMap[exName] = new Map();
      }

      const existing = exerciseMap[exName].get(dateStr);
      if (!existing || estimated1RM > existing.estimated1RM) {
        exerciseMap[exName].set(dateStr, { maxWeight: weight, reps, estimated1RM });
      }
    }

    const strengthHistory: Array<{
      exerciseName: string;
      dataPointsCount: number;
      sessions: Array<{ date: string; maxWeight: number; reps: number; estimated1RM: number }>;
    }> = [];

    for (const [exerciseName, sessionMap] of Object.entries(exerciseMap)) {
      const sessions = Array.from(sessionMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      strengthHistory.push({
        exerciseName,
        dataPointsCount: sessions.length,
        sessions,
      });
    }

    strengthHistory.sort((a, b) => b.dataPointsCount - a.dataPointsCount);

    res.status(200).json({
      weightHistory,
      strengthHistory,
    });
  } catch (error) {
    console.error('Erro ao calcular histórico analítico:', error);
    res.status(500).json({ error: 'Erro ao gerar dados analíticos para gráficos.' });
  }
});

// ==========================================
// ROTAS DE CHAT PRIVADO (PT ↔ ALUNO) 💬
// ==========================================

// Listar conversas disponíveis (GET) - Protegido
app.get('/api/chat/conversations', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;

    if (callerRole === 'COACH') {
      const activeClients = await prisma.coachClient.findMany({
        where: { coachId: callerId },
        include: {
          client: {
            select: { id: true, name: true, email: true, picture: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const conversations = await Promise.all(
        activeClients.map(async (rel) => {
          const client = rel.client;
          const lastMessage = await prisma.chatMessage.findFirst({
            where: { coachId: callerId, clientId: client.id },
            orderBy: { createdAt: 'desc' },
            select: { id: true, text: true, mediaType: true, createdAt: true, senderId: true, isRead: true },
          });

          const unreadCount = await prisma.chatMessage.count({
            where: {
              coachId: callerId,
              clientId: client.id,
              senderId: client.id,
              isRead: false,
            },
          });

          return {
            targetUser: client,
            lastMessage,
            unreadCount,
          };
        })
      );

      // Ordenar pelas conversas com mensagens mais recentes
      conversations.sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      return res.status(200).json(conversations);
    } else {
      // Aluno: busca o seu treinador
      const coachRel = await prisma.coachClient.findFirst({
        where: { clientId: callerId },
        include: {
          coach: {
            select: { id: true, name: true, email: true, picture: true, coachBrandName: true },
          },
        },
      });

      if (!coachRel || !coachRel.coach) {
        return res.status(200).json([]);
      }

      const coach = coachRel.coach;
      const lastMessage = await prisma.chatMessage.findFirst({
        where: { coachId: coach.id, clientId: callerId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, text: true, mediaType: true, createdAt: true, senderId: true, isRead: true },
      });

      const unreadCount = await prisma.chatMessage.count({
        where: {
          coachId: coach.id,
          clientId: callerId,
          senderId: coach.id,
          isRead: false,
        },
      });

      return res.status(200).json([
        {
          targetUser: coach,
          lastMessage,
          unreadCount,
        },
      ]);
    }
  } catch (error) {
    console.error('Erro ao listar conversas de chat:', error);
    res.status(500).json({ error: 'Erro ao carregar conversas.' });
  }
});

// Obter histórico de mensagens entre PT e Aluno (GET) - Protegido
app.get('/api/chat/:targetUserId/messages', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const targetUserId = toStr(req.params.targetUserId);

    let coachId = '';
    let clientId = '';

    if (callerRole === 'COACH') {
      coachId = callerId;
      clientId = targetUserId;
      const isClient = await isCoachOfClient(callerId, targetUserId);
      if (!isClient) {
        return res.status(403).json({ error: 'Acesso negado às mensagens deste aluno.' });
      }
    } else {
      clientId = callerId;
      coachId = targetUserId;
      const isCoach = await isCoachOfClient(targetUserId, callerId);
      if (!isCoach) {
        return res.status(403).json({ error: 'Acesso negado às mensagens com este treinador.' });
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where: { coachId, clientId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        sender: { select: { id: true, name: true, role: true, picture: true } },
      },
    });

    // Marcar como lidas as mensagens recebidas
    await prisma.chatMessage.updateMany({
      where: {
        coachId,
        clientId,
        senderId: targetUserId,
        isRead: false,
      },
      data: { isRead: true },
    });

    const sanitizedMessages = messages.map((m) => {
      if (
        m.mediaUrl &&
        m.mediaUrl.startsWith('http://') &&
        !m.mediaUrl.includes('localhost') &&
        !m.mediaUrl.includes('127.0.0.1')
      ) {
        return { ...m, mediaUrl: m.mediaUrl.replace('http://', 'https://') };
      }
      return m;
    });

    res.status(200).json(sanitizedMessages);
  } catch (error) {
    console.error('Erro ao obter mensagens do chat:', error);
    res.status(500).json({ error: 'Erro ao carregar histórico de mensagens.' });
  }
});

// Enviar mensagem no chat (texto, áudio, vídeo, foto, ficheiro) (POST) - Protegido
app.post('/api/chat/:targetUserId/messages', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const targetUserId = toStr(req.params.targetUserId);
    const { text, mediaBase64, mediaType, fileName } = req.body;

    if (!text && !mediaBase64) {
      return res.status(400).json({ error: 'A mensagem deve conter texto ou anexo multimédia.' });
    }

    let coachId = '';
    let clientId = '';
    let recipientId = '';

    if (callerRole === 'COACH') {
      coachId = callerId;
      clientId = targetUserId;
      recipientId = targetUserId;
      const isClient = await isCoachOfClient(callerId, targetUserId);
      if (!isClient) {
        return res.status(403).json({ error: 'Não podes enviar mensagens a este utilizador.' });
      }
    } else {
      clientId = callerId;
      coachId = targetUserId;
      recipientId = targetUserId;
      const isCoach = await isCoachOfClient(targetUserId, callerId);
      if (!isCoach) {
        return res.status(403).json({ error: 'Não podes enviar mensagens a este treinador.' });
      }
    }

    let mediaUrl: string | null = null;
    if (mediaBase64 && mediaBase64.length > 20) {
      const host = req.get('host') || 'localhost:3000';
      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const saved = await saveUploadedMedia(mediaBase64, host, protocol, mediaType || 'IMAGE', fileName);
      mediaUrl = saved.url;
    }

    const newMessage = await prisma.chatMessage.create({
      data: {
        coachId,
        clientId,
        senderId: callerId,
        text: text ? String(text).trim() : null,
        mediaUrl,
        mediaType: mediaType || (mediaUrl ? 'IMAGE' : 'TEXT'),
        fileName: fileName ? String(fileName).trim() : null,
      },
      include: {
        sender: { select: { id: true, name: true, role: true, picture: true } },
      },
    });

    // Envio de Notificação Push ao Destinatário
    const sender = await prisma.user.findUnique({ where: { id: callerId }, select: { name: true } });
    const senderName = sender?.name || (callerRole === 'COACH' ? 'Treinador' : 'Aluno');

    let previewContent = text ? String(text).trim() : '';
    if (!previewContent) {
      if (mediaType === 'AUDIO') previewContent = '🎙️ Enviou uma nota de áudio';
      else if (mediaType === 'VIDEO') previewContent = '🎥 Enviou um vídeo de execução técnica';
      else if (mediaType === 'IMAGE') previewContent = '📷 Enviou uma fotografia';
      else previewContent = '📎 Enviou um anexo';
    }

    notifyUser(
      prisma,
      recipientId,
      `💬 ${senderName}`,
      previewContent.length > 80 ? `${previewContent.slice(0, 77)}...` : previewContent,
      {
        type: 'CHAT_MESSAGE',
        senderId: callerId,
        coachId,
        clientId,
      }
    ).catch((err) => console.error('Erro ao disparar push de chat:', err));

    console.log(`💬 Mensagem de chat enviada de ${callerId} para ${recipientId} (${mediaType || 'TEXT'})`);
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Erro ao enviar mensagem de chat:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

// Marcar mensagens como lidas (PATCH) - Protegido
app.patch('/api/chat/:targetUserId/read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const targetUserId = toStr(req.params.targetUserId);

    let coachId = '';
    let clientId = '';

    if (callerRole === 'COACH') {
      coachId = callerId;
      clientId = targetUserId;
    } else {
      clientId = callerId;
      coachId = targetUserId;
    }

    await prisma.chatMessage.updateMany({
      where: {
        coachId,
        clientId,
        senderId: targetUserId,
        isRead: false,
      },
      data: { isRead: true },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar mensagens como lidas:', error);
    res.status(500).json({ error: 'Erro ao atualizar estado de leitura.' });
  }
});

// Editar mensagem de texto do chat (PATCH) - Protegido
app.patch('/api/chat/messages/:messageId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const messageId = toStr(req.params.messageId);
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'O texto da mensagem é obrigatório.' });
    }

    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada.' });
    }

    if (message.senderId !== callerId) {
      return res.status(403).json({ error: 'Apenas o autor pode editar esta mensagem.' });
    }

    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { text: text.trim() },
      include: {
        sender: { select: { id: true, name: true, role: true, picture: true } },
      },
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('Erro ao editar mensagem de chat:', error);
    res.status(500).json({ error: 'Erro ao editar mensagem.' });
  }
});

// Remover/Apagar mensagem do chat (DELETE) - Protegido
app.delete('/api/chat/messages/:messageId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const messageId = toStr(req.params.messageId);

    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada.' });
    }

    const isAuthor = message.senderId === callerId;
    const isCoachOfChannel = callerRole === 'COACH' && message.coachId === callerId;

    if (!isAuthor && !isCoachOfChannel) {
      return res.status(403).json({ error: 'Não tens permissão para apagar esta mensagem.' });
    }

    await prisma.chatMessage.delete({ where: { id: messageId } });
    res.status(200).json({ success: true, messageId });
  } catch (error) {
    console.error('Erro ao apagar mensagem de chat:', error);
    res.status(500).json({ error: 'Erro ao apagar mensagem.' });
  }
});

// ==========================================
// ROTAS DE NUTRIÇÃO E CALORIAS 🍎
// ==========================================

// Registar uma refeição (POST) - Protegido
app.post('/api/nutrition/meals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, calories, protein, carbs, fat, imageUri } = req.body;

    if (!name || calories === undefined) {
      return res.status(400).json({ error: 'Faltam dados obrigatórios (nome, calorias).' });
    }

    const newMeal = await prisma.mealLog.create({
      data: {
        userId,
        name,
        calories: parseInt(calories),
        protein: parseInt(protein) || 0,
        carbs: parseInt(carbs) || 0,
        fat: parseInt(fat) || 0,
        imageUri: imageUri || null,
      },
    });

    console.log(`🍎 Refeição "${name}" registada para ${userId} (${calories} kcal).`);
    res.status(201).json(newMeal);
  } catch (error) {
    console.error('❌ Erro ao registar refeição:', error);
    res.status(500).json({ error: 'Erro ao guardar a refeição.' });
  }
});

// Obter refeições de HOJE do utilizador (GET) - Protegido (com suporte a timezone local)
app.get('/api/nutrition/meals/:userId/today', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const userId = toStr(req.params.userId);

    if (callerId !== userId) {
      if (callerRole !== 'COACH' || !(await isCoachOfClient(callerId, userId))) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
    }

    const dateQuery = req.query.date ? String(req.query.date).trim() : null;
    const tzOffset = req.query.tzOffset ? parseInt(String(req.query.tzOffset), 10) : null;

    let todayStart: Date;
    let tomorrowStart: Date;

    if (dateQuery && /^\d{4}-\d{2}-\d{2}$/.test(dateQuery)) {
      const [year, month, day] = dateQuery.split('-').map(Number);
      const offsetMs = (tzOffset !== null && !isNaN(tzOffset) ? tzOffset : 0) * 60 * 1000;
      const clientMidnightUtc = Date.UTC(year, month - 1, day) + offsetMs;
      todayStart = new Date(clientMidnightUtc);
      tomorrowStart = new Date(clientMidnightUtc + 24 * 60 * 60 * 1000);
    } else {
      todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(todayStart.getDate() + 1);
    }

    const todayMeals = await prisma.mealLog.findMany({
      where: {
        userId: userId,
        createdAt: {
          gte: todayStart,
          lt: tomorrowStart,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(todayMeals);
  } catch (error) {
    console.error('❌ Erro ao buscar refeições de hoje:', error);
    res.status(500).json({ error: 'Erro ao obter as refeições.' });
  }
});

// Obter todas as refeições do utilizador (para histórico e fotos) - Protegido
app.get('/api/nutrition/meals/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const userId = toStr(req.params.userId);

    if (callerId !== userId) {
      if (callerRole !== 'COACH' || !(await isCoachOfClient(callerId, userId))) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
    }

    const meals = await prisma.mealLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.status(200).json(meals);
  } catch (error) {
    console.error('❌ Erro ao buscar histórico de refeições:', error);
    res.status(500).json({ error: 'Erro ao obter histórico de refeições.' });
  }
});

// Analisar refeição com IA (Fotografia e/ou Descrição por Texto) - Protegido
app.post('/api/nutrition/analyze', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { imageBase64, additionalNotes, description, language } = req.body;

    if (!imageBase64 && !description && !additionalNotes) {
      return res.status(400).json({ error: 'Por favor, fornece uma fotografia ou uma descrição da refeição para análise.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'A GEMINI_API_KEY não está configurada no servidor.' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const lang = (language || 'pt').toLowerCase();
    const langInstruction = lang.startsWith('en')
      ? 'Use English for the meal name.'
      : lang.startsWith('es')
      ? 'Use Spanish for the meal name.'
      : lang.startsWith('fr')
      ? 'Use French for the meal name.'
      : 'Use Portuguese for the meal name.';

    let prompt = '';
    const contentParts: any[] = [];

    if (imageBase64) {
      console.log('🤖 A analisar fotografia de refeição com Gemini...');
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      prompt = `You are an expert sports nutritionist and dietitian.
Analyze this food photograph to identify the meal and estimate its nutritional values.
${additionalNotes ? `The user specified additional details, weights, or ingredients: "${additionalNotes}". Prioritize and incorporate these user-specified quantities directly for maximum precision.` : ''}

Estimate portions, total calories, and macronutrients accurately.
${langInstruction}
Return ONLY a valid JSON object without markdown formatting, code fences or explanations.
{
  "name": "Descriptive meal name in requested language",
  "calories": estimated_integer_calories,
  "protein": estimated_integer_protein_in_grams,
  "carbs": estimated_integer_carbs_in_grams,
  "fat": estimated_integer_fat_in_grams
}`;

      contentParts.push(prompt);
      contentParts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: 'image/jpeg',
        },
      });
    } else {
      console.log('🤖 A analisar descrição de refeição por texto com Gemini...');
      const mealDesc = description || additionalNotes;
      prompt = `You are an expert sports nutritionist and dietitian.
The user described what they ate: "${mealDesc}".
Analyze this meal description, identify ingredients and portions, and calculate the total calories and macronutrients with high accuracy.
${langInstruction}
Return ONLY a valid JSON object without markdown formatting, code fences or explanations.
{
  "name": "Descriptive meal name in requested language",
  "calories": estimated_integer_calories,
  "protein": estimated_integer_protein_in_grams,
  "carbs": estimated_integer_carbs_in_grams,
  "fat": estimated_integer_fat_in_grams
}`;

      contentParts.push(prompt);
    }

    const result = await model.generateContent(contentParts);
    const response = await result.response;
    const text = response.text();

    const nutritionData = extractAndParseJson(text);
    const sanitizedNutrition = {
      name: String(nutritionData.name || (lang.startsWith('en') ? 'Meal' : 'Refeição')).trim(),
      calories: Math.max(0, Math.round(Number(nutritionData.calories) || 0)),
      protein: Math.max(0, Math.round(Number(nutritionData.protein) || 0)),
      carbs: Math.max(0, Math.round(Number(nutritionData.carbs) || 0)),
      fat: Math.max(0, Math.round(Number(nutritionData.fat) || 0)),
    };

    console.log(`🍔 Análise concluída: ${sanitizedNutrition.name} (${sanitizedNutrition.calories} kcal)`);
    res.status(200).json(sanitizedNutrition);
  } catch (error: any) {
    console.error('❌ Erro na análise de IA:', error);
    res.status(500).json({ error: error.message || 'Não foi possível analisar a refeição com precisão.' });
  }
});

// ==========================================
// ROTAS DE IA - GERADOR DE TREINOS
// ==========================================

app.post('/api/ai/generate-workout', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'O prompt é obrigatório!' });
    }

    if (req.user?.role === 'COACH') {
      const isAllowed = await hasActiveCoachAccess(req.user.id);
      if (!isAllowed) {
        return res.status(403).json({
          error: 'Subscrição inativa. Regularize a sua mensalidade de Personal Trainer para utilizar o gerador de treinos com IA.',
          isExpired: true,
          subscriptionRequired: true,
        });
      }
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Chave da API Gemini não configurada.' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const systemInstruction = `
      You are an elite personal trainer. The user will request a workout.
      Reply STRICTLY with valid JSON, no extra text and no markdown fences.
      All names and descriptions must be in English.
      Use exactly this structure:
      {
        "name": "Workout name (e.g. Strength - Chest)",
        "description": "A short objective for the session",
        "exercises": [
          {
            "name": "Exercise name",
            "sets": 4,
            "reps": 10,
            "weight": 0
          }
        ]
      }
    `;

    const fullPrompt = `${systemInstruction}\n\nUser request: ${prompt}`;
    const result = await model.generateContent(fullPrompt);
    const responseText = result.response.text();

    const workoutData = extractAndParseJson(responseText);
    const sanitizedWorkout = {
      name: String(workoutData.name || 'Custom AI Workout').trim(),
      description: String(workoutData.description || '').trim(),
      exercises: Array.isArray(workoutData.exercises)
        ? workoutData.exercises.map((ex: any) => ({
            name: String(ex.name || 'Exercise').trim(),
            sets: Math.max(1, Math.min(10, Math.round(Number(ex.sets) || 3))),
            reps: Math.max(1, Math.min(100, Math.round(Number(ex.reps) || 10))),
            weight: ex.weight !== null && ex.weight !== undefined ? Number(ex.weight) || 0 : 0,
          }))
        : [],
    };

    console.log(`🧠 IA gerou o treino: ${sanitizedWorkout.name} (${sanitizedWorkout.exercises.length} exercícios)`);
    res.status(200).json(sanitizedWorkout);
  } catch (error: any) {
    console.error('❌ Erro na IA:', error);
    res.status(500).json({ error: error.message || 'Erro ao gerar treino com a IA.' });
  }
});

// ==========================================
// ROTAS DE PERFIL DE UTILIZADOR
// ==========================================

// Atualizar o perfil do utilizador (PUT) - Protegido
app.put('/api/users/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const userId = toStr(req.params.userId);
    const { name, picture, weeklyGoal, dailyCalories, dailyProtein, dailyCarbs, dailyFat } = req.body;

    if (callerId !== userId) {
      return res.status(403).json({ error: 'Apenas podes atualizar o teu próprio perfil.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        picture,
        weeklyGoal,
        dailyCalories,
        dailyProtein,
        dailyCarbs,
        dailyFat,
      },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        role: true,
        weeklyGoal: true,
        currentStreak: true,
        dailyCalories: true,
        dailyProtein: true,
        dailyCarbs: true,
        dailyFat: true,
        createdAt: true,
      },
    });

    console.log(`👤 Perfil de ${updatedUser.name} atualizado!`);
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('❌ Erro ao atualizar perfil:', error);
    res.status(500).json({ error: 'Erro ao atualizar o perfil.' });
  }
});

// ==========================================
// ROTAS DE MONETIZAÇÃO & SUBSCRIÇÕES (STRIPE SAAS)
// ==========================================

// Obter estado atual da subscrição do treinador
app.get('/api/subscription/status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        trialEndsAt: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }

    const trial = getTrialInfo(user);
    res.status(200).json({
      user,
      trial,
      stripeEnabled: !!stripe,
    });
  } catch (error) {
    console.error('Erro ao verificar estado da subscrição:', error);
    res.status(500).json({ error: 'Erro ao obter dados de subscrição.' });
  }
});

// Criar sessão de checkout no Stripe para ativar a mensalidade do PT
app.post('/api/subscription/create-checkout', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }

    if (user.role !== 'COACH') {
      return res.status(403).json({ error: 'Apenas contas de Personal Trainer podem subscrever o plano profissional.' });
    }

    if (!stripe) {
      console.warn('⚠️ Stripe API Secret Key não configurada. A disponibilizar modo de simulação.');
      return res.status(200).json({
        simulated: true,
        message: 'A chave do Stripe não se encontra configurada neste ambiente. Pode utilizar a ativação por simulação de testes.',
      });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const priceId = process.env.STRIPE_PRICE_ID_MONTHLY;
    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:8081';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: 'eur',
                product_data: {
                  name: 'Fit Coach Pro - Mensalidade de Treinador',
                  description: 'Acesso completo ao painel de Personal Trainer, gestão ilimitada de alunos, biblioteca de modelos e IA.',
                },
                unit_amount: 2990, // 29.90 EUR / mês
                recurring: { interval: 'month' },
              },
              quantity: 1,
            },
          ],
      success_url: `${frontendBaseUrl}?checkout=success`,
      cancel_url: `${frontendBaseUrl}?checkout=cancel`,
      metadata: { userId: user.id },
    });

    console.log(`Sessão Stripe Checkout criada com sucesso para ${user.name}: ${session.url}`);
    res.status(200).json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error('Erro ao gerar Stripe Checkout:', error);
    res.status(500).json({ error: error.message || 'Erro ao inicializar pagamento no Stripe.' });
  }
});

// Aceder ao portal de faturação do Stripe (Customer Portal para gerir cartões/cancelar)
app.post('/api/subscription/portal', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ error: 'Nenhum registo de cliente de faturação associado a este utilizador.' });
    }

    if (!stripe) {
      return res.status(400).json({ error: 'Portal Stripe indisponível sem chave de API configurada.' });
    }

    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:8081';
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: frontendBaseUrl,
    });

    res.status(200).json({ portalUrl: portalSession.url });
  } catch (error: any) {
    console.error('Erro ao aceder ao portal Stripe:', error);
    res.status(500).json({ error: error.message || 'Erro ao aceder ao portal de faturação.' });
  }
});

// Webhook do Stripe para sincronização automática de pagamentos e renovações
app.post('/api/subscription/webhook', async (req: any, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  if (stripe && webhookSecret && sig) {
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error('❌ Falha na assinatura do Stripe Webhook:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    event = req.body;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionStatus: 'active',
              stripeCustomerId: customerId || undefined,
              stripeSubscriptionId: subscriptionId || undefined,
            },
          });
          console.log(`✅ Subscrição ativada com sucesso para o utilizador ${userId}!`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

        if (customerId) {
          const status = sub.status === 'active' ? 'active' : sub.status;
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              subscriptionStatus: status,
              stripeSubscriptionId: sub.id,
            },
          });
          console.log(`Subscrição do cliente ${customerId} atualizada para ${status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

        if (customerId) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              subscriptionStatus: 'canceled',
            },
          });
          console.log(`Subscrição do cliente ${customerId} cancelada.`);
        }
        break;
      }

      default:
        console.log(`Evento Stripe recebido: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Erro ao processar webhook do Stripe:', error);
    res.status(500).json({ error: 'Erro ao processar evento webhook.' });
  }
});

// Endpoint de Teste/Dev: Simular pagamento e ativação da subscrição
app.post('/api/subscription/dev-simulate-payment', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'active',
        trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 ano
      },
    });

    console.log(`Simulação de pagamento ativada para ${updated.name}`);
    res.status(200).json({
      message: 'Subscrição profissional ativada em modo de demonstração com sucesso.',
      user: updated,
      trial: getTrialInfo(updated),
    });
  } catch (error) {
    console.error('Erro ao simular pagamento:', error);
    res.status(500).json({ error: 'Erro ao simular ativação de pagamento.' });
  }
});

// Endpoint de Teste/Dev: Simular expiração do trial para testar bloqueio/paywall
app.post('/api/subscription/dev-simulate-expiry', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'expired',
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // ontem
      },
    });

    console.log(`Simulação de expiração de trial ativada para ${updated.name}`);
    res.status(200).json({
      message: 'Período de avaliação expirado em modo de teste.',
      user: updated,
      trial: getTrialInfo(updated),
    });
  } catch (error) {
    console.error('Erro ao simular expiração:', error);
    res.status(500).json({ error: 'Erro ao simular expiração de teste.' });
  }
});

// ==========================================
// ARRANQUE DO SERVIDOR
// ==========================================

const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor a correr na porta ${PORT}`);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ ERRO: A porta ${PORT} já está a ser usada por outro processo!`);
  } else {
    console.error('❌ ERRO no servidor:', err);
  }
});

process.on('uncaughtException', (err) => {
  console.error("❌ ERRO CRÍTICO (Não apanhado):", err);
});

process.stdin.resume();