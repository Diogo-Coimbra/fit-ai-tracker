import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
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

  // Função para deixar a data com bom aspeto (Ex: 27 abr. 2026, 17:24)
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

  // AC 2: Cartão do histórico com a data e o nome do treino
  const renderLog = ({ item }: any) => (
    <View style={styles.logCard}>
      <View style={styles.logIconContainer}>
        <Text style={styles.logIcon}>🏆</Text>
      </View>
      <View style={styles.logInfo}>
        <Text style={styles.workoutName}>{item.workout?.name || 'Treino Apagado'}</Text>
        <Text style={styles.logDate}>📅 {formatDate(item.createdAt)}</Text>
      </View>
    </View>
  );

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
  logDate: { fontSize: 14, color: '#4285F4' },
  
  emptyText: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginTop: 30, lineHeight: 22 },
});