import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';

export default function AddExerciseScreen({ route, navigation }: any) {
  // Recebemos o ID do treino para sabermos onde guardar o exercício
  const { workoutId } = route.params;

  const [name, setName] = useState('');
  const [sets, setSets] = useState('3'); // O padrão é 3 séries
  const [reps, setReps] = useState('10'); // O padrão é 10 repetições
  const [weight, setWeight] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddExercise = async () => {
    if (!name.trim()) {
      Alert.alert('Atenção', 'O nome do exercício é obrigatório!');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('http://192.168.1.80:3000/api/exercises', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
          sets: parseInt(sets) || 3,
          reps: parseInt(reps) || 10,
          weight: weight ? parseFloat(weight) : null,
          workoutId: workoutId,
        }),
      });

      if (response.ok) {
        // Se correu bem, volta para o ecrã do treino (e o useFocusEffect vai atualizar a lista sozinho!)
        navigation.goBack();
      } else {
        Alert.alert('Erro', 'Ocorreu um erro ao guardar o exercício.');
      }
    } catch (error) {
      console.error('❌ Erro no fetch:', error);
      Alert.alert('Erro', 'Não foi possível comunicar com o servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Novo Exercício 💪</Text>

      <Text style={styles.label}>Nome do Exercício *</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Supino Plano"
        placeholderTextColor="#666"
        value={name}
        onChangeText={setName}
      />

      <View style={styles.row}>
        <View style={styles.halfInput}>
          <Text style={styles.label}>Séries</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={sets}
            onChangeText={setSets}
          />
        </View>
        <View style={styles.halfInput}>
          <Text style={styles.label}>Repetições</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={reps}
            onChangeText={setReps}
          />
        </View>
      </View>

      <Text style={styles.label}>Peso (kg) - Opcional</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: 60"
        placeholderTextColor="#666"
        keyboardType="numeric"
        value={weight}
        onChangeText={setWeight}
      />

      <TouchableOpacity 
        style={styles.submitButton} 
        onPress={handleAddExercise}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Adicionar ao Treino</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
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
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfInput: { width: '48%' },
  submitButton: { backgroundColor: '#4285F4', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  cancelButtonText: { color: '#ff4444', fontSize: 16, fontWeight: 'bold' },
});