import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';

// Recebemos o 'navigation' para podermos saltar entre ecrãs
export default function DashboardScreen({ navigation }: any) {
  const { user } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Painel Principal 📊</Text>
      <Text style={styles.subtitle}>Bem-vindo, {user?.name}!</Text>
      
      <Text style={styles.info}>
        Aqui é onde vão aparecer os teus treinos e estatísticas.
      </Text>

      {/* 🚀 NOVO: Botão Principal para Criar Treino (US 11) */}
      <TouchableOpacity 
        style={styles.createButton} 
        onPress={() => navigation.navigate('CreateWorkout')}
      >
        <Text style={styles.createButtonText}>+ Criar Novo Treino</Text>
      </TouchableOpacity>

      {/* Botão antigo para navegar para o Perfil (US 9) */}
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
  container: { 
    flex: 1, 
    backgroundColor: '#121212', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 20 
  },
  title: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: '#ffffff', 
    marginBottom: 10 
  },
  subtitle: { 
    fontSize: 20, 
    color: '#4285F4', 
    marginBottom: 30 
  },
  info: { 
    fontSize: 16, 
    color: '#aaaaaa', 
    textAlign: 'center', 
    marginBottom: 40 // Dei um bocadinho mais de espaço aqui em baixo
  },
  // Estilos do novo botão verde (US 11)
  createButton: { 
    backgroundColor: '#4CAF50', 
    paddingVertical: 15, 
    paddingHorizontal: 30, 
    borderRadius: 8, 
    marginBottom: 20, 
    elevation: 3, 
    width: '100%', 
    alignItems: 'center' 
  },
  createButtonText: { 
    color: '#ffffff', 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  // Estilos do botão cinzento do Perfil (US 9)
  profileButton: { 
    backgroundColor: '#333333', 
    paddingVertical: 12, 
    paddingHorizontal: 25, 
    borderRadius: 8,
    width: '100%',
    alignItems: 'center'
  },
  profileButtonText: { 
    color: '#ffffff', 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
});