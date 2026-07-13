import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity, Share, Platform, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

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

  // ==========================================
  // US 41: EXPORTAR PARA CSV (AC 2 & AC 3)
  // ==========================================
  const exportToCSV = async () => {
    if (logs.length === 0) {
      if (Platform.OS === 'web') alert('Ainda não tens treinos para exportar.');
      else Alert.alert('Sem dados', 'Ainda não tens treinos para exportar.');
      return;
    }

    try {
      // 1. Gerar o texto em formato CSV (Cabeçalho + Linhas)
      const headerString = 'Data,Nome do Treino,Duracao (minutos)\n';
      const rowString = logs.map(log => {
        // Obter apenas a data (sem horas) para o Excel ler melhor
        const date = new Date(log.createdAt).toLocaleDateString('pt-PT');
        const name = log.workout?.name || 'Treino Apagado';
        const duration = log.durationMinutes || 0;
        
        // Colocamos o nome entre aspas caso tenha vírgulas
        return `${date},"${name}",${duration}`;
      }).join('\n');

      const csvString = `${headerString}${rowString}`;
      const fileName = `historico_treinos_${new Date().getTime()}.csv`;

      if (Platform.OS === 'web') {
        // Solução nativa para o Browser (faz o download do ficheiro)
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Solução Mobile usando o Expo FileSystem e Sharing
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;
        
        await FileSystem.writeAsStringAsync(fileUri, csvString, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Exportar Histórico de Treinos',
            UTI: 'public.comma-separated-values-text',
          });
        } else {
          Alert.alert('Erro', 'A partilha não está disponível no teu dispositivo.');
        }
      }
    } catch (error) {
      console.error('❌ Erro ao exportar CSV:', error);
      if (Platform.OS === 'web') alert('Não foi possível exportar os dados.');
      else Alert.alert('Erro', 'Não foi possível exportar os dados.');
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

      {/* 👇 US 41: BOTÃO DE EXPORTAR (AC 1) */}
      <TouchableOpacity style={styles.exportButton} onPress={exportToCSV}>
        <Text style={styles.exportButtonText}>📥 Exportar Dados para CSV</Text>
      </TouchableOpacity>

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
  subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 15 },
  
  // Estilo do botão de exportação
  exportButton: { backgroundColor: '#2c5aa0', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#4285F4' },
  exportButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },

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
  
  shareBtn: { backgroundColor: '#333', padding: 10, borderRadius: 8, marginLeft: 10, borderWidth: 1, borderColor: '#444' },
  shareBtnText: { fontSize: 18 },

  emptyText: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginTop: 30, lineHeight: 22 },
});