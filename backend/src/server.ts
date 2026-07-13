import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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

// AC 1 (US 31): Clonar um treino existente e os seus exercícios (POST)
app.post('/api/workouts/:workoutId/clone', async (req, res) => {
  try {
    const { workoutId } = req.params;

    // 1. Ir buscar o ficheiro do treino original e os exercícios que tem lá dentro
    const originalWorkout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: { exercises: true },
    });

    if (!originalWorkout) {
      return res.status(404).json({ error: 'Treino original não encontrado.' });
    }

    // 2. Criar a cópia exata usando o "Nested Create" do Prisma
    const clonedWorkout = await prisma.workout.create({
      data: {
        name: `${originalWorkout.name} (Cópia)`, // Adicionamos a etiqueta para se distinguir
        description: originalWorkout.description,
        userId: originalWorkout.userId, // Mantemos o mesmo dono
        
        // A magia acontece aqui: criamos logo os exercícios todos ligados ao novo treino!
        exercises: {
          create: originalWorkout.exercises.map((ex) => ({
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight,
          })),
        },
      },
    });

    console.log(`👯 Treino "${originalWorkout.name}" clonado com sucesso!`);
    
    // Devolvemos o novo treino para o frontend poder redirecionar (AC 3)
    res.status(201).json(clonedWorkout);
  } catch (error) {
    console.error('❌ Erro ao clonar treino:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao clonar o treino.' });
  }
});
// ==========================================
// ROTAS DE EXERCÍCIOS (EXERCISES) - SPRINT 5
// ==========================================

// AC 1 (US 36): Obter o Recorde Pessoal (PR) de um exercício específico (GET)
app.get('/api/exercises/:userId/pr/:exerciseName', async (req, res) => {
  try {
    const { userId, exerciseName } = req.params;

    // A magia do Prisma: Procura o exercício com maior peso filtrando por nome e por treinos concluídos
    const prExercise = await prisma.exercise.findFirst({
      where: {
        name: {
          equals: exerciseName,
          mode: 'insensitive', // Ignora maiúsculas/minúsculas para evitar falhas se houver erros de digitação
        },
        workout: {
          userId: userId,
          logs: {
            some: {}, // Garante que o treino foi finalizado pelo menos uma vez
          },
        },
        weight: {
          not: null, // Ignora exercícios que não tenham peso definido
        },
      },
      orderBy: {
        weight: 'desc', // Ordena do maior peso para o menor
      },
    });

    // Se encontrar o exercício, devolve o peso. Se não, devolve 0.
    const maxWeight = prExercise ? prExercise.weight : 0;

    console.log(`🏆 PR detetado para "${exerciseName}": ${maxWeight}kg (Utilizador: ${userId})`);
    res.status(200).json({ pr: maxWeight });
  } catch (error) {
    console.error('❌ Erro ao buscar PR do exercício:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao obter o recorde pessoal.' });
  }
});

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

// AC 1: Apagar um exercício específico (DELETE)
app.delete('/api/exercises/:exerciseId', async (req, res) => {
  try {
    const { exerciseId } = req.params;

    // O Prisma vai à base de dados e destrói esta linha
    await prisma.exercise.delete({
      where: { id: exerciseId },
    });

    console.log(`🗑️ Exercício ${exerciseId} apagado com sucesso!`);
    res.status(200).json({ message: 'Exercício apagado com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao apagar exercício:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao apagar o exercício.' });
  }
});

// AC 2: Apagar um treino inteiro e os seus exercícios (DELETE)
app.delete('/api/workouts/:workoutId', async (req, res) => {
  try {
    const { workoutId } = req.params;

    // 1º Passo: Apagar todos os exercícios que estão dentro deste treino
    await prisma.exercise.deleteMany({
      where: { workoutId: workoutId },
    });

    // 2º Passo: Apagar a "pasta" do treino
    await prisma.workout.delete({
      where: { id: workoutId },
    });

    console.log(`🗑️ Treino ${workoutId} e os seus exercícios foram apagados!`);
    res.status(200).json({ message: 'Treino apagado com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao apagar treino:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao apagar o treino.' });
  }
});

// ==========================================
// ROTAS DE PERFIL DE UTILIZADOR - SPRINT 9
// ==========================================

// AC 1, 2 & 3: Atualizar o perfil do utilizador (PUT)
// AC 1, 2 & 3: Atualizar o perfil do utilizador (PUT)
app.put('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 👇 Agora extraímos também o weeklyGoal do body
    const { name, picture, weeklyGoal } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { 
        name, 
        picture,
        weeklyGoal // 👈 Adicionamos aqui para guardar na BD
      },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        weeklyGoal: true, // 👈 Adicionamos aqui para o devolver ao frontend
        createdAt: true,
      }
    });

    console.log(`👤 Perfil de ${updatedUser.name} atualizado (Objetivo: ${updatedUser.weeklyGoal}x/semana)!`);
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('❌ Erro ao atualizar perfil do utilizador:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao atualizar o perfil.' });
  }
});

