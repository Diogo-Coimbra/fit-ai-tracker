import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';

// O navigation entra aqui como "prop"
export default function DashboardScreen({ navigation }: any) {
  const { user } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Painel Principal 📊</Text>
      <Text style={styles.subtitle}>Bem-vindo, {user?.name}!</Text>
      
      <Text style={styles.info}>
        Aqui é onde vão aparecer os teus treinos e estatísticas.
      </Text>

      {/* Botão para navegar para o Perfil */}
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
  container: { flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 10 },
  subtitle: { fontSize: 20, color: '#4285F4', marginBottom: 30 },
  info: { fontSize: 16, color: '#aaaaaa', textAlign: 'center', marginBottom: 50 },
  profileButton: { backgroundColor: '#333333', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 8 },
  profileButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});