import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';

export default function DashboardScreen({ navigation }: any) {
  const { user } = useAuthStore();
  
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Controla se a lista está expandida (aberta) ou fechada.
  const [isExpanded, setIsExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const fetchWorkouts = async () => {
        if (!user?.id) return;
        
        try {
          setIsLoading(true);
          const response = await fetch(`http://192.168.1.80:3000/api/workouts/${user.id}`);
          const data = await response.json();
          setWorkouts(data);
        } catch (error) {
          console.error('❌ Erro ao ir buscar os treinos:', error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchWorkouts();
    }, [user?.id])
  );

  const renderWorkoutCard = ({ item }: any) => (
    <TouchableOpacity 
      style={styles.workoutCard}
      onPress={() => navigation.navigate('WorkoutDetails', { workoutId: item.id })}
    >
      <Text style={styles.workoutName}>{item.name}</Text>
      {item.description ? (
        <Text style={styles.workoutDescription}>{item.description}</Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Painel Principal 📊</Text>
        <Text style={styles.subtitle}>Olá, {user?.name}!</Text>
      </View>

      <TouchableOpacity 
        style={styles.aiButton} 
        onPress={() => navigation.navigate('AIGenerator')}
      >
        <Text style={styles.aiButtonText}>✨ Gerar Treino com IA</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.createButton} 
        onPress={() => navigation.navigate('CreateWorkout')}
      >
        <Text style={styles.createButtonText}>+ Criar Novo Treino Manual</Text>
      </TouchableOpacity>

      {/* O ACORDEÃO AGORA É O CONTENTOR EXTERNO (sem flex) */}
      <View style={styles.accordionContainer}>
        
        {/* O cabeçalho agora tem o fundo e bordas superiores arredondadas */}
        <TouchableOpacity 
          style={[
            styles.expandHeader,
            isExpanded && styles.expandHeaderExpanded // Aplica bordas retas se expandido
          ]} 
          onPress={() => setIsExpanded(!isExpanded)}
        >
          <Text style={styles.sectionTitle}>Os Meus Treinos 💪</Text>
          <Text style={styles.expandIcon}>{isExpanded ? '🔼' : '🔽'}</Text>
        </TouchableOpacity>
        
        {/* SÓ envolvemos o contentor cinzento de conteúdo se expandido */}
        {isExpanded && (
          <View style={styles.listContent}>
            {isLoading ? (
              <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={workouts}
                keyExtractor={(item) => item.id}
                renderItem={renderWorkoutCard}
                contentContainerStyle={styles.flatListContent}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>
                    Ainda não tens treinos. Começa por criar o teu primeiro ali em cima! 🚀
                  </Text>
                }
              />
            )}
          </View>
        )}
      </View>

      {/* US 28: AQUI ESTÁ O NOVO BOTÃO DE HISTÓRICO! */}
      <TouchableOpacity 
        style={styles.historyButton} 
        onPress={() => navigation.navigate('History')}
      >
        <Text style={styles.historyButtonText}>Ver Histórico 📅</Text>
      </TouchableOpacity>

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
  
  aiButton: { backgroundColor: '#8A2BE2', paddingVertical: 15, borderRadius: 8, elevation: 5, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#a350eb' },
  aiButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },

  createButton: { backgroundColor: '#4CAF50', paddingVertical: 15, borderRadius: 8, elevation: 3, alignItems: 'center', marginBottom: 25 },
  createButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  
  // Estilos do Acordeão
  accordionContainer: { marginBottom: 20 },
  expandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    padding: 15,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  expandHeaderExpanded: { 
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  expandIcon: { fontSize: 18 },
  
  // Contentor da lista do acordeão
  listContent: {
    backgroundColor: '#1e1e1e',
    padding: 15,
    paddingTop: 5,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },

  flatListContent: { paddingBottom: 10 },
  
  workoutCard: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  workoutName: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  workoutDescription: { fontSize: 14, color: '#aaaaaa' },
  
  emptyText: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginTop: 30, lineHeight: 22 },

  // US 28: ESTILOS DO NOVO BOTÃO DE HISTÓRICO
  historyButton: { backgroundColor: '#F29900', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginBottom: 15, elevation: 3 },
  historyButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  
  profileButton: { backgroundColor: '#333333', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  profileButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});