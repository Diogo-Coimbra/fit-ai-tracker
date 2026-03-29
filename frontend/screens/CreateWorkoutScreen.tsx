import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';

export default function CreateWorkoutScreen({ navigation }: any) {
  const { user } = useAuthStore();
  
  // Variáveis para guardar o que escreves no formulário
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateWorkout = async () => {
    // Validação simples para não enviar treinos sem nome
    if (!name.trim()) {
      Alert.alert('Atenção', 'O nome do treino é obrigatório!');
      return;
    }

    setIsSubmitting(true);

    try {
      // ⚠️ ATENÇÃO: Confirma se o teu IP (192.168.1.80) continua a ser este!
      const response = await fetch('http://192.168.1.80:3000/api/workouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
          description: description,
          userId: user?.id, // O teu ID da base de dados
        }),
      });

      if (response.ok) {
        Alert.alert('Sucesso! 🎉', 'O teu novo treino foi guardado na base de dados!');
        navigation.goBack(); // Manda-te de volta para o Dashboard automaticamente
      } else {
        Alert.alert('Erro', 'Ocorreu um erro ao guardar o treino no servidor.');
      }
    } catch (error) {
      console.error('❌ Erro no fetch:', error);
      Alert.alert('Erro', 'Não foi possível comunicar com o servidor. Verifica se o backend está a correr.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Novo Treino 🏋️‍♂️</Text>

      <Text style={styles.label}>Nome do Treino *</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Dia de Peito, Leg Day..."
        placeholderTextColor="#666"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Descrição (Opcional)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Ex: Foco em hipertrofia..."
        placeholderTextColor="#666"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
      />

      <TouchableOpacity 
        style={styles.submitButton} 
        onPress={handleCreateWorkout}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Guardar Treino</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.cancelButton} 
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.cancelButtonText}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 30, textAlign: 'center' },
  label: { color: '#aaaaaa', fontSize: 16, marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, padding: 15, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  textArea: { height: 100, textAlignVertical: 'top' },
  submitButton: { backgroundColor: '#4285F4', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  cancelButtonText: { color: '#ff4444', fontSize: 16, fontWeight: 'bold' },
});