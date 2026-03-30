import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useAuthStore } from '../store/useAuthStore'; // Precisamos disto para o ID do utilizador!

export default function AIGeneratorScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    // Validação inicial
    if (!prompt.trim()) {
      if (Platform.OS === 'web') alert('Atenção: Tens de escrever o que queres que a IA faça!');
      else Alert.alert('Atenção', 'Tens de escrever o que queres que a IA faça!');
      return;
    }

    if (!user?.id) {
      if (Platform.OS === 'web') alert('Erro: Utilizador não encontrado.');
      else Alert.alert('Erro', 'Utilizador não encontrado.');
      return;
    }

    setIsGenerating(true);

    try {
      // AC 1: Falar com o servidor da IA e enviar o pedido
      const aiResponse = await fetch('http://192.168.1.80:3000/api/ai/generate-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt }),
      });

      if (!aiResponse.ok) throw new Error('Falha ao comunicar com a IA');
      const generatedData = await aiResponse.json();

      // AC 2: Criar a "pasta" do treino na base de dados
      const workoutResponse = await fetch('http://192.168.1.80:3000/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: generatedData.name,
          description: generatedData.description || 'Treino gerado com IA ✨',
          userId: user.id,
        }),
      });

      if (!workoutResponse.ok) throw new Error('Falha ao gravar o treino na BD');
      const newWorkout = await workoutResponse.json();

      // AC 3: Fazer um loop e guardar todos os exercícios que a IA inventou
      if (generatedData.exercises && generatedData.exercises.length > 0) {
        // Usamos o Promise.all para gravar todos ao mesmo tempo (é muito mais rápido!)
        const exercisePromises = generatedData.exercises.map((ex: any) => {
          return fetch('http://192.168.1.80:3000/api/exercises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: ex.name,
              sets: ex.sets || 3,
              reps: ex.reps || 10,
              weight: ex.weight || null,
              workoutId: newWorkout.id,
            }),
          });
        });

        await Promise.all(exercisePromises);
      }

      // AC 4: Tudo pronto! Avisar o utilizador e voltar ao Painel
      if (Platform.OS === 'web') {
        alert('Magia concluída! Treino criado com sucesso.');
      } else {
        Alert.alert('Magia Concluída! ✨', 'O teu treino foi criado e guardado com sucesso.');
      }
      
      // Limpa a caixa de texto para a próxima vez e viaja para o Dashboard
      setPrompt('');
      navigation.navigate('Dashboard');

    } catch (error) {
      console.error('❌ Erro na orquestração da IA:', error);
      if (Platform.OS === 'web') {
        alert('Erro: A IA teve um soluço. Tenta escrever o pedido de forma um pouco diferente!');
      } else {
        Alert.alert('Erro', 'A IA teve um soluço. Tenta escrever o pedido de forma um pouco diferente!');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHeader}>
        <Text style={styles.backHeaderText}>⬅ Voltar ao Painel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>IA Personal Trainer ✨</Text>
      <Text style={styles.subtitle}>
        Pede-me um treino à tua medida. Por exemplo: "Quero um treino de pernas de 45 minutos para hipertrofia com 4 exercícios."
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Ex: Treino de peito e tríceps intenso para força..."
        placeholderTextColor="#666"
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        value={prompt}
        onChangeText={setPrompt}
        editable={!isGenerating}
      />

      <TouchableOpacity 
        style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]} 
        onPress={handleGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.loadingText}>A criar o teu treino ideal...</Text>
          </View>
        ) : (
          <Text style={styles.generateButtonText}>✨ Criar treino</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 50 },
  backHeader: { marginBottom: 20 },
  backHeaderText: { color: '#4CAF50', fontSize: 16, fontWeight: 'bold' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 30, textAlign: 'center', lineHeight: 22 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, padding: 15, fontSize: 16, marginBottom: 30, borderWidth: 1, borderColor: '#333', minHeight: 120 },
  generateButton: { backgroundColor: '#8A2BE2', padding: 15, borderRadius: 8, alignItems: 'center', elevation: 5, shadowColor: '#8A2BE2', shadowOpacity: 0.5, shadowRadius: 10 },
  generateButtonDisabled: { backgroundColor: '#5c1d96' },
  generateButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 10 }
});