import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';

export default function HistoryScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const fetchHistory = async () => {
        if (!user?.id) return;
        try {
          setIsLoading(true);
          const response = await fetch(`http://192.168.1.80:3000/api/logs/${user.id}`);
          const data = await response.json();
          setLogs(data);
        } catch (error) {
          console.error('❌ Erro ao ir buscar o histórico:', error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchHistory();
    }, [user?.id])
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ==========================================
  // US 38: FUNÇÃO NATIVA DE PARTILHA
  // ==========================================
  const handleShare = async (workoutName: string, durationMinutes: number) => {
    try {
      const message = `Acabei de destruir o treino ${workoutName} em ${durationMinutes} minutos no Fit AI Tracker! 💪🔥`;
      
      await Share.share({
        message: message,
      });
    } catch (error: any) {
      console.error('❌ Erro ao partilhar:', error.message);
    }
  };

  const renderLog = ({ item }: any) => {
    const workoutName = item.workout?.name || 'Treino Apagado';
    const duration = item.durationMinutes || 0;

    return (
      <View style={styles.logCard}>
        <View style={styles.logIconContainer}>
          <Text style={styles.logIcon}>🏆</Text>
        </View>
        <View style={styles.logInfo}>
          <Text style={styles.workoutName}>{workoutName}</Text>
          <View style={styles.dateRow}>
            <Text style={styles.logDate}>📅 {formatDate(item.createdAt)}</Text>
            {duration > 0 && (
              <Text style={styles.durationText}>
                ⏱️ {duration} min
              </Text>
            )}
          </View>
        </View>
        
        {/* US 38: BOTÃO DE PARTILHAR (AC 1) */}
        <TouchableOpacity 
          style={styles.shareBtn} 
          onPress={() => handleShare(workoutName, duration)}
        >
          <Text style={styles.shareBtnText}>📤</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHeader}>
        <Text style={styles.backHeaderText}>⬅ Voltar ao Painel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Histórico 📅</Text>
      <Text style={styles.subtitle}>O teu suor e dedicação acumulados.</Text>

      {isLoading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 50 }} />
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            data={logs}
            keyExtractor={(item) => item.id}
            renderItem={renderLog}
            contentContainerStyle={styles.flatListContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                Ainda não finalizaste nenhum treino. Vai ao Modo de Treino suar a camisola e volta aqui! 💪
              </Text>
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 50 },
  backHeader: { marginBottom: 20 },
  backHeaderText: { color: '#4CAF50', fontSize: 16, fontWeight: 'bold' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 20 },
  
  listContainer: { flex: 1, backgroundColor: '#1e1e1e', borderRadius: 12, padding: 15 },
  flatListContent: { paddingBottom: 20 },
  
  logCard: { flexDirection: 'row', backgroundColor: '#2a2a2a', padding: 15, borderRadius: 8, marginBottom: 10, alignItems: 'center' },
  logIconContainer: { backgroundColor: '#333', padding: 10, borderRadius: 8, marginRight: 15 },
  logIcon: { fontSize: 24 },
  logInfo: { flex: 1 },
  workoutName: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  logDate: { fontSize: 14, color: '#4285F4' },
  durationText: { color: '#F29900', fontSize: 13, marginLeft: 10, fontWeight: 'bold' },
  
  // Estilos do novo botão de partilha
  shareBtn: { backgroundColor: '#333', padding: 10, borderRadius: 8, marginLeft: 10, borderWidth: 1, borderColor: '#444' },
  shareBtnText: { fontSize: 18 },

  emptyText: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginTop: 30, lineHeight: 22 },
});