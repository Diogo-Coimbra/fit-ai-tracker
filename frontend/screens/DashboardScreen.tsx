import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '../store/useAuthStore'; // Vamos buscar o cérebro!

export default function DashboardScreen() {
  // Pedimos o utilizador atual à memória global
  const { user } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Painel Principal 📊</Text>
      {/* Mostramos o nome do utilizador de forma dinâmica */}
      <Text style={styles.subtitle}>Bem-vindo, {user?.name}!</Text>
      
      <Text style={styles.info}>
        Aqui é onde vão aparecer os teus treinos e estatísticas.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 20,
    color: '#4285F4',
    marginBottom: 30,
  },
  info: {
    fontSize: 16,
    color: '#aaaaaa',
    textAlign: 'center',
  },
});