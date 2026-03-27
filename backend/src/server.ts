// 1. Importamos o "rececionista" (Express)
import express from 'express';

// 2. Criamos a nossa aplicação (o nosso servidor)
const app = express();

// 3. Definimos qual é a "porta" onde ele vai ficar à escuta
// Se o sistema der uma porta, usamos essa, senão usamos a 3000 por defeito
const PORT = process.env.PORT || 3000;

// 4. Ensinamos o servidor a ler ficheiros JSON (que é como a internet fala hoje em dia)
app.use(express.json());

// 5. Criamos uma rota de teste (uma porta de entrada simples)
// Quando alguém for ao endereço principal ('/'), o servidor responde com uma mensagem
app.get('/', (req, res) => {
  res.send('O Backend do Fit AI Tracker está vivo e a respirar! 🏋️‍♂️');
});

// 6. Finalmente, mandamos o servidor arrancar e ficar à escuta
app.listen(PORT, () => {
  console.log(`🚀 Servidor a correr na porta ${PORT}`);
});