// ==========================================
// ROTAS DE ATUALIZAÇÃO (UPDATE) - SPRINT 8
// ==========================================

// AC 1, 2 & 3: Atualizar um exercício específico (PUT)
app.put('/api/exercises/:exerciseId', async (req, res) => {
  try {
    const { exerciseId } = req.params;
    
    // Extraímos apenas os campos que nos interessam do corpo do pedido
    const { name, sets, reps, weight } = req.body;

    // O Prisma faz a magia aqui: tudo o que for 'undefined' é ignorado,
    // garantindo assim a atualização parcial (AC 2) de forma automática!
    const updatedExercise = await prisma.exercise.update({
      where: { id: exerciseId },
      data: { 
        name, 
        sets, 
        reps, 
        weight 
      },
    });

    console.log(`✏️ Exercício ${exerciseId} atualizado com sucesso!`);
    
    // AC 3: Devolvemos o exercício atualizado ao frontend
    res.status(200).json(updatedExercise);
  } catch (error) {
    console.error('❌ Erro ao atualizar exercício:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao atualizar o exercício.' });
  }
});

// ==========================================
// ROTAS DE INTELIGÊNCIA ARTIFICIAL (IA) - SPRINT 6
// ==========================================

// AC 2: Rota para gerar treinos com IA
app.post('/api/ai/generate-workout', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'O prompt (pedido) é obrigatório!' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'A chave da API não está configurada no servidor.' });
    }

    // Usamos o modelo Flash, que é super rápido e perfeito para texto
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // O Segredo: O Prompt do Sistema para forçar a IA a cuspir um JSON certinho
    const systemInstruction = `
      És um personal trainer de elite. O utilizador vai pedir-te um treino.
      Tens de responder ESTRITAMENTE num formato JSON válido, sem texto extra ou formatação markdown (sem \`\`\`json).
      Usa exatamente esta estrutura:
      {
        "name": "Nome do Treino (ex: Treino de Força - Peito)",
        "description": "Uma breve frase motivacional ou objetivo do treino",
        "exercises": [
          {
            "name": "Nome do Exercício",
            "sets": 4,
            "reps": 10,
            "weight": 0
          }
        ]
      }
    `;

    const fullPrompt = `${systemInstruction}\n\nPedido do utilizador: ${prompt}`;

    // Pedir à IA para pensar e responder
    const result = await model.generateContent(fullPrompt);
    const responseText = result.response.text();

    // Limpar o texto (caso a IA insista em mandar formatação markdown por engano)
    const cleanJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

    // Transformar o texto da IA num objeto informático real
    const workoutData = JSON.parse(cleanJsonText);

    console.log(`🧠 IA gerou o treino: ${workoutData.name}`);
    res.status(200).json(workoutData);

  } catch (error) {
    console.error('❌ Erro na IA:', error);
    res.status(500).json({ error: 'Erro ao gerar treino com a IA.' });
  }
});

// ==========================================
// ROTAS DE HISTÓRICO DE TREINOS - SPRINT 9
// ==========================================

// AC 1: Guardar um treino concluído
app.post('/api/logs', async (req, res) => {
  try {
    // US 35: Recebemos também o durationMinutes do frontend
    const { userId, workoutId, durationMinutes } = req.body;

    if (!userId || !workoutId) {
      return res.status(400).json({ error: 'Faltam os IDs do utilizador ou do treino.' });
    }

    const newLog = await prisma.workoutLog.create({
      data: {
        userId,
        workoutId,
        durationMinutes: durationMinutes || 0 // 👈 Guarda o tempo na base de dados!
      }
    });

    console.log(`🏆 Treino ${workoutId} finalizado pelo utilizador ${userId} em ${durationMinutes} min!`);
    res.status(201).json(newLog);
  } catch (error) {
    console.error('❌ Erro ao guardar histórico:', error);
    res.status(500).json({ error: 'Erro ao registar o treino concluído.' });
  }
});

// AC 1: Obter o histórico de treinos de um utilizador (GET)
app.get('/api/logs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const historyLogs = await prisma.workoutLog.findMany({
      where: { 
        userId: userId 
      },
      // AC 2: Ordenar do mais recente (descending) para o mais antigo
      orderBy: {
        createdAt: 'desc',
      },
      // AC 3: Trazer os dados do treino associado para podermos mostrar o nome no ecrã!
      include: {
        workout: true,
      },
    });

    console.log(`📊 Histórico carregado para o utilizador ${userId}: ${historyLogs.length} treinos.`);
    res.status(200).json(historyLogs);
  } catch (error) {
    console.error('❌ Erro ao ir buscar o histórico:', error);
    res.status(500).json({ error: 'Erro interno ao obter o histórico de treinos.' });
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