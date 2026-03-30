import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';

export default function AIGeneratorScreen({ navigation }: any) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    // 1. Validar se a caixa está vazia
    if (!prompt.trim()) {
      if (Platform.OS === 'web') {
        alert('Atenção: Tens de escrever o que queres que a IA faça!');
      } else {
        Alert.alert('Atenção', 'Tens de escrever o que queres que a IA faça!');
      }
      return;
    }

    // 2. Simular o estado de "A pensar..."
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      // 3. Mostrar a mensagem de sucesso consoante a plataforma
      if (Platform.OS === 'web') {
        alert('Sucesso! A interface está pronta. Na US 20 vamos ligar isto ao cérebro do servidor!');
      } else {
        Alert.alert('Sucesso!', 'A interface está pronta. Na US 20 vamos ligar isto ao cérebro do servidor!');
      }
    }, 2000);
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
            <Text style={styles.loadingText}>A pensar no treino ideal...</Text>
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