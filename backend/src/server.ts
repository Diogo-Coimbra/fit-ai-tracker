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

// ==========================================
// ROTAS DE TREINOS (WORKOUTS) - SPRINT 4
// ==========================================

// AC 2: Criar um novo treino (POST)
app.post('/api/workouts', async (req, res) => {
  try {
    const { name, description, userId } = req.body;

    if (!name || !userId) {
      return res.status(400).json({ error: 'O nome e o userId são obrigatórios!' });
    }

    const newWorkout = await prisma.workout.create({
      data: {
        name,
        description,
        userId,
      },
    });

    console.log(`✅ Treino "${name}" criado com sucesso!`);
    res.status(201).json(newWorkout);
  } catch (error) {
    console.error('❌ Erro ao criar treino:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao criar o treino.' });
  }
});

// AC 3: Buscar todos os treinos de um utilizador (GET)
app.get('/api/workouts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userWorkouts = await prisma.workout.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: 'desc', // Organiza do mais recente para o mais antigo
      },
    });

    res.status(200).json(userWorkouts);
  } catch (error) {
    console.error('❌ Erro ao buscar treinos:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar os treinos.' });
  }
});

// ==========================================
// ROTAS DE EXERCÍCIOS (EXERCISES) - SPRINT 5
// ==========================================

// AC 1: Criar um novo exercício num treino (POST)
app.post('/api/exercises', async (req, res) => {
  try {
    const { name, sets, reps, weight, workoutId } = req.body;

    if (!name || !workoutId) {
      return res.status(400).json({ error: 'O nome do exercício e o workoutId são obrigatórios!' });
    }

    const newExercise = await prisma.exercise.create({
      data: {
        name,
        sets: sets || 3,
        reps: reps || 10,
        weight: weight || null,
        workoutId,
      },
    });

    console.log(`✅ Exercício "${name}" adicionado ao treino com sucesso!`);
    res.status(201).json(newExercise);
  } catch (error) {
    console.error('❌ Erro ao criar exercício:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao criar o exercício.' });
  }
});

// AC 2: Buscar um treino específico e todos os seus exercícios (GET)
app.get('/api/workouts/detail/:workoutId', async (req, res) => {
  try {
    const { workoutId } = req.params;

    const workoutDetails = await prisma.workout.findUnique({
      where: {
        id: workoutId,
      },
      include: {
        exercises: {
          orderBy: {
            createdAt: 'asc', 
          }
        },
      },
    });

    if (!workoutDetails) {
      return res.status(404).json({ error: 'Treino não encontrado.' });
    }

    res.status(200).json(workoutDetails);
  } catch (error) {
    console.error('❌ Erro ao buscar detalhes do treino:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar os detalhes.' });
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