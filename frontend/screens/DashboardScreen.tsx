import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';

export default function DashboardScreen({ navigation }: any) {
  const { user } = useAuthStore();
  
  // Memória local do ecrã para guardar os treinos e o estado de carregamento
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // O useFocusEffect garante que vamos buscar os dados sempre que o ecrã aparece
  // (ex: quando voltas do ecrã de criar um treino novo)
  useFocusEffect(
    useCallback(() => {
      const fetchWorkouts = async () => {
        if (!user?.id) return;
        
        try {
          setIsLoading(true);
          // Fazemos o pedido GET à nossa API
          const response = await fetch(`http://192.168.1.80:3000/api/workouts/${user.id}`);
          const data = await response.json();
          setWorkouts(data); // Guardamos a lista na memória
        } catch (error) {
          console.error('❌ Erro ao ir buscar os treinos:', error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchWorkouts();
    }, [user?.id])
  );

  // Esta função ensina a FlatList como desenhar "um" treino no ecrã (AC 2)
  const renderWorkoutCard = ({ item }: any) => (
    <View style={styles.workoutCard}>
      <Text style={styles.workoutName}>{item.name}</Text>
      {item.description ? (
        <Text style={styles.workoutDescription}>{item.description}</Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Painel Principal 📊</Text>
        <Text style={styles.subtitle}>Olá, {user?.name}!</Text>
      </View>

      {/* Botão Verde - US 11 */}
      <TouchableOpacity 
        style={styles.createButton} 
        onPress={() => navigation.navigate('CreateWorkout')}
      >
        <Text style={styles.createButtonText}>+ Criar Novo Treino</Text>
      </TouchableOpacity>

      {/* A Lista de Treinos - US 12 */}
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Os Meus Treinos 💪</Text>
        
        {isLoading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={workouts}
            keyExtractor={(item) => item.id}
            renderItem={renderWorkoutCard}
            contentContainerStyle={styles.flatListContent}
            // A mensagem de lista vazia (AC 3)
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                Ainda não tens treinos. Começa por criar o teu primeiro ali em cima! 🚀
              </Text>
            }
          />
        )}
      </View>

      {/* Botão Perfil - US 9 */}
      <TouchableOpacity 
        style={styles.profileButton} 
        onPress={() => navigation.navigate('Profile')}
      >
        <Text style={styles.profileButtonText}>Ver o Meu Perfil</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 50 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  subtitle: { fontSize: 18, color: '#4285F4' },
  
  createButton: { backgroundColor: '#4CAF50', paddingVertical: 15, borderRadius: 8, elevation: 3, alignItems: 'center', marginBottom: 25 },
  createButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  
  listContainer: { flex: 1, backgroundColor: '#1e1e1e', borderRadius: 12, padding: 15, marginBottom: 20 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10 },
  flatListContent: { paddingBottom: 10 },
  
  workoutCard: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  workoutName: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  workoutDescription: { fontSize: 14, color: '#aaaaaa' },
  
  emptyText: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginTop: 30, lineHeight: 22 },
  
  profileButton: { backgroundColor: '#333333', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  profileButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});