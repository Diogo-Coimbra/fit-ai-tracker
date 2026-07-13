import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';

export default function DashboardScreen({ navigation }: any) {
  const { user } = useAuthStore();
  
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const [totalLogs, setTotalLogs] = useState(0);
  const [weeklyLogs, setWeeklyLogs] = useState(0);

  // ==========================================
  // US 37: ESTADO PARA O TEMPO TOTAL DE TREINO
  // ==========================================
  const [totalMinutes, setTotalMinutes] = useState(0);
  
  const WEEKLY_GOAL = user?.weeklyGoal || 3; 

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        if (!user?.id) return;
        
        try {
          setIsLoading(true);
          
          const workoutsResponse = await fetch(`http://192.168.1.80:3000/api/workouts/${user.id}`);
          const workoutsData = await workoutsResponse.json();
          setWorkouts(workoutsData);

          const logsResponse = await fetch(`http://192.168.1.80:3000/api/logs/${user.id}`);
          const logsData = await logsResponse.json();
          setTotalLogs(logsData.length || 0);

          // 👇 US 37 (AC 1): Somar todos os minutos do histórico
          const summedMinutes = logsData.reduce((acc: number, log: any) => {
            return acc + (log.durationMinutes || 0);
          }, 0);
          setTotalMinutes(summedMinutes);

          const now = new Date();
          const dayOfWeek = now.getDay() || 7; 
          
          const monday = new Date(now);
          monday.setDate(now.getDate() - dayOfWeek + 1);
          monday.setHours(0, 0, 0, 0);

          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          sunday.setHours(23, 59, 59, 999);

          const thisWeekLogs = logsData.filter((log: any) => {
            const logDate = new Date(log.createdAt);
            return logDate >= monday && logDate <= sunday;
          });

          setWeeklyLogs(thisWeekLogs.length);

        } catch (error) {
          console.error('❌ Erro ao ir buscar os dados do dashboard:', error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchData();
    }, [user?.id])
  );

  // 👇 US 37 (AC 2): Função para formatar o tempo de forma limpa
  const formatTotalTime = (mins: number) => {
    if (mins === 0) return '0m';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

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

  let motivationalText = "Bora começar a semana! 💪";
  if (weeklyLogs > 0 && weeklyLogs < WEEKLY_GOAL) {
    motivationalText = `Faltam ${WEEKLY_GOAL - weeklyLogs} treinos para o objetivo! 🔥`;
  } else if (weeklyLogs >= WEEKLY_GOAL) {
    motivationalText = "Objetivo Atingido! És máquina! 🎉";
  }
  
  const progressPercent = Math.min((weeklyLogs / WEEKLY_GOAL) * 100, 100);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Painel Principal 📊</Text>
        <Text style={styles.subtitle}>Olá, {user?.name}!</Text>
      </View>

      {/* ==========================================
          US 37: NOVA LINHA DE ESTATÍSTICAS (AC 2)
          ========================================== */}
      <View style={styles.statsRow}>
        <View style={[styles.statsCard, styles.halfCard]}>
          <View style={styles.statsInfo}>
            <Text style={styles.statsNumber}>{totalLogs}</Text>
            <Text style={styles.statsLabel}>Treinos{'\n'}Totais</Text>
          </View>
          <Text style={styles.statsIcon}>🏆</Text>
        </View>

        <View style={[styles.statsCard, styles.halfCard]}>
          <View style={styles.statsInfo}>
            {/* O texto do tempo total precisa de ser um pouco menor para caber se for "100h 45m" */}
            <Text style={[styles.statsNumber, { fontSize: 24, color: '#4CAF50' }]}>
              {formatTotalTime(totalMinutes)}
            </Text>
            <Text style={styles.statsLabel}>Tempo{'\n'}Total</Text>
          </View>
          <Text style={styles.statsIcon}>⏱️</Text>
        </View>
      </View>
      {/* ========================================== */}

      <View style={styles.weeklyContainer}>
        <View style={styles.weeklyHeader}>
          <Text style={styles.weeklyTitle}>Progresso Semanal</Text>
          <Text style={styles.weeklyGoalText}>{weeklyLogs} / {WEEKLY_GOAL}</Text>
        </View>
        
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
        
        <Text style={styles.weeklyMotivation}>{motivationalText}</Text>
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

      <View style={styles.accordionContainer}>
        <TouchableOpacity 
          style={[styles.expandHeader, isExpanded && styles.expandHeaderExpanded]} 
          onPress={() => setIsExpanded(!isExpanded)}
        >
          <Text style={styles.sectionTitle}>Os Meus Treinos 💪</Text>
          <Text style={styles.expandIcon}>{isExpanded ? '🔼' : '🔽'}</Text>
        </TouchableOpacity>
        
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
  
  // 👇 US 37: NOVOS ESTILOS PARA METER OS CARTÕES LADO A LADO
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  halfCard: { flex: 1, marginHorizontal: 5, padding: 15 },
  
  statsCard: { backgroundColor: '#1e1e1e', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#333' },
  statsInfo: { flex: 1 },
  statsNumber: { fontSize: 32, fontWeight: 'bold', color: '#FFD700', marginBottom: 2 },
  statsLabel: { fontSize: 12, color: '#aaaaaa', textTransform: 'uppercase', fontWeight: 'bold' },
  statsIcon: { fontSize: 28, opacity: 0.8 },

  weeklyContainer: { backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginBottom: 25, borderWidth: 1, borderColor: '#333' },
  weeklyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  weeklyTitle: { fontSize: 16, color: '#fff', fontWeight: 'bold' },
  weeklyGoalText: { fontSize: 16, color: '#4CAF50', fontWeight: 'bold' },
  progressBarBg: { height: 12, backgroundColor: '#333', borderRadius: 6, overflow: 'hidden', marginBottom: 10 },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 6 },
  weeklyMotivation: { fontSize: 14, color: '#aaaaaa', fontStyle: 'italic', textAlign: 'center' },

  aiButton: { backgroundColor: '#8A2BE2', paddingVertical: 15, borderRadius: 8, elevation: 5, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#a350eb' },
  aiButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },

  createButton: { backgroundColor: '#4CAF50', paddingVertical: 15, borderRadius: 8, elevation: 3, alignItems: 'center', marginBottom: 25 },
  createButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  
  accordionContainer: { marginBottom: 20 },
  expandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  expandHeaderExpanded: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 1, borderBottomColor: '#333' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  expandIcon: { fontSize: 18 },
  
  listContent: { backgroundColor: '#1e1e1e', padding: 15, paddingTop: 5, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  flatListContent: { paddingBottom: 10 },
  
  workoutCard: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  workoutName: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  workoutDescription: { fontSize: 14, color: '#aaaaaa' },
  emptyText: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginTop: 30, lineHeight: 22 },

  historyButton: { backgroundColor: '#F29900', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginBottom: 15, elevation: 3 },
  historyButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  
  profileButton: { backgroundColor: '#333333', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  profileButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});