import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

// 🕵️ DEBUG PARA VER SE O FRONTEND ESTÁ A COMUNICAR CORRECTAMENTE
app.use((req, res, next) => {
  console.log(`\n➡️ [${req.method}] ${req.url}`);
  next();
});

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const googleClient = new OAuth2Client();

console.log("🚀 Link detetado:", process.env.DATABASE_URL ? "SIM ✅" : "NÃO ❌");

app.post('/api/auth/google', async (req, res) => {
  console.log("📦 Body Recebido do Frontend:", req.body);
  // CORREÇÃO CRÍTICA: Garantir que é .body (com Y)
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Nenhum token fornecido!' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) return res.status(400).json({ error: 'Erro Google' });

    const user = await prisma.user.upsert({
      where: { googleId: payload.sub },
      update: {},
      create: {
        googleId: payload.sub,
        email: payload.email!,
        name: payload.name!,
        picture: payload.picture,
      },
    });

    console.log(`✅ Utilizador autenticado: ${user.name}`);
    res.status(200).json({ message: 'Sucesso!', user });

  } catch (error) {
    console.error("Erro na autenticação:", error);
    res.status(401).json({ error: 'Token inválido!' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor a correr na porta ${PORT}`);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ ERRO: A porta ${PORT} já está a ser usada por outro processo! Tens de parar os outros terminais.`);
  } else {
    console.error('❌ ERRO no servidor:', err);
  }
});

process.on('uncaughtException', (err) => {
  console.error("❌ ERRO CRÍTICO (Não apanhado):", err);
  // Opcional: process.exit(1); mas tentaremos manter aberto para debug
});

// Ajudar o nodemon em Windows a não fazer clean exit fantasma bloqueando o processo
process.stdin.resume();