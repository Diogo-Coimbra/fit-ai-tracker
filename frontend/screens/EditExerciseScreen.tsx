import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';

export default function EditExerciseScreen({ route, navigation }: any) {
  // Recebemos o exercício completo que foi clicado no ecrã anterior
  const { exercise } = route.params;

  // Preenchemos o estado inicial com os dados atuais do exercício (AC 2)
  const [name, setName] = useState(exercise.name);
  const [sets, setSets] = useState(exercise.sets.toString());
  const [reps, setReps] = useState(exercise.reps.toString());
  const [weight, setWeight] = useState(exercise.weight ? exercise.weight.toString() : '');
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = async () => {
    if (!name.trim() || !sets.trim() || !reps.trim()) {
      const msg = 'Nome, séries e repetições são obrigatórios!';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Erro', msg);
      return;
    }

    setIsSaving(true);

    try {
      // AC 3: Fazemos o pedido PUT ao backend
      const response = await fetch(`http://192.168.1.80:3000/api/exercises/${exercise.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sets: parseInt(sets),
          reps: parseInt(reps),
          weight: weight ? parseFloat(weight) : null,
        }),
      });

      if (response.ok) {
        // Ao voltar para trás, o useFocusEffect do WorkoutDetailsScreen vai atualizar a lista sozinho!
        navigation.goBack();
      } else {
        throw new Error('Falha ao atualizar');
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar exercício:', error);
      if (Platform.OS === 'web') alert('Não foi possível guardar as alterações.');
      else Alert.alert('Erro', 'Não foi possível guardar as alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHeader}>
        <Text style={styles.backHeaderText}>⬅ Cancelar Edição</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Editar Exercício ✏️</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Nome do Exercício</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex: Supino Plano" placeholderTextColor="#666" />

        <View style={styles.row}>
          <View style={styles.halfColumn}>
            <Text style={styles.label}>Séries</Text>
            <TextInput style={styles.input} value={sets} onChangeText={setSets} placeholder="4" keyboardType="numeric" placeholderTextColor="#666" />
          </View>
          <View style={styles.halfColumn}>
            <Text style={styles.label}>Repetições</Text>
            <TextInput style={styles.input} value={reps} onChangeText={setReps} placeholder="10" keyboardType="numeric" placeholderTextColor="#666" />
          </View>
        </View>

        <Text style={styles.label}>Peso (kg) - Opcional</Text>
        <TextInput style={styles.input} value={weight} onChangeText={setWeight} placeholder="Ex: 60" keyboardType="numeric" placeholderTextColor="#666" />

        <TouchableOpacity 
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} 
          onPress={handleUpdate} 
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>{isSaving ? 'A guardar...' : 'Guardar Alterações'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 50 },
  backHeader: { marginBottom: 20 },
  backHeaderText: { color: '#ff4444', fontSize: 16, fontWeight: 'bold' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', marginBottom: 30 },
  form: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12 },
  label: { color: '#aaaaaa', fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: '#2a2a2a', color: '#ffffff', padding: 15, borderRadius: 8, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfColumn: { width: '48%' },
  saveButton: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  saveButtonDisabled: { backgroundColor: '#2e6b31' },
  saveButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});