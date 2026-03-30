import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function WorkoutDetailsScreen({ route, navigation }: any) {
  // AC 1: Recebemos o ID do treino através dos parâmetros da navegação
  const { workoutId } = route.params;
  
  const [workoutDetails, setWorkoutDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const fetchDetails = async () => {
        try {
          setIsLoading(true);
          // AC 3: Pedimos ao backend os detalhes deste treino específico
          const response = await fetch(`http://192.168.1.80:3000/api/workouts/detail/${workoutId}`);
          const data = await response.json();
          setWorkoutDetails(data);
        } catch (error) {
          console.error('❌ Erro ao ir buscar os detalhes:', error);
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchDetails();
    }, [workoutId])
  );

  // Enquanto está a pensar...
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  // Se der erro a carregar o treino
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

  // Como desenhar um exercício na lista (vamos usar mais na US 15)
  const renderExercise = ({ item }: any) => (
    <View style={styles.exerciseCard}>
      <Text style={styles.exerciseName}>{item.name}</Text>
      <Text style={styles.exerciseDetails}>
        {item.sets} séries x {item.reps} reps {item.weight ? `| ${item.weight}kg` : ''}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Botão para voltar atrás */}
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHeader}>
        <Text style={styles.backHeaderText}>⬅ Voltar ao Painel</Text>
      </TouchableOpacity>

      {/* O Nome e Descrição do Treino */}
      <Text style={styles.title}>{workoutDetails.name}</Text>
      {workoutDetails.description ? (
        <Text style={styles.description}>{workoutDetails.description}</Text>
      ) : null}

      {/* A Lista de Exercícios */}
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Exercícios 🏋️‍♂️</Text>
        <FlatList
          data={workoutDetails.exercises || []}
          keyExtractor={(item) => item.id}
          renderItem={renderExercise}
          // AC 3: A mensagem de estado vazio
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Ainda não tens exercícios neste treino. Vamos tratar disso em breve!
            </Text>
          }
        />
      </View>
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
  listContainer: { flex: 1, backgroundColor: '#1e1e1e', borderRadius: 12, padding: 15 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10 },
  emptyText: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginTop: 30, lineHeight: 22 },
  errorText: { color: '#ff4444', fontSize: 18, textAlign: 'center', marginTop: 50 },
  backButton: { backgroundColor: '#333333', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  backButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  exerciseCard: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#4285F4' },
  exerciseName: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  exerciseDetails: { fontSize: 14, color: '#aaaaaa' }
});