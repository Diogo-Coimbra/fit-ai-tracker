import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, FlatList, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function WorkoutDetailsScreen({ route, navigation }: any) {
  const { workoutId } = route.params;
  
  const [workoutDetails, setWorkoutDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  // Função isolada para apagar o exercício na base de dados
  const executeDeleteExercise = async (exerciseId: string) => {
    try {
      const response = await fetch(`http://192.168.1.80:3000/api/exercises/${exerciseId}`, {
        method: 'DELETE',
      });
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

  // Função isolada para apagar o treino na base de dados
  const executeDeleteWorkout = async () => {
    try {
      const response = await fetch(`http://192.168.1.80:3000/api/workouts/${workoutId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        navigation.navigate('Dashboard');
      } else {
        alert('Erro: Não foi possível apagar o treino.');
      }
    } catch (error) {
      console.error('❌ Erro ao apagar treino:', error);
    }
  };

  // Lidar com o clique no caixote do lixo do exercício
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

  // Lidar com o botão vermelho de apagar treino inteiro
  const handleDeleteWorkout = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Tens a certeza que queres destruir este treino e TODOS os seus exercícios? Esta ação não pode ser revertida.');
      if (confirmed) executeDeleteWorkout();
    } else {
      Alert.alert(
        'Apagar Treino',
        'Tens a certeza que queres destruir este treino e TODOS os seus exercícios? Esta ação não pode ser revertida.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Destruir Treino', style: 'destructive', onPress: executeDeleteWorkout },
        ]
      );
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!workoutDetails) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Treino não encontrado!</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>⬅ Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderExercise = ({ item }: any) => (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName}>{item.name}</Text>
        <Text style={styles.exerciseDetails}>
          {item.sets} séries x {item.reps} reps {item.weight ? `| ${item.weight}kg` : ''}
        </Text>
      </View>
      
      <TouchableOpacity 
        style={styles.deleteExerciseBtn}
        onPress={() => handleDeleteExercise(item.id, item.name)}
      >
        <Text style={styles.deleteIconText}>🗑️</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHeader}>
        <Text style={styles.backHeaderText}>⬅ Voltar ao Painel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{workoutDetails.name}</Text>
      {workoutDetails.description ? (
        <Text style={styles.description}>{workoutDetails.description}</Text>
      ) : null}

      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Exercícios 🏋️‍♂️</Text>
        
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => navigation.navigate('AddExercise', { workoutId: workoutDetails.id })}
        >
          <Text style={styles.addButtonText}>+ Adicionar Exercício</Text>
        </TouchableOpacity>

        <FlatList
          data={workoutDetails.exercises || []}
          keyExtractor={(item) => item.id}
          renderItem={renderExercise}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Ainda não tens exercícios neste treino. Começa por adicionar o primeiro aqui em cima!
            </Text>
          }
        />
      </View>

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
  description: { fontSize: 16, color: '#aaaaaa', marginBottom: 30 },
  listContainer: { flex: 1, backgroundColor: '#1e1e1e', borderRadius: 12, padding: 15, marginBottom: 20 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10 },
  
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
  deleteExerciseBtn: { padding: 5 },
  deleteIconText: { fontSize: 20 },

  deleteWorkoutBtn: { backgroundColor: '#ff4444', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  deleteWorkoutText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});