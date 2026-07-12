import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, FlatList, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';

export default function WorkoutDetailsScreen({ route, navigation }: any) {
  const { workoutId } = route.params;
  const { user } = useAuthStore();
  
  const [workoutDetails, setWorkoutDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [completedExercises, setCompletedExercises] = useState<string[]>([]);
  const [isFinishing, setIsFinishing] = useState(false);
  
  // NOVO ESTADO US 31: Controla o loading do botão de duplicar
  const [isCloning, setIsCloning] = useState(false);

  // Estados do Temporizador de Descanso (US 30)
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerState, setTimerState] = useState<'idle' | 'running' | 'finished'>('idle');

  useEffect(() => {
    let interval: any;
    if (timerState === 'running' && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timerState === 'running' && timeLeft === 0) {
      setTimerState('finished');
    }
    return () => clearInterval(interval);
  }, [timerState, timeLeft]);

  const startTimer = (seconds: number) => {
    setTimeLeft(seconds);
    setTimerState('running');
  };

  const stopTimer = () => {
    setTimerState('idle');
    setTimeLeft(0);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

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
      if (Platform.OS === 'web') alert('Erro ao finalizar o treino.');
      else Alert.alert('Erro', 'Não foi possível registar o treino.');
    } finally {
      setIsFinishing(false);
    }
  };

  // 👇 NOVA FUNÇÃO US 31: Lógica para clonar o treino
  const handleCloneWorkout = async () => {
    setIsCloning(true);
    try {
      const response = await fetch(`http://192.168.1.80:3000/api/workouts/${workoutId}/clone`, {
        method: 'POST',
      });

      if (response.ok) {
        const clonedWorkout = await response.json();
        
        // AC 3: Navega imediatamente para a cópia (usamos replace para não acumular ecrãs)
        navigation.replace('WorkoutDetails', { workoutId: clonedWorkout.id });
      } else {
        throw new Error('Falha ao duplicar o treino na base de dados.');
      }
    } catch (error) {
      console.error('❌ Erro ao duplicar treino:', error);
      if (Platform.OS === 'web') alert('Erro ao duplicar o treino. Tenta de novo!');
      else Alert.alert('Erro', 'Não foi possível duplicar o treino. Tenta de novo!');
    } finally {
      setIsCloning(false);
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
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('EditExercise', { exercise: item })}>
            <Text style={styles.iconText}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteExercise(item.id, item.name)}>
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

      <View style={[styles.timerContainer, timerState === 'finished' && styles.timerFinished]}>
        <Text style={styles.timerTitle}>⏱️ Descanso</Text>
        {timerState === 'finished' ? (
          <View style={styles.timerFinishedState}>
            <Text style={styles.timerFinishedText}>BORA LÁ! ACABOU O DESCANSO!</Text>
            <TouchableOpacity style={styles.timerBtnStop} onPress={stopTimer}>
              <Text style={styles.timerBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.timerActiveState}>
            <Text style={styles.timerDisplay}>{formatTime(timeLeft)}</Text>
            <View style={styles.timerButtons}>
              <TouchableOpacity style={styles.timerBtn} onPress={() => startTimer(60)}>
                <Text style={styles.timerBtnText}>+ 60s</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.timerBtn} onPress={() => startTimer(90)}>
                <Text style={styles.timerBtnText}>+ 90s</Text>
              </TouchableOpacity>
              {timerState === 'running' && (
                <TouchableOpacity style={styles.timerBtnStop} onPress={stopTimer}>
                  <Text style={styles.timerBtnText}>Parar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Modo de Treino 🏋️‍♂️</Text>
        <Text style={styles.instructionText}>Toca num exercício para marcá-lo como concluído!</Text>
        
        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddExercise', { workoutId: workoutDetails?.id })}>
          <Text style={styles.addButtonText}>+ Adicionar Exercício</Text>
        </TouchableOpacity>

        <FlatList
          data={workoutDetails?.exercises || []}
          keyExtractor={(item) => item.id}
          renderItem={renderExercise}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Ainda não tens exercícios neste treino. Começa por adicionar o primeiro aqui em cima!</Text>
          }
        />
      </View>

      {/* BLOCO DE BOTÕES DE AÇÃO */}
      <TouchableOpacity 
        style={[styles.finishBtn, isFinishing && styles.finishBtnDisabled]} 
        onPress={handleFinishWorkout}
        disabled={isFinishing}
      >
        <Text style={styles.finishBtnText}>{isFinishing ? 'A registar...' : '🏆 Finalizar Treino'}</Text>
      </TouchableOpacity>

      {/* 👇 NOVO BOTÃO US 31: Duplicar Treino */}
      <TouchableOpacity 
        style={[styles.cloneWorkoutBtn, isCloning && styles.cloneWorkoutBtnDisabled]} 
        onPress={handleCloneWorkout}
        disabled={isCloning}
      >
        <Text style={styles.cloneWorkoutText}>{isCloning ? 'A duplicar...' : '👯 Duplicar Treino'}</Text>
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
  
  exerciseCard: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#4285F4', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseInfo: { flex: 1 },
  exerciseName: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  exerciseDetails: { fontSize: 14, color: '#aaaaaa' },
  exerciseCardCompleted: { borderLeftColor: '#4CAF50', backgroundColor: '#1a1a1a', opacity: 0.6 },
  exerciseTextCompleted: { textDecorationLine: 'line-through', color: '#666' },
  actionButtons: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 5, marginLeft: 10 },
  iconText: { fontSize: 20 },

  timerContainer: { backgroundColor: '#222', padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#444' },
  timerFinished: { backgroundColor: '#b32400', borderColor: '#ff3300' },
  timerTitle: { fontSize: 16, color: '#fff', fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  timerActiveState: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timerFinishedState: { alignItems: 'center' },
  timerFinishedText: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  timerDisplay: { fontSize: 32, fontWeight: 'bold', color: '#4CAF50', width: '30%' },
  timerButtons: { flexDirection: 'row', flex: 1, justifyContent: 'flex-end', gap: 10 },
  timerBtn: { backgroundColor: '#4285F4', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  timerBtnStop: { backgroundColor: '#ff4444', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  timerBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  finishBtn: { backgroundColor: '#FFD700', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10, elevation: 5, shadowColor: '#FFD700', shadowOpacity: 0.4, shadowRadius: 8 },
  finishBtnDisabled: { backgroundColor: '#b39700', opacity: 0.7 },
  finishBtnText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },

  // 👇 ESTILOS DO NOVO BOTÃO DE CLONAR
  cloneWorkoutBtn: { backgroundColor: '#4285F4', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  cloneWorkoutBtnDisabled: { backgroundColor: '#2c5aa0', opacity: 0.7 },
  cloneWorkoutText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },

  deleteWorkoutBtn: { backgroundColor: '#ff4444', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  deleteWorkoutText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});