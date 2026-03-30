import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, FlatList, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore'; // 👈 IMPORTANTE: Fomos buscar o cofre global (US 26)

export default function WorkoutDetailsScreen({ route, navigation }: any) {
  const { workoutId } = route.params;
  const { user } = useAuthStore(); // 👈 Vamos buscar o user logado para saber quem está a treinar (US 26)
  
  const [workoutDetails, setWorkoutDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ESTADO US 23: Guarda os IDs dos exercícios concluídos hoje
  const [completedExercises, setCompletedExercises] = useState<string[]>([]);
  
  // NOVO ESTADO US 26: Evita que o utilizador clique duas vezes no botão de finalizar
  const [isFinishing, setIsFinishing] = useState(false);

  const fetchDetails = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`http://192.168.1.80:3000/api/workouts/detail/${workoutId}`);
      const data = await response.json();
      setWorkoutDetails(data);
    } catch (error) {
      console.error('❌ Erro ao ir buscar os detalhes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDetails();
    }, [workoutId])
  );

  const executeDeleteExercise = async (exerciseId: string) => {
    try {
      const response = await fetch(`http://192.168.1.80:3000/api/exercises/${exerciseId}`, { method: 'DELETE' });
      if (response.ok) {
        setWorkoutDetails((prev: any) => ({
          ...prev,
          exercises: prev.exercises.filter((ex: any) => ex.id !== exerciseId),
        }));
      } else {
        alert('Erro: Não foi possível apagar o exercício.');
      }
    } catch (error) {
      console.error('❌ Erro ao apagar exercício:', error);
    }
  };

  const executeDeleteWorkout = async () => {
    try {
      const response = await fetch(`http://192.168.1.80:3000/api/workouts/${workoutId}`, { method: 'DELETE' });
      if (response.ok) {
        navigation.navigate('Dashboard');
      } else {
        alert('Erro: Não foi possível apagar o treino.');
      }
    } catch (error) {
      console.error('❌ Erro ao apagar treino:', error);
    }
  };

  const handleDeleteExercise = (exerciseId: string, exerciseName: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Tens a certeza que queres remover o "${exerciseName}"?`);
      if (confirmed) executeDeleteExercise(exerciseId);
    } else {
      Alert.alert(
        'Apagar Exercício',
        `Tens a certeza que queres remover o "${exerciseName}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Apagar', style: 'destructive', onPress: () => executeDeleteExercise(exerciseId) },
        ]
      );
    }
  };

  const handleDeleteWorkout = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Tens a certeza que queres destruir este treino e TODOS os seus exercícios?');
      if (confirmed) executeDeleteWorkout();
    } else {
      Alert.alert(
        'Apagar Treino',
        'Tens a certeza que queres destruir este treino e TODOS os seus exercícios?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Destruir Treino', style: 'destructive', onPress: executeDeleteWorkout },
        ]
      );
    }
  };

  const toggleExerciseCompletion = (exerciseId: string) => {
    setCompletedExercises((prev) => 
      prev.includes(exerciseId) 
        ? prev.filter((id) => id !== exerciseId)
        : [...prev, exerciseId]
    );
  };

  // 👇 NOVA FUNÇÃO US 26: Regista a vitória no backend!
  const handleFinishWorkout = async () => {
    if (!user?.id || !workoutDetails?.id) return;
    
    setIsFinishing(true);
    try {
      const response = await fetch('http://192.168.1.80:3000/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, workoutId: workoutDetails.id })
      });

      if (response.ok) {
        if (Platform.OS === 'web') {
          alert('Treino Finalizado! Parabéns, foste uma máquina hoje! 💪🏆');
        } else {
          Alert.alert('Treino Finalizado! 🏆', 'Parabéns, foste uma máquina hoje! 💪');
        }
        navigation.navigate('Dashboard');
      } else {
        throw new Error('Falha ao registar o log na base de dados.');
      }
    } catch (error) {
      console.error('❌ Erro ao finalizar treino:', error);
      if (Platform.OS === 'web') alert('Erro ao finalizar o treino. Tenta de novo!');
      else Alert.alert('Erro', 'Não foi possível registar o treino. Tenta de novo!');
    } finally {
      setIsFinishing(false);
    }
  };

  const renderExercise = ({ item }: any) => {
    const isCompleted = completedExercises.includes(item.id);

    return (
      <TouchableOpacity 
        activeOpacity={0.8}
        style={[styles.exerciseCard, isCompleted && styles.exerciseCardCompleted]}
        onPress={() => toggleExerciseCompletion(item.id)}
      >
        <View style={styles.exerciseInfo}>
          <Text style={[styles.exerciseName, isCompleted && styles.exerciseTextCompleted]}>
            {isCompleted ? '✅ ' : ''}{item.name}
          </Text>
          <Text style={[styles.exerciseDetails, isCompleted && styles.exerciseTextCompleted]}>
            {item.sets} séries x {item.reps} reps {item.weight ? `| ${item.weight}kg` : ''}
          </Text>
        </View>
        
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.actionBtn}
            onPress={() => navigation.navigate('EditExercise', { exercise: item })}
          >
            <Text style={styles.iconText}>✏️</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionBtn}
            onPress={() => handleDeleteExercise(item.id, item.name)}
          >
            <Text style={styles.iconText}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHeader}>
        <Text style={styles.backHeaderText}>⬅ Voltar ao Painel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{workoutDetails?.name}</Text>
      {workoutDetails?.description ? (
        <Text style={styles.description}>{workoutDetails.description}</Text>
      ) : null}

      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Modo de Treino 🏋️‍♂️</Text>
        <Text style={styles.instructionText}>Toca num exercício para marcá-lo como concluído!</Text>
        
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => navigation.navigate('AddExercise', { workoutId: workoutDetails?.id })}
        >
          <Text style={styles.addButtonText}>+ Adicionar Exercício</Text>
        </TouchableOpacity>

        <FlatList
          data={workoutDetails?.exercises || []}
          keyExtractor={(item) => item.id}
          renderItem={renderExercise}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Ainda não tens exercícios neste treino. Começa por adicionar o primeiro aqui em cima!
            </Text>
          }
        />
      </View>

      {/* 👇 NOVO BOTÃO US 26: O Botão Dourado de Finalizar Treino */}
      <TouchableOpacity 
        style={[styles.finishBtn, isFinishing && styles.finishBtnDisabled]} 
        onPress={handleFinishWorkout}
        disabled={isFinishing}
      >
        <Text style={styles.finishBtnText}>
          {isFinishing ? 'A registar...' : '🏆 Finalizar Treino'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteWorkoutBtn} onPress={handleDeleteWorkout}>
        <Text style={styles.deleteWorkoutText}>🗑️ Apagar Treino Inteiro</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 50 },
  loadingContainer: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  backHeader: { marginBottom: 20 },
  backHeaderText: { color: '#4CAF50', fontSize: 16, fontWeight: 'bold' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', marginBottom: 10 },
  description: { fontSize: 16, color: '#aaaaaa', marginBottom: 20 },
  instructionText: { color: '#888', fontStyle: 'italic', marginBottom: 15, textAlign: 'center' },
  listContainer: { flex: 1, backgroundColor: '#1e1e1e', borderRadius: 12, padding: 15, marginBottom: 20 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', marginBottom: 5, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10 },
  addButton: { backgroundColor: '#4285F4', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  addButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  emptyText: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginTop: 30, lineHeight: 22 },
  errorText: { color: '#ff4444', fontSize: 18, textAlign: 'center', marginTop: 50 },
  backButton: { backgroundColor: '#333333', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  backButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  
  exerciseCard: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#4285F4', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseInfo: { flex: 1 },
  exerciseName: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  exerciseDetails: { fontSize: 14, color: '#aaaaaa' },
  
  exerciseCardCompleted: { borderLeftColor: '#4CAF50', backgroundColor: '#1a1a1a', opacity: 0.6 },
  exerciseTextCompleted: { textDecorationLine: 'line-through', color: '#666' },

  actionButtons: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 5, marginLeft: 10 },
  iconText: { fontSize: 20 },

  // 👇 NOVOS ESTILOS DO BOTÃO DOURADO
  finishBtn: { backgroundColor: '#FFD700', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 15, elevation: 5, shadowColor: '#FFD700', shadowOpacity: 0.4, shadowRadius: 8 },
  finishBtnDisabled: { backgroundColor: '#b39700', opacity: 0.7 },
  finishBtnText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },

  deleteWorkoutBtn: { backgroundColor: '#ff4444', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  deleteWorkoutText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